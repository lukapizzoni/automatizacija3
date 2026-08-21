// POST /api/posodobi-status
// Vhod: { id, status, opomba_racunovodje }
// status sme biti: "odobreno" | "zavrnjeno" | "pripravljeno_za_oddajo"
//
// "pripravljeno_za_oddajo" pomeni: racunovodja je odobril in oznacil, da je
// dokument pripravljen za dejansko oddajo (npr. na FURS) -- SAMO OZNACBA,
// AI TUKAJ SAM NIC NE POSILJA na FURS (to je zavestna odlocitev zaradi
// pravne obcutljivosti avtomatskega posiljanja na drzavne institucije).

const { getSupabase } = require("../lib/supabase");

const DOVOLJENI_STATUSI = ["odobreno", "zavrnjeno", "pripravljeno_za_oddajo", "caka_pregled"];

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ uspesno: false, napaka: "Samo POST je dovoljen." });
  }

  try {
    const { id, status, opomba_racunovodje } = req.body || {};
    if (!id || !status) {
      return res.status(400).json({ uspesno: false, napaka: "Manjka id ali status." });
    }
    if (!DOVOLJENI_STATUSI.includes(status)) {
      return res.status(400).json({ uspesno: false, napaka: "Neveljaven status." });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("dokumenti")
      .update({
        status,
        opomba_racunovodje: opomba_racunovodje || null,
        posodobljeno: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await supabase.from("aktivnosti").insert({
      avtomatizacija: "dokumentna",
      opis: `Računovodja spremenil status dokumenta na "${status}"`,
      podrobnosti: { dokument_id: id, status, opomba_racunovodje },
    });

    return res.status(200).json({ uspesno: true, dokument: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ uspesno: false, napaka: String(err && err.message ? err.message : err) });
  }
};
