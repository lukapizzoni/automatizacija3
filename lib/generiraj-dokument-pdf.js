// Generira "lep, standardiziran" PDF izpis izluscenih podatkov racuna -- v vizualni
// obliki, ki jo uporablja podjetje pri izdajanju svojih racunov (glej primer, ki ga je
// uporabnik poslal). To NI uradni dokument za oddajo na FURS -- FURS sprejema samo
// XML (KPR/KIR prek eDavki), ne posameznih PDF-jev. Ta PDF je namenjen LAZJEMU
// INTERNEMU PREGLEDU/ARHIVU -- prikaze se POD originalnim skeniranim PDF-jem v
// nadzorni plosci, da ima racunovodja podatke tudi v cisti, urejeni obliki.

const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const fs = require("fs");
const path = require("path");

// Standardne PDF pisave (Helvetica ipd.) ne podpirajo slovenskih sumnikov (c, s, z),
// zato vgradimo pravo Unicode pisavo (DejaVu Sans), ki jih podpira.
const POT_PISAVA_NAVADNA = path.join(__dirname, "..", "assets", "DejaVuSans.ttf");
const POT_PISAVA_KREPKA = path.join(__dirname, "..", "assets", "DejaVuSans-Bold.ttf");

function fmt(n) {
  return Number(n || 0).toFixed(2) + " €";
}
function fmtDatum(d) {
  if (!d) return "—";
  const [l, m, dan] = d.split("-");
  return dan && m && l ? `${dan}.${m}.${l}` : d;
}

