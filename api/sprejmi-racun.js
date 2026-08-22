// POST /api/sprejmi-racun
// Vhod:  { besedilo, ime_datoteke, vlozitelj, pdf_base64 }
//   pdf_base64 = cela PDF datoteka, zakodirana v base64 (izbirno, a priporočeno --
//                omogoča, da racunovodja v nadzorni plosci vidi original zraven izluscka)
// Kaj naredi:
//   1. Preveri, da je to sploh racun (ne nekaj drugega) -- "dovoljenje" za tip dokumenta
//   2. AI izlusci strukturirane podatke iz racuna
//   3. Nalozi PDF v Supabase Storage (bucket "racuni") in dobi javni URL
//   4. Shrani zapis v tabelo `dokumenti` s statusom "caka_pregled"
//   5. Zabelezi aktivnost v tabelo `aktivnosti` (za enoten dashboard)
// Izhod: { uspesno: true, dokument: {...} }

const OpenAI = require("openai");
const { getSupabase } = require("../lib/supabase");

// Tipi dokumentov, ki jih AI SME obdelovati zaenkrat.
// (kasneje razsirimo -- "dovoljenje" po tipu dokumenta)
const DOVOLJENI_TIPI = ["racun"];

const SISTEM_NAVODILO = `Si AI knjigovodski asistent za slovensko podjetje, zavezano za DDV.
Dobil bos surovo besedilo, izlusceno iz skeniranega PREJETEGA racuna (racun, ki ga je
podjetju izdal dobavitelj -- torej racun za NABAVO, ne za prodajo). Najprej presodi, ali
je to sploh RACUN (faktura/invoice) -- ce ni, to jasno oznaci.

Vrni STROGO ta JSON format, brez dodatnega besedila. Zneski morajo biti razdeljeni po
DDV stopnjah, ker to zahteva uradna FURS shema za "Knjigo prejetih racunov" (KPR):

{
  "je_racun": true/false,
  "izdajatelj": {
    "naziv": "", "naslov": "", "drzava_koda": "SI (ISO-2 koda drzave dobavitelja)",
    "davcna_stevilka": "", "ID_za_DDV": "(brez drzavne predpone, npr. samo '40556781', ne 'SI40556781')"
  },
  "prejemnik": {
    "naziv": "", "naslov": ""
  },
  "racun": {
    "stevilka_racuna": "",
    "datum_izdaje": "YYYY-MM-DD ali null",
    "datum_prejema": "YYYY-MM-DD ali null (ce ni navedeno, pusti null -- uporabnik ali datum_izdaje se uporabi kot priblizek)",
    "znesek_brez_ddv": 0,
    "znesek_skupaj": 0,
    "valuta": "EUR"
  },
  "ddv_razdelitev": {
    "osnova_22": 0, "ddv_22": 0,
    "osnova_9_5": 0, "ddv_9_5": 0,
    "osnova_5": 0, "ddv_5": 0,
    "oproscen_ddv": 0
  },
  "postavke": [
    {"opis": "", "kolicina": 0, "cena_na_enoto": 0, "vrednost": 0}
  ],
  "kategorije_za_pregled": {
    "manjkajo_kljucni_podatki": true/false,
    "opomba": "kratka opomba za racunovodjo, ce je kaj nenavadnega"
  },
  "zaupanje_izluscka": "visoko/srednje/nizko + kratka utemeljitev"
}

Pravilo za "ddv_razdelitev": za VSAKO postavko/znesek na racunu presodi po kateri DDV
stopnji je obdavcen (22% je splosna stopnja v Sloveniji, 9.5% je znizana stopnja za hrano/
knjige/zdravila ipd., 5% je za nekatere publikacije, 0%/oproscen za izvoz ali oproscene
storitve) in ustrezen znesek osnove ter DDV razporedi v pravo polje. Vsota vseh "osnova_*"
polj + "oproscen_ddv" mora biti enaka "znesek_brez_ddv". Ce racun nima locenih stopenj in
je samo ena skupna stopnja navedena, daj celoten znesek v ustrezno polje te stopnje.

Ce podatka ni v besedilu, pusti prazno/0/null. Ne izmisljuj si zneskov.`;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ uspesno: false, napaka: "Samo POST je dovoljen." });
  }

  try {
    const { besedilo, ime_datoteke, vlozitelj, pdf_base64 } = req.body || {};
    if (!besedilo || !besedilo.trim()) {
      return res.status(400).json({ uspesno: false, napaka: "Manjka besedilo dokumenta." });
    }

    const supabase = getSupabase();

    // --- 0. Nalozi PDF v Storage (ce je poslan) ---
    let pdf_url = null;
    let napaka_nalaganja_pdf_besedilo = null; // ZACASNO -- za diagnostiko, vrnemo v odgovoru
    if (pdf_base64) {
      const varnoIme = (ime_datoteke || "racun.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
      const pot = `${Date.now()}_${varnoIme}`;
      const binarniPodatki = Buffer.from(pdf_base64, "base64");

      const { error: napakaNalaganja } = await supabase.storage
        .from("racuni")
        .upload(pot, binarniPodatki, { contentType: "application/pdf", upsert: false });

      if (napakaNalaganja) {
        console.error("Napaka pri nalaganju PDF v Storage:", napakaNalaganja);
        napaka_nalaganja_pdf_besedilo = String(napakaNalaganja.message || napakaNalaganja);
        // Ne prekinemo celotnega postopka -- AI izlusek je vseeno koristen tudi brez PDF predogleda.
      } else {
        const { data: javniLink } = supabase.storage.from("racuni").getPublicUrl(pot);
        pdf_url = javniLink?.publicUrl || null;
      }
    }

    // --- 1. AI izlusci podatke ---
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const odgovor = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SISTEM_NAVODILO },
        { role: "user", content: besedilo },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    const izlusceno = JSON.parse(odgovor.choices[0].message.content);

    // --- 2. Preveri "dovoljenje" za tip dokumenta ---
    if (izlusceno.je_racun === false) {
      return res.status(200).json({
        uspesno: true,
        zavrnjeno_ker_ni_racun: true,
        sporocilo: "AI je presodil, da to ni račun, zato ga ni obdelal naprej.",
        izlusceno,
      });
    }
    if (!DOVOLJENI_TIPI.includes("racun")) {
      return res.status(403).json({ uspesno: false, napaka: "AI nima dovoljenja za ta tip dokumenta." });
    }

    // --- 3. Shrani v bazo (Supabase) ---
    const { data: dokument, error } = await supabase
      .from("dokumenti")
      .insert({
        tip: "racun",
        vlozitelj: vlozitelj || izlusceno?.izdajatelj?.naziv || null,
        ime_datoteke: ime_datoteke || null,
        surovo_besedilo: besedilo,
        izlusceni_podatki: izlusceno,
        pdf_url: pdf_url,
        status: "caka_pregled",
      })
      .select()
      .single();

    if (error) throw error;

    // --- 4. Zabelezi aktivnost (za enoten dashboard) ---
    await supabase.from("aktivnosti").insert({
      avtomatizacija: "dokumentna",
      opis: `Prejet in izlusčen račun${dokument.vlozitelj ? " od " + dokument.vlozitelj : ""}`,
      podrobnosti: { dokument_id: dokument.id, zaupanje: izlusceno.zaupanje_izluscka },
    });

    return res.status(200).json({ uspesno: true, dokument, napaka_nalaganja_pdf_besedilo });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ uspesno: false, napaka: String(err && err.message ? err.message : err) });
  }
};
