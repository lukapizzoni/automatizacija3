// GET /api/preveri-posto
//
// To funkcijo redno (vsakih par minut) klice ZUNANJI brezplacen "urnik" (npr. cron-job.org),
// ker Vercel Hobby plan ne dovoli pogostega notranjega cron sprozanja.
//
// Kaj naredi:
//   1. Se poveze na namenski Gmail nabiralnik (IMAP + App Password)
//   2. Poisce vse NEPREBRANE maile
//   3. Za vsako PDF prilogo v takem mailu: izlusci besedilo iz PDF-ja, poklice isto AI
//      logiko kot rocna oddaja (obdelaj-racun.js) -- ce AI presodi, da PDF NI racun, ga
//      preprosto preskoci in NE shrani nikamor (enaka logika kot na oddaj-racun.html)
//   4. Mail oznaci kot prebran, da ga naslednjic ne obdela se enkrat
//
// Rabi okoljske spremenljivke:
//   GMAIL_USER          -- npr. racuni.designnova@gmail.com
//   GMAIL_APP_PASSWORD  -- 16-mestno "App Password" iz Google racuna (NE navadno geslo)
//   POSTA_TAJNI_KLJUC   -- poljuben skrivni niz, da te poti ne more sprozit kdorkoli na spletu

const { ImapFlow } = require("imapflow");
const { izlusciBesediloIzPdf } = require("../lib/pdf-tekst");
const { obdelajRacun } = require("../lib/obdelaj-racun");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ uspesno: false, napaka: "Samo GET je dovoljen." });
  }

  // Preprosta zascita, da funkcije ne more sprozit kdorkoli, ki najde URL
  const kljucVZahtevi = (req.query && req.query.kljuc) || "";
  if (!process.env.POSTA_TAJNI_KLJUC || kljucVZahtevi !== process.env.POSTA_TAJNI_KLJUC) {
    return res.status(401).json({ uspesno: false, napaka: "Napacen ali manjkajoc ?kljuc=..." });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({
      uspesno: false,
      napaka: "Manjkata GMAIL_USER in/ali GMAIL_APP_PASSWORD (Vercel Environment Variables).",
    });
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    logger: false,
  });

  const povzetek = { pregledanih_mailov: 0, obdelanih_pdf: 0, shranjenih_racunov: 0, zavrnjenih_ker_ni_racun: 0, napake: [], diagnostika_mailov: [] };

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Poisci vse neprebrane maile
      const sporocila = await client.search({ seen: false });

      for (const uid of sporocila || []) {
        povzetek.pregledanih_mailov++;

        const sporocilo = await client.fetchOne(uid, { source: true, envelope: true }, { uid: false });
        if (!sporocilo) continue;

        const { simpleParser } = require("mailparser");
        const razclenjeno = await simpleParser(sporocilo.source);

        const pdfPriloge = (razclenjeno.attachments || []).filter(
          (p) => p.contentType === "application/pdf" || (p.filename || "").toLowerCase().endsWith(".pdf")
        );

        // ZACASNO -- diagnostika, da vidimo, kaj sporocilo dejansko vsebuje
        povzetek.diagnostika_mailov.push({
          zadeva: razclenjeno.subject || null,
          od: razclenjeno.from?.text || null,
          stevilo_vseh_prilog: (razclenjeno.attachments || []).length,
          imena_vseh_prilog: (razclenjeno.attachments || []).map((p) => p.filename + " (" + p.contentType + ")"),
          stevilo_pdf_prilog: pdfPriloge.length,
        });

        for (const priloga of pdfPriloge) {
          povzetek.obdelanih_pdf++;
          try {
            const besedilo = await izlusciBesediloIzPdf(priloga.content);
            const pdf_base64 = priloga.content.toString("base64");

            const rezultat = await obdelajRacun({
              besedilo,
              ime_datoteke: priloga.filename || "racun.pdf",
              vlozitelj: razclenjeno.from?.text || null,
              pdf_base64,
              vir: "mail",
            });

            if (rezultat.zavrnjeno_ker_ni_racun) {
              povzetek.zavrnjenih_ker_ni_racun++;
            } else {
              povzetek.shranjenih_racunov++;
            }
          } catch (napakaEnegaPdf) {
            povzetek.napake.push(String(napakaEnegaPdf.message || napakaEnegaPdf));
          }
        }

        // Oznaci mail kot prebran, da ga naslednjic ne obdelamo se enkrat
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: false });
      }
    } finally {
      lock.release();
    }
    await client.logout();

    return res.status(200).json({ uspesno: true, ...povzetek });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ uspesno: false, napaka: String(err && err.message ? err.message : err), ...povzetek });
  }
};
