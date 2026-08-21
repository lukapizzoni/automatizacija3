# Navodila od začetka — kako objaviti in testirati

V tem zipu je celoten mini-projekt, ki ga naložiš na Vercel:
- `index.html` — tvoj portfelj (ista stran kot doslej)
- `test-dokumentna-avtomatizacija.html` — testna stran za AI avtomatizacijo
- `api/izlusci-dokument.js` — prava API funkcija, ki kliče OpenAI
- `package.json` — pove Vercelu, da rabi paket "openai"
- `povprasevanje_gost.pdf` — vzorčni dokument za test

Ker prej nisi uporabljal gita, gremo **najlažjo pot** — prek Vercel spletne strani,
brez ukazne vrstice.

---

## Korak 1 — Razširi zip

Razširi (unzip) datoteko, ki sem ti jo poslal, v novo mapo na svojem računalniku
(npr. `design-nova-projekt`). Znotraj morajo biti direktno (ne v podmapi):
`index.html`, `package.json`, `api/izlusci-dokument.js`, itd.

---

## Korak 2 — Naloži na GitHub (rabi Vercel git povezavo)

Vercel najlažje samodejno objavlja iz GitHub repozitorija. Če nimaš GitHub računa:

1. Ustvari brezplačen račun na [github.com](https://github.com)
2. Klikni **"New repository"** (zelen gumb) → ime npr. `design-nova` → **Create repository**
3. Na naslednji strani klikni **"uploading an existing file"**
4. Povleci vanj VSE datoteke in mape iz razširjenega zipa (tudi mapo `api`!)
5. Spodaj klikni **"Commit changes"**

---

## Korak 3 — Poveži repozitorij z Vercel projektom

Imaš že projekt `designnovacom` na Vercelu. Najlažje je narediti nov projekt,
vezan na ta repo (lahko kasneje prestaviš domeno nanj):

1. Pojdi na [vercel.com/new](https://vercel.com/new)
2. Izberi svoj GitHub repozitorij `design-nova` → **Import**
3. Framework Preset: pusti na **"Other"** (Vercel bo sam prepoznal `/api` mapo)
4. Preden klikneš Deploy, razširi **"Environment Variables"** in dodaj:
   - Key: `OPENAI_API_KEY`
   - Value: tvoj OpenAI ključ (priporočam nov, ne tistega, ki si ga poslal v pogovoru)
5. Klikni **Deploy**

Čez cca. 1 minuto dobiš nov naslov, nekaj podobnega:
`https://design-nova-xxxx.vercel.app`

---

## Korak 4 — Testiraj

1. Odpri: `https://design-nova-xxxx.vercel.app/test-dokumentna-avtomatizacija.html`
2. Naloži priloženi `povprasevanje_gost.pdf`
3. Klikni **"Preberi in izlušči podatke"**
4. Počakaj par sekund — moral bi videti surovo besedilo in nato pravi JSON,
   ki ga je vrnil OpenAI

Če deluje pravilno, boš videl nekaj takega (drugič lahko podatki malo variirajo,
ker je AI, ne fiksna tabela):

```json
{
  "gost": { "ime_priimek": "Katarina Novak", "email": "katarina.novak83@gmail.com", ... },
  "rezervacija": { "prihod": "2026-09-12", "odhod": "2026-09-14", "stevilo_oseb": 4, ... },
  ...
}
```

---

## Ko deluje — povežemo z obstoječo domeno designnovacom.vercel.app

Ko potrdiva, da vse pravilno deluje na testnem naslovu, lahko:
- **Prestaviš isti kod v obstoječi projekt** designnovacom (zamenjaš tam
  `index.html` s tem novim, ki že vsebuje vse, in dodaš mapo `api/`), ALI
- **Preusmeriš domeno designnovacom.vercel.app** na ta novi projekt

Povej mi, ko prideš do koraka 4, in gledava rezultat skupaj.

---

## Pogoste napake in reševanje

**"Napaka: Failed to fetch" ali HTML namesto JSON-a**
→ API funkcija ni bila najdena. Preveri, da je mapa `api/` na korenu
repozitorija (ne znotraj druge podmape), in da si dejansko odprl deployan
Vercel naslov (ne lokalne datoteke).

**"OPENAI_API_KEY ni nastavljen na strežniku"**
→ Pojdi v Vercel → tvoj projekt → Settings → Environment Variables, preveri
da je `OPENAI_API_KEY` tam, nato naredi **Redeploy** (Deployments → tri pikice
ob zadnjem deployu → Redeploy) — sama sprememba brez redeploya se ne upošteva.

**Napaka o "insufficient_quota" ali podobno od OpenAI**
→ Preveri na platform.openai.com/settings/organization/billing, da ima račun
naložen kredit/plačilno metodo.