async function generirajDokumentPdf(izlusceniPodatki, meta) {
  const p = izlusceniPodatki || {};
  const izd = p.izdajatelj || {};
  const prej = p.prejemnik || {};
  const rac = p.racun || {};
  const ddv = p.ddv_razdelitev || {};
  const postavke = p.postavke || [];

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const stran = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(fs.readFileSync(POT_PISAVA_NAVADNA));
  const fontBold = await doc.embedFont(fs.readFileSync(POT_PISAVA_KREPKA));

  const crna = rgb(0.1, 0.1, 0.1);
  const siva = rgb(0.45, 0.45, 0.45);
  const rdeca = rgb(0.75, 0.25, 0.1);

  let y = 800;
  const levo = 50;
  const desno = 545;

  const pisi = (besedilo, x, yy, { velikost = 10, f = font, barva = crna, poravnaj = "levo" } = {}) => {
    const sirina = f.widthOfTextAtSize(String(besedilo), velikost);
    const xx = poravnaj === "desno" ? x - sirina : x;
    stran.drawText(String(besedilo), { x: xx, y: yy, size: velikost, font: f, color: barva });
  };

  // --- Glava: izdajatelj (levo) / davcni podatki (desno) ---
  pisi(izd.naziv || "—", levo, y, { f: fontBold, velikost: 11 });
  y -= 14;
  if (izd.naslov) { pisi(izd.naslov, levo, y); y -= 14; }
  y -= 10;

  let yDesno = 800;
  pisi(`Davčna številka: ${izd.davcna_stevilka || "—"}`, desno, yDesno, { poravnaj: "desno", velikost: 9.5 });
  yDesno -= 13;
  pisi(`ID za DDV: ${izd.ID_za_DDV ? (izd.drzava_koda || "SI") + izd.ID_za_DDV : "—"}`, desno, yDesno, { poravnaj: "desno", velikost: 9.5 });
  yDesno -= 13;
  pisi(`Država: ${izd.drzava_koda || "SI"}`, desno, yDesno, { poravnaj: "desno", velikost: 9.5 });

  y = Math.min(y, yDesno) - 20;
  stran.drawLine({ start: { x: levo, y }, end: { x: desno, y }, thickness: 0.7, color: rgb(0.7, 0.7, 0.7) });
  y -= 26;

  // --- Prejemnik (levo) / Podatki o racunu (desno) ---
  const yZacetekBloka = y;
  pisi(prej.naziv || "—", levo, y, { f: fontBold, velikost: 10.5 });
  y -= 14;
  if (prej.naslov) { pisi(prej.naslov, levo, y); y -= 14; }

  let yr = yZacetekBloka;
  pisi(`RAČUN št. ${rac.stevilka_racuna || "—"}`, desno, yr, { f: fontBold, velikost: 11, poravnaj: "desno" });
  yr -= 16;
  pisi(`Datum izdaje: ${fmtDatum(rac.datum_izdaje)}`, desno, yr, { poravnaj: "desno", velikost: 9.5 });
  yr -= 13;
  pisi(`Datum prejema: ${fmtDatum(rac.datum_prejema)}`, desno, yr, { poravnaj: "desno", velikost: 9.5 });

  y = Math.min(y, yr) - 30;

  // --- Tabela postavk ---
  const stolpci = [
    { naslov: "OPIS", x: levo, sirina: 260 },
    { naslov: "KOL.", x: levo + 270, sirina: 45 },
    { naslov: "CENA/ENOTO", x: levo + 320, sirina: 90 },
    { naslov: "VREDNOST", x: desno, sirina: 0, poravnaj: "desno" },
  ];
  stran.drawLine({ start: { x: levo, y: y + 14 }, end: { x: desno, y: y + 14 }, thickness: 0.7, color: rgb(0.7, 0.7, 0.7) });
  stolpci.forEach((s) => pisi(s.naslov, s.poravnaj === "desno" ? s.x : s.x, y, { f: fontBold, velikost: 9, barva: siva, poravnaj: s.poravnaj || "levo" }));
  y -= 10;
  stran.drawLine({ start: { x: levo, y }, end: { x: desno, y }, thickness: 0.7, color: rgb(0.7, 0.7, 0.7) });
  y -= 18;

  if (postavke.length === 0) {
    pisi("(brez razčlenjenih postavk)", levo, y, { barva: siva, velikost: 9.5 });
    y -= 18;
  }
  for (const post of postavke) {
    if (y < 120) break; // preprosta zascita pred prekoracitvijo strani
    pisi(post.opis || "—", levo, y, { velikost: 9.5 });
    pisi(post.kolicina ?? "—", levo + 270, y, { velikost: 9.5 });
    pisi(fmt(post.cena_na_enoto), levo + 320, y, { velikost: 9.5 });
    pisi(fmt(post.vrednost), desno, y, { velikost: 9.5, poravnaj: "desno" });
    y -= 16;
  }

  y -= 14;
  stran.drawLine({ start: { x: levo, y: y + 8 }, end: { x: desno, y: y + 8 }, thickness: 0.7, color: rgb(0.7, 0.7, 0.7) });

  // --- Razdelitev DDV ---
  const vrsticeDdv = [
    ["22 %", ddv.osnova_22, ddv.ddv_22],
    ["9,5 %", ddv.osnova_9_5, ddv.ddv_9_5],
    ["5 %", ddv.osnova_5, ddv.ddv_5],
    ["Oproščeno", ddv.oproscen_ddv, 0],
  ].filter(([, osnova]) => Number(osnova || 0) > 0);

  if (vrsticeDdv.length) {
    pisi("Razdelitev DDV", levo, y, { f: fontBold, velikost: 9.5, barva: siva });
    y -= 16;
    for (const [naziv, osnova, znesekDdv] of vrsticeDdv) {
      pisi(`${naziv}: osnova ${fmt(osnova)}${znesekDdv ? "  ·  DDV " + fmt(znesekDdv) : ""}`, levo, y, { velikost: 9.5 });
      y -= 14;
    }
    y -= 10;
  }

  pisi("Skupaj brez DDV:", desno - 140, y, { velikost: 10 });
  pisi(fmt(rac.znesek_brez_ddv), desno, y, { velikost: 10, poravnaj: "desno" });
  y -= 18;
  stran.drawLine({ start: { x: desno - 200, y: y + 10 }, end: { x: desno, y: y + 10 }, thickness: 1, color: crna });
  pisi("ZA PLAČILO:", desno - 140, y, { f: fontBold, velikost: 12 });
  pisi(fmt(rac.znesek_skupaj), desno, y, { f: fontBold, velikost: 12, poravnaj: "desno" });

  // --- Opomba racunovodje / AI ---
  y -= 40;
  if (p.kategorije_za_pregled?.opomba) {
    pisi("Opomba AI: " + p.kategorije_za_pregled.opomba, levo, y, { velikost: 8.5, barva: rdeca });
    y -= 20;
  }

  // --- Podnozje z jasnim opozorilom ---
  stran.drawText(
    "Ta dokument je samodejno pripravil AI sistem Design Nova na podlagi prejetega računa, izključno za lažji interni pregled/arhiv.\n" +
      "NI nadomestilo za izvirni dokument in NI uradna oddaja na FURS (FURS sprejema samo XML izvoz KPR/KIR prek eDavki).",
    { x: levo, y: 60, size: 7.5, font, color: siva, lineHeight: 10, maxWidth: desno - levo }
  );
  stran.drawText(`Generirano: ${meta?.generirano_datum || ""}   ·   Dokument ID: ${meta?.dokument_id || ""}`, {
    x: levo, y: 40, size: 7.5, font, color: siva,
  });

  return await doc.save();
}

module.exports = { generirajDokumentPdf };
