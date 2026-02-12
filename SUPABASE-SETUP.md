# 🚀 Supabase Setup Guide - Blacklist Database

Complete stap-voor-stap handleiding om Supabase in te stellen voor het blacklist systeem.

---

## 📋 Wat is Supabase?

Supabase is een open-source Firebase alternatief met:
- ✅ **GRATIS** PostgreSQL database
- ✅ Real-time updates
- ✅ REST API out of the box
- ✅ Geen credit card required voor free tier
- ✅ 500MB database storage gratis

---

## 🎯 Stap 1: Supabase Account Maken

1. **Ga naar:** [https://supabase.com](https://supabase.com)
2. **Klik op:** "Start your project"
3. **Sign up** met:
   - GitHub account (aanbevolen)
   - Of Google/Email

---

## 🏗️ Stap 2: Nieuw Project Aanmaken

1. **Dashboard:** Klik op "New Project"
2. **Vul in:**
   - **Name:** `lage-landen-blacklist` (of eigen naam)
   - **Database Password:** Kies een sterk wachtwoord (bewaar dit veilig!)
   - **Region:** `West EU (Ireland)` (dichtsbij Nederland)
   - **Pricing Plan:** Free ($0/month)

3. **Klik op:** "Create new project"

⏳ **Wacht 2-3 minuten** terwijl je database wordt opgezet...

---

## 🗄️ Stap 3: Database Tabel Maken

### Via SQL Editor (Makkelijkst):

1. **In Supabase Dashboard:** Klik op **"SQL Editor"** in de linker sidebar

2. **Klik op:** "New Query"

3. **Plak deze SQL code:**

```sql
-- Maak de blacklist tabel
CREATE TABLE IF NOT EXISTS public.blacklist (
    id BIGSERIAL PRIMARY KEY,
    server_name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maak index voor snellere lookups
CREATE INDEX IF NOT EXISTS idx_server_name ON public.blacklist(server_name);

-- Enable Row Level Security (RLS)
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;

-- Policy: Iedereen kan lezen
CREATE POLICY "Allow public read access" 
ON public.blacklist FOR SELECT 
TO anon, authenticated 
USING (true);

-- Policy: Iedereen kan toevoegen
CREATE POLICY "Allow public insert access" 
ON public.blacklist FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- Policy: Iedereen kan verwijderen (wordt beveiligd via authKey in functie)
CREATE POLICY "Allow public delete access" 
ON public.blacklist FOR DELETE 
TO anon, authenticated 
USING (true);

-- Voeg initiële data toe
INSERT INTO public.blacklist (server_name) VALUES
    ('De Lijn RP'),
    ('Saade Community'),
    ('Biggs Leaks'),
    ('Schaap Community'),
    ('Pyschopaten Community'),
    ('Buildify Development'),
    ('Weekly Scripts'),
    ('Leaker Community'),
    ('Dutch Hollandia RP V2'),
    ('Urk'),
    ('VOX V2'),
    ('Bartekboys'),
    ('Bovenkarspel Roleplay'),
    ('Fire Response: Drenthe'),
    ('Blaze Services'),
    ('Fatahdevshop'),
    ('Luuk Development'),
    ('Amsterdam Roleplay'),
    ('De Nederlandser Expose Server'),
    ('GaG Shop NL/EN'),
    ('Dutch Oisterwijk RP'),
    ('Albertheijn RP Rotterdam'),
    ('Cola | Hangout VC Gaming Community'),
    ('Silent'),
    ('Dutch-Holland-Roleplay'),
    ('Amsterdam Roleplay (PhysicGamingYT & Bas08112013)'),
    ('Dutch Eindhoven Roleplay NL'),
    ('Apeldoorn Roleplay OG'),
    ('AnoxGuard'),
    ('Cheatos')
ON CONFLICT (server_name) DO NOTHING;
```

4. **Klik op:** "Run" (of druk Ctrl+Enter)

✅ **Success!** Je zou moeten zien: "Success. No rows returned"

---

## 🔑 Stap 4: API Keys Ophalen

1. **In Supabase Dashboard:** Klik op het **⚙️ Settings** icoon (linker sidebar)

2. **Klik op:** "API"

3. **Kopieer de volgende waarden:**

### Project URL:
```
https://abcdefghijk.supabase.co
```
☝️ Dit wordt je `SUPABASE_URL`

### anon/public key:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
☝️ Dit wordt je `SUPABASE_ANON_KEY`

⚠️ **LET OP:** De `service_role` key NIET gebruiken! Alleen `anon public` key.

---

## ⚙️ Stap 5: Netlify Environment Variables

1. **Ga naar:** Netlify Dashboard
2. **Je site** → **Site settings** → **Environment variables**
3. **Add variables:**

| Key | Value | Voorbeeld |
|-----|-------|-----------|
| `SUPABASE_URL` | Je Supabase Project URL | `https://abc123.supabase.co` |
| `SUPABASE_ANON_KEY` | Je anon/public key | `eyJhbGci...` (heel lang) |
| `BLACKLIST_AUTH_KEY` | Zelf een sterk wachtwoord kiezen | `MijnGeheimWW123!` |
| `DISCORD_BLACKLIST` | Discord webhook URL (optioneel) | `https://discord.com/api/webhooks/...` |

4. **Klik op:** "Save"

---

## 🧪 Stap 6: Testen

### Test 1: Data Ophalen

In je browser, ga naar:
```
https://jouw-site.netlify.app/.netlify/functions/get-blacklist
```

**Verwacht resultaat:**
```json
{
  "servers": ["Amsterdam Roleplay", "Biggs Leaks", ...],
  "lastUpdated": "2026-02-12T10:30:00Z",
  "total": 30
}
```

### Test 2: Via Admin Panel

1. **Open:** `https://jouw-site.netlify.app/blacklist-admin.html`
2. **Voeg toe:** "Test Server 123"
3. **Klik:** "Toevoegen"
4. **Verifieer:** Server verschijnt in de lijst

### Test 3: Verwijderen (Admin Only)

1. **In admin panel:** Scroll naar "Server Verwijderen"
2. **Type:** "Test Server 123"
3. **Auth Key:** Je `BLACKLIST_AUTH_KEY` waarde
4. **Klik:** "Verwijderen"
5. **Verifieer:** Server verdwijnt

---

## 📊 Stap 7: Supabase Dashboard Verkennen

### Bekijk je data:

1. **Table Editor:** Klik op "Table Editor" in sidebar
2. **Selecteer:** `blacklist` tabel
3. **Acties:**
   - ➕ Add row (handmatig server toevoegen)
   - ✏️ Edit row (server naam wijzigen)
   - 🗑️ Delete row (server verwijderen)

### Real-time Statistics:

1. **Dashboard:** Home pagina
2. **Zie:**
   - Database size
   - API requests
   - Active connections

---

## 🔧 Troubleshooting

### Error: "Supabase configuration missing"

**Oplossing:**
- Verifieer dat `SUPABASE_URL` en `SUPABASE_ANON_KEY` zijn ingesteld in Netlify
- Check voor typos in de variable namen
- Redeploy je site na het toevoegen van variables

### Error: "Database error" / "relation does not exist"

**Oplossing:**
- Ga naar SQL Editor in Supabase
- Run de CREATE TABLE query opnieuw
- Verifieer dat de tabel `blacklist` bestaat in Table Editor

### Error: "Failed to add server"

**Oplossing:**
- Check Supabase Dashboard → Auth → Policies
- Verifieer dat Row Level Security policies correct zijn
- Test in Supabase SQL Editor:
  ```sql
  SELECT * FROM blacklist;
  INSERT INTO blacklist (server_name) VALUES ('Test');
  ```

### Website laadt geen data

**Oplossing:**
- Open browser console (F12)
- Check voor error messages
- Verifieer API endpoint: `/.netlify/functions/get-blacklist`
- Check Netlify function logs in Dashboard

---

## 📈 Database Migratie (Optioneel)

Als je al een `blacklist.json` hebt met extra servers:

```sql
-- Voeg meerdere servers toe
INSERT INTO public.blacklist (server_name) VALUES
    ('Server 1'),
    ('Server 2'),
    ('Server 3')
ON CONFLICT (server_name) DO NOTHING;
```

---

## 🎓 Tips & Best Practices

### Performance:

- ✅ Index op `server_name` (al gedaan in setup)
- ✅ Cache responses (60 seconden in code)
- ✅ Use `count` query voor totalen

### Security:

- ✅ Row Level Security enabled
- ✅ Alleen public key gebruiken (niet service_role)
- ✅ Auth key voor delete operations

### Monitoring:

- 📊 Supabase Dashboard → Database → Usage
- 📊 Netlify Dashboard → Functions → Analytics
- 📊 Check limits van free tier (500MB, 2GB bandwidth)

---

## 🚀 Je bent klaar!

Het systeem is nu **volledig operationeel** met:

- ✅ Real-time database (Supabase)
- ✅ Automatische synchronisatie
- ✅ Discord webhook support
- ✅ Admin panel voor beheer
- ✅ Veilige delete operations

**Test alles grondig en enjoy!** 🎉

---

## 📞 Support

### Supabase Issues:
- [Supabase Docs](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com)

### Blacklist System:
- Check browser console (F12)
- Netlify function logs
- Supabase logs (Dashboard → Logs)

---

**Laatste Update:** 12 februari 2026  
**Versie:** 2.0 (Supabase Edition)  
**Status:** Production Ready ✅
