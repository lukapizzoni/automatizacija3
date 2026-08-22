// Izlusci besedilo iz PDF bufferja na strezniski strani (Node), z isto knjiznico
// (pdfjs-dist), kot jo v brskalniku uporablja oddaj-racun.html -- bolj prizanesljiva
// do "nenavadnih" PDF-jev kot pdf-parse (ki je javil "bad XRef entry" na nekaterih
// veljavnih, a nestandardno zgrajenih PDF datotekah).

const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

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
