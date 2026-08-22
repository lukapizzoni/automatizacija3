// Skupna logika za obdelavo enega prejetega racuna (PDF -> AI izlusek -> Storage -> baza).
// Uporabljata jo TAKO api/sprejmi-racun.js (rocno nalaganje na strani) KOT
// api/preveri-posto.js (samodejno prebiranje Gmail nabiralnika).

const OpenAI = require("openai");
const { getSupabase } = require("./supabase");

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

const DOVOLJENI_TIPI = ["racun"];

// vir: "rocno" (oddaj-racun.html) ali "mail" (samodejno iz Gmail nabiralnika)
async function obdelajRacun({ besedilo, ime_datoteke, vlozitelj, pdf_base64, vir }) {
  const supabase = getSupabase();

  // --- 0. Nalozi PDF v Storage (ce je poslan) ---
  let pdf_url = null;
  let napaka_nalaganja_pdf_besedilo = null;
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
    return { uspesno: true, zavrnjeno_ker_ni_racun: true, izlusceno };
  }
  if (!DOVOLJENI_TIPI.includes("racun")) {
    throw new Error("AI nima dovoljenja za ta tip dokumenta.");
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

  // --- 4. Zabelezi aktivnost ---
  await supabase.from("aktivnosti").insert({
    avtomatizacija: "dokumentna",
    opis: `Prejet in izlusčen račun${dokument.vlozitelj ? " od " + dokument.vlozitelj : ""}${vir === "mail" ? " (prek e-pošte)" : ""}`,
    podrobnosti: { dokument_id: dokument.id, zaupanje: izlusceno.zaupanje_izluscka, vir: vir || "rocno" },
  });

  return { uspesno: true, dokument, napaka_nalaganja_pdf_besedilo };
}

module.exports = { obdelajRacun };
