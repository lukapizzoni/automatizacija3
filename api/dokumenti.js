// GET /api/dokumenti            -> vsi dokumenti, najnovejsi prvi
// GET /api/dokumenti?status=caka_pregled  -> filtrirano po statusu

const { getSupabase } = require("../lib/supabase");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    return res.status(405).json({ uspesno: false, napaka: "Samo GET je dovoljen." });
  }
  try {
    const supabase = getSupabase();
    let query = supabase.from("dokumenti").select("*").order("ustvarjeno", { ascending: false });

    if (req.query && req.query.status) {
      query = query.eq("status", req.query.status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.status(200).json({ uspesno: true, dokumenti: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ uspesno: false, napaka: String(err && err.message ? err.message : err) });
  }
};
