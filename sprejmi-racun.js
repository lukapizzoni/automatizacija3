// POST /api/sprejmi-racun
// Vhod:  { besedilo: "surovo besedilo iz PDF racuna", ime_datoteke, vlozitelj }
// Kaj naredi:
//   1. Preveri, da je to sploh racun (ne nekaj drugega) -- "dovoljenje" za tip dokumenta
//   2. AI izlusci strukturirane podatke iz racuna
//   3. Shrani zapis v tabelo `dokumenti` s statusom "caka_pregled"
//   4. Zabelezi aktivnost v tabelo `aktivnosti` (za enoten dashboard)
// Izhod: { uspesno: true, dokument: {...} }

const OpenAI = require("openai");
const { getSupabase } = require("../lib/supabase");

// Tipi dokumentov, ki jih AI SME obdelovati zaenkrat.
// (kasneje razsirimo -- "dovoljenje" po tipu dokumenta)
const DOVOLJENI_TIPI = ["racun"];

const SISTEM_NAVODILO = `Si AI knjigovodski asistent. Dobil bos surovo besedilo,
izlusceno iz skeniranega racuna (PDF ali fotografija). Najprej presodi, ali je to
sploh RACUN (faktura/invoice) -- ce ni, to jasno oznaci.

Vrni STROGO ta JSON format, brez dodatnega besedila:

{
  "je_racun": true/false,
  "izdajatelj": {
    "naziv": "", "naslov": "", "davcna_stevilka": "", "ID_za_DDV": ""
  },
  "prejemnik": {
    "naziv": "", "naslov": ""
  },
  "racun": {
    "stevilka_racuna": "",
    "datum_izdaje": "YYYY-MM-DD ali null",
    "datum_zapadlosti": "YYYY-MM-DD ali null",
    "znesek_brez_ddv": 0,
    "ddv_stopnja": "",
    "znesek_ddv": 0,
    "znesek_skupaj": 0,
    "valuta": "EUR"
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
    const { besedilo, ime_datoteke, vlozitelj } = req.body || {};
    if (!besedilo || !besedilo.trim()) {
      return res.status(400).json({ uspesno: false, napaka: "Manjka besedilo dokumenta." });
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
    const supabase = getSupabase();
    const { data: dokument, error } = await supabase
      .from("dokumenti")
      .insert({
        tip: "racun",
        vlozitelj: vlozitelj || izlusceno?.izdajatelj?.naziv || null,
        ime_datoteke: ime_datoteke || null,
        surovo_besedilo: besedilo,
        izlusceni_podatki: izlusceno,
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

    return res.status(200).json({ uspesno: true, dokument });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ uspesno: false, napaka: String(err && err.message ? err.message : err) });
  }
};
