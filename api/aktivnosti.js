// GET /api/aktivnosti -> zadnjih 100 dogodkov vseh avtomatizacij (za enoten dashboard)

const { getSupabase } = require("../lib/supabase");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    return res.status(405).json({ uspesno: false, napaka: "Samo GET je dovoljen." });
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("aktivnosti")
      .select("*")
      .order("ustvarjeno", { ascending: false })
      .limit(100);
    if (error) throw error;
    return res.status(200).json({ uspesno: true, aktivnosti: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ uspesno: false, napaka: String(err && err.message ? err.message : err) });
  }
};
