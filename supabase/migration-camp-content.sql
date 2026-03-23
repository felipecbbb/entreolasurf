-- Migration: Camp Content Management
-- Adds content columns to surf_camps and creates camp_photos, camp_testimonials, camp_faqs tables

-- ============================================================
-- 1. New columns on surf_camps
-- ============================================================
ALTER TABLE surf_camps
  ADD COLUMN IF NOT EXISTS sold_out BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hero_kicker TEXT,
  ADD COLUMN IF NOT EXISTS hero_title TEXT,
  ADD COLUMN IF NOT EXISTS hero_subtitle TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#0f2f39',
  ADD COLUMN IF NOT EXISTS whats_included TEXT[],
  ADD COLUMN IF NOT EXISTS whats_included_title TEXT,
  ADD COLUMN IF NOT EXISTS ideal_for TEXT[],
  ADD COLUMN IF NOT EXISTS ideal_for_title TEXT,
  ADD COLUMN IF NOT EXISTS meta_title TEXT,
  ADD COLUMN IF NOT EXISTS meta_description TEXT;

-- ============================================================
-- 2. camp_photos
-- ============================================================
CREATE TABLE IF NOT EXISTS camp_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  camp_id UUID NOT NULL REFERENCES surf_camps(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camp_photos_camp_id ON camp_photos(camp_id);

ALTER TABLE camp_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read camp_photos"
  ON camp_photos FOR SELECT
  USING (true);

CREATE POLICY "Admin manage camp_photos"
  ON camp_photos FOR ALL
  USING (public.is_admin());

-- ============================================================
-- 3. camp_testimonials
-- ============================================================
CREATE TABLE IF NOT EXISTS camp_testimonials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  camp_id UUID NOT NULL REFERENCES surf_camps(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  quote TEXT NOT NULL,
  stars INT DEFAULT 5,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camp_testimonials_camp_id ON camp_testimonials(camp_id);

ALTER TABLE camp_testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read camp_testimonials"
  ON camp_testimonials FOR SELECT
  USING (true);

CREATE POLICY "Admin manage camp_testimonials"
  ON camp_testimonials FOR ALL
  USING (public.is_admin());

-- ============================================================
-- 4. camp_faqs
-- ============================================================
CREATE TABLE IF NOT EXISTS camp_faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  camp_id UUID NOT NULL REFERENCES surf_camps(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  col_index INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camp_faqs_camp_id ON camp_faqs(camp_id);

ALTER TABLE camp_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read camp_faqs"
  ON camp_faqs FOR SELECT
  USING (true);

CREATE POLICY "Admin manage camp_faqs"
  ON camp_faqs FOR ALL
  USING (public.is_admin());
