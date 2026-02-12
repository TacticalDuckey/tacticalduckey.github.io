-- Supabase RLS Fix voor Blacklist Table
-- Voer dit uit in Supabase SQL Editor

-- Optie 1: RLS volledig uitschakelen (SIMPEL - AANBEVOLEN)
ALTER TABLE blacklist DISABLE ROW LEVEL SECURITY;

-- OF

-- Optie 2: RLS inschakelen met policies (VEILIGER)
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;

-- Allow anonymous INSERT (voor webhook en admin panel)
CREATE POLICY "Allow anonymous insert" ON blacklist
FOR INSERT TO anon
WITH CHECK (true);

-- Allow anonymous SELECT (voor website)
CREATE POLICY "Allow anonymous select" ON blacklist
FOR SELECT TO anon
USING (true);

-- Allow anonymous DELETE (voor admin panel met auth key)
CREATE POLICY "Allow anonymous delete" ON blacklist
FOR DELETE TO anon
USING (true);

-- Allow authenticated users all operations
CREATE POLICY "Allow authenticated all" ON blacklist
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);
