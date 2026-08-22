// Izlusci besedilo iz PDF bufferja na strezniski strani (Node), z isto knjiznico
// (pdfjs-dist), kot jo v brskalniku uporablja oddaj-racun.html -- bolj prizanesljiva
// do "nenavadnih" PDF-jev kot pdf-parse (ki je javil "bad XRef entry" na nekaterih
// veljavnih, a nestandardno zgrajenih PDF datotekah).

const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// V Node okolju (brez brskalnika) pdf.js sicer poskusa najti "worker" datoteko po
// relativni poti, kar na Vercelu spodleti ("Cannot find module './pdf.worker.js'").
// Z require.resolve mu podamo pravo absolutno pot, ki jo najde ne glede na to, kako
// je koda spakirana za deploy.
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");

async function izlusciBesediloIzPdf(buffer) {
  const nalozen = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    stopAtErrors: false,
    useSystemFonts: true,
  }).promise;

  let besedilo = "";
  for (let i = 1; i <= nalozen.numPages; i++) {
    const stran = await nalozen.getPage(i);
    const vsebina = await stran.getTextContent();
    besedilo += vsebina.items.map((el) => el.str).join(" ") + "\n";
  }
  return besedilo;
}

module.exports = { izlusciBesediloIzPdf };
