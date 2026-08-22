// POST /api/sprejmi-racun
// Vhod:  { besedilo, ime_datoteke, vlozitelj, pdf_base64 }
// Rocna oddaja racuna prek oddaj-racun.html -- klice skupno logiko iz lib/obdelaj-racun.js
// (isto logiko uporablja tudi api/preveri-posto.js za racune, prejete po e-posti).

const { obdelajRacun } = require("../lib/obdelaj-racun");

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

    const rezultat = await obdelajRacun({ besedilo, ime_datoteke, vlozitelj, pdf_base64, vir: "rocno" });
    return res.status(200).json(rezultat);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ uspesno: false, napaka: String(err && err.message ? err.message : err) });
  }
};
