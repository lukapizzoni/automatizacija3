# Navodila — dodajanje baze podatkov (Supabase) v obstoječi projekt

Predpostavljam, da imaš že delujoč projekt na Vercelu iz prejšnjega koraka
(portfelj + `/api/izlusci-dokument`). Zdaj dodajamo:
- pravo bazo podatkov (Supabase)
- sprejem in pregled RAČUNOV (ne samo povpraševanj gostov)
- nadzorno ploščo za računovodstvo

---

## Korak 1 — Ustvari Supabase projekt

1. Pojdi na [supabase.com](https://supabase.com) → **Start your project** → prijava (lahko z GitHub računom)
2. **New project** → izberi ime (npr. `design-nova`), geslo za bazo (shrani si ga nekam), regijo (npr. Frankfurt/EU)
3. Počakaj ~2 minuti, da se projekt ustvari

## Korak 2 — Ustvari tabeli (SQL)

1. V Supabase projektu pojdi na **SQL Editor** (levi meni) → **New query**
2. Prilepi to in klikni **Run**:

```sql
create extension if not exists pgcrypto;

create table if not exists dokumenti (
  id uuid primary key default gen_random_uuid(),
  tip text not null default 'racun',
  vlozitelj text,
  ime_datoteke text,
  surovo_besedilo text,
  izlusceni_podatki jsonb,
  status text not null default 'caka_pregled',
  opomba_racunovodje text,
  ustvarjeno timestamptz not null default now(),
  posodobljeno timestamptz not null default now()
);

create table if not exists aktivnosti (
  id uuid primary key default gen_random_uuid(),
  avtomatizacija text not null,
  opis text not null,
  podrobnosti jsonb,
  ustvarjeno timestamptz not null default now()
);
```

## Korak 3 — Pridobi ključe

1. V Supabase: **Project Settings** (ikona zobnika) → **API**
2. Prekopiraj:
   - **Project URL** (npr. `https://xxxxx.supabase.co`)
   - **service_role** ključ (POD "Project API keys" — NE "anon", ampak "service_role"! Klikni "Reveal" da ga vidiš)

## Korak 4 — Dodaj na Vercel

1. Vercel → tvoj projekt → **Settings → Environment Variables**
2. Dodaj:
   - `SUPABASE_URL` = tvoj Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = tvoj service_role ključ
3. (Preveri, da je tam še vedno tudi `OPENAI_API_KEY` iz prej)
4. Save

## Korak 5 — Dodaj nove datoteke v repozitorij

Iz tega zipa dodaj v GitHub repozitorij (na koren, enako kot prej):
- `lib/supabase.js`
- `api/sprejmi-racun.js`
- `api/dokumenti.js`
- `api/aktivnosti.js`
- `api/posodobi-status.js`
- `oddaj-racun.html`
- `nadzorna-plosca.html`
- `vzorcni_racun.pdf`
- posodobljen `package.json` (prepiši obstoječega — zdaj vsebuje tudi supabase)

Vercel bo ob vsakem commitu samodejno naredil nov deploy (Deployments zavihek).

## Korak 6 — Testiraj

1. Odpri `https://<tvoja-domena>/oddaj-racun.html`
2. Naloži `vzorcni_racun.pdf`, klikni **"Pošlji AI-ju v obdelavo"**
3. Počakaj — dobiš potrditev, da je shranjeno
4. Odpri `https://<tvoja-domena>/nadzorna-plosca.html`
5. Pod zavihkom **"Čaka pregled"** bi moral videti ta račun — klikni "Prikaži/skrij podrobnosti", preveri izluščene podatke
6. Klikni **"✓ Odobri"** — dokument se premakne v zavihek "Odobreno"
7. V zavihku "Odobreno" klikni **"Označi kot pripravljeno za oddajo"**
8. Preveri zavihek **"Dnevnik aktivnosti"** — tam vidiš zgodovino vseh dogodkov

---

## Pomembna opomba o FURS

Sistem trenutno **ne pošilja ničesar samodejno na FURS**. Ko računovodja
odobri dokument in ga označi "pripravljeno za oddajo", to je samo interna
oznaka — dejansko oddajo (prek e-Davkov ali kako drugače) še vedno naredi
človek ročno. To je namerna odločitev, ker avtomatsko pošiljanje na državne
institucije zahteva digitalna potrdila in dodatno pravno/tehnično ureditev,
o kateri se pogovoriva posebej, ko bo osnovni sistem preizkušen in stabilen.

## Kaj preveriti, če kaj ne deluje

- **"Manjkata SUPABASE_URL ali SUPABASE_SERVICE_ROLE_KEY"** → preveri
  Environment Variables na Vercelu, nato naredi Redeploy
- **Prazna nadzorna plošča čeprav si nekaj poslal** → preveri v Supabase
  pod **Table Editor → dokumenti**, ali je zapis sploh tam; če je, je
  problem v `/api/dokumenti`, če ga ni, je problem v `/api/sprejmi-racun`
- Vse napake so tudi vidne v Vercel → tvoj projekt → **Deployments** →
  klikni na zadnji deploy → **Functions** → izberi funkcijo → **Logs**
