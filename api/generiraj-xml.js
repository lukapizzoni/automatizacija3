// GET /api/generiraj-xml?obdobje_od=2026-08-01&obdobje_do=2026-08-31
//
// Zgradi XML datoteko za "Knjigo prejetih racunov" (KPR) po uradni FURS shemi
// DDV_KIR_KPR_1.xsd (eDavki), iz vseh dokumentov s statusom "pripravljeno_za_oddajo"
// znotraj izbranega obdobja.
//
// POMEMBNO -- PRESNI OPOZORILO:
// Ta XML je zgrajen po najboljsi interpretaciji uradne sheme (pridobljene iz
// javno dostopnega XSD na edavki.durs.si). Pred prvo resnicno oddajo na FURS
// NUJNO preveri strukturo z racunovodjo ali FURS tehnicno podporo -- avtomatsko
// generiranje davcnih dokumentov brez cloveskega preverjanja ni priporocljivo.
// Ta funkcija SAMA NE ODDAJA nicesar na FURS -- samo pripravi datoteko za prenos.
//
// Rabi okoljsko spremenljivko: DAVCNA_STEVILKA_PODJETJA (8-mestna davcna
// stevilka VASEGA podjetja, brez "SI" predpone -- npr. "12345678")

const { getSupabase } = require("../lib/supabase");

function xmlEscape(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDatum(d) {
  if (!d) return "";
  return d; // ze v formatu YYYY-MM-DD, kar XSD xs:date pricakuje
}

function fmtZnesek(n) {
  return Number(n || 0).toFixed(2);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    return res.status(405).json({ uspesno: false, napaka: "Samo GET je dovoljen." });
  }

  try {
    const davcnaStevilkaPodjetja = process.env.DAVCNA_STEVILKA_PODJETJA;
    if (!davcnaStevilkaPodjetja) {
      return res.status(500).json({
        uspesno: false,
        napaka: "Manjka DAVCNA_STEVILKA_PODJETJA (Vercel Environment Variables) -- davčna številka vašega podjetja, 8 mest, brez SI predpone.",
      });
    }

    const obdobjeOd = req.query && req.query.obdobje_od;
    const obdobjeDo = req.query && req.query.obdobje_do;
    if (!obdobjeOd || !obdobjeDo) {
      return res.status(400).json({ uspesno: false, napaka: "Manjkata parametra obdobje_od in obdobje_do (YYYY-MM-DD)." });
    }

    const supabase = getSupabase();
    const { data: dokumenti, error } = await supabase
      .from("dokumenti")
      .select("*")
      .eq("status", "pripravljeno_za_oddajo")
      .eq("tip", "racun")
      .order("ustvarjeno", { ascending: true });

    if (error) throw error;

    // Filtriraj po datumu izdaje znotraj obdobja
    const izbrani = (dokumenti || []).filter((d) => {
      const datum = d?.izlusceni_podatki?.racun?.datum_izdaje;
      if (!datum) return false;
      return datum >= obdobjeOd && datum <= obdobjeDo;
    });

    if (izbrani.length === 0) {
      return res.status(200).json({
        uspesno: true,
        opozorilo: "Ni dokumentov s statusom 'pripravljeno_za_oddajo' v tem obdobju.",
        stevilo: 0,
      });
    }

    // Format obdobja za OBDOBJE polje v shemi -- 4-mestni vzorec (MMYY).
    // OPOMBA: format ni bil 100% potrjen iz uradne dokumentacije (glej opozorilo
    // na vrhu datoteke) -- preverite pred uporabo.
    const obdobjeMMYY = (datumIzdaje) => {
      const [leto, mesec] = datumIzdaje.split("-");
      return `${mesec}${leto.slice(2)}`;
    };

    const kprVrstice = izbrani
      .map((d, idx) => {
        const p = d.izlusceni_podatki || {};
        const izd = p.izdajatelj || {};
        const rac = p.racun || {};
        const ddv = p.ddv_razdelitev || {};

        const datumPrejema = rac.datum_prejema || rac.datum_izdaje || "";
        const nazivInNaslov = `${izd.naziv || ""}${izd.naslov ? ", " + izd.naslov : ""}`;

        return `    <KPR>
      <ZAPST>${idx + 1}</ZAPST>
      <OBDOBJE>${xmlEscape(obdobjeMMYY(rac.datum_izdaje))}</OBDOBJE>
      <P2>${fmtDatum(datumPrejema)}</P2>
      <P3>${xmlEscape(rac.stevilka_racuna)}</P3>
      <P4>${fmtDatum(datumPrejema)}</P4>
      <P5>${fmtDatum(rac.datum_izdaje)}</P5>
      <P6>${xmlEscape(nazivInNaslov)}</P6>
      <P7>${xmlEscape(izd.drzava_koda || "SI")}</P7>
      <P7DS>${xmlEscape(izd.ID_za_DDV)}</P7DS>
      <P8>${fmtZnesek(rac.znesek_brez_ddv)}</P8>
      <P18>${fmtZnesek(ddv.ddv_22)}</P18>
      <P19>${fmtZnesek(ddv.ddv_9_5)}</P19>
      <P20>${fmtZnesek(ddv.ddv_5)}</P20>
    </KPR>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DDV_KIR_KPR xmlns="http://edavki.durs.si/Documents/Schemas/DDV_KIR_KPR_1.xsd">
  <Glava>
    <TaxPayerID>${xmlEscape(davcnaStevilkaPodjetja)}</TaxPayerID>
    <OBDOBJE_OD>${fmtDatum(obdobjeOd)}</OBDOBJE_OD>
    <OBDOBJE_DO>${fmtDatum(obdobjeDo)}</OBDOBJE_DO>
    <KIR>false</KIR>
    <KPR>true</KPR>
    <ODBDELEZ>true</ODBDELEZ>
  </Glava>
  <Lista_KPR>
${kprVrstice}
  </Lista_KPR>
</DDV_KIR_KPR>
`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="KPR_${obdobjeOd}_${obdobjeDo}.xml"`
    );
    return res.status(200).send(xml);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ uspesno: false, napaka: String(err && err.message ? err.message : err) });
  }
};
