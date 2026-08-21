// Skupna povezava do Supabase — uporabljajo jo vse /api funkcije.
// Rabi okoljske spremenljivke na Vercelu:
//   SUPABASE_URL              (Project Settings -> API -> Project URL)
//   SUPABASE_SERVICE_ROLE_KEY (Project Settings -> API -> service_role key, SKRIVNO!)
//
// service_role ključ obide RLS (row level security) — zato ga uporabljamo samo
// tukaj, na strežniku, NIKOLI ga ne pošiljamo v brskalnik/frontend.

const { createClient } = require("@supabase/supabase-js");

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Manjkata SUPABASE_URL ali SUPABASE_SERVICE_ROLE_KEY (Vercel Environment Variables)."
    );
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

module.exports = { getSupabase };
