// Vercel serverless funkcija (deluje BREZ Next.js — Vercel jo samodejno zazna,
// ker leži v mapi /api na korenu projekta).
//
// Pot do te funkcije po objavi: https://<tvoja-domena>/api/izlusci-dokument

const OpenAI = require("openai");

const SISTEM_NAVODILO = `Si AI asistent za hotel/gostinski obrat. Iz surovega besedila
povpraševanja gosta (izluščenega iz skeniranega PDF-ja ali fotografije) izlušči
podatke v STROGO ta JSON format, brez dodatnega besedila:

{
  "gost": {"ime_priimek": "", "email": "", "telefon": "", "podjetje": ""},
  "rezervacija": {
    "prihod": "YYYY-MM-DD ali null",
    "odhod": "YYYY-MM-DD ali null",
    "stevilo_oseb": 0,
    "opis_dogodka_ali_bivanja": ""
  },
  "posebne_zelje": ["seznam", "posebnih", "zelja"],
  "kategorije_za_pregled": {
    "cenovna_ponudba_potrebna": true,
    "alergije_ali_posebna_prehrana": false,
    "hisni_ljubljencki": false,
    "posebna_oprema_ali_zahteve": false
  },
  "zaupanje_izluscka": "visoko/srednje/nizko + kratka utemeljitev"
}

Če podatka ni v besedilu, pusti prazno, ne izmišljuj si.`;

module.exports = async (req, res) => {
  // CORS (za vsak slučaj, če testna stran teče na drugi domeni)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ uspesno: false, napaka: "Samo POST je dovoljen." });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        uspesno: false,
        napaka: "OPENAI_API_KEY ni nastavljen na strežniku (Vercel Environment Variables).",
      });
    }

    const { besedilo } = req.body || {};
    if (!besedilo || !besedilo.trim()) {
      return res.status(400).json({ uspesno: false, napaka: "Manjka besedilo dokumenta." });
    }

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

    const podatki = JSON.parse(odgovor.choices[0].message.content);
    return res.status(200).json({ uspesno: true, podatki });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ uspesno: false, napaka: String(err && err.message ? err.message : err) });
  }
};
