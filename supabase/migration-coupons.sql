-- Migration: Coupons / Discount codes
-- Run in Supabase SQL Editor or via Management API

CREATE TABLE IF NOT EXISTS coupons (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  discount_type   TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value  NUMERIC(10,2) NOT NULL DEFAULT 0,
  applies_to      TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'camps', 'classes', 'products', 'rentals')),
  activity_type   TEXT,  -- NULL = all types, or specific: grupal, individual, yoga, paddle, surfskate
  camp_id         UUID REFERENCES surf_camps(id) ON DELETE SET NULL,
  min_amount      NUMERIC(10,2) DEFAULT 0,
  max_uses        INT,  -- NULL = unlimited
  used_count      INT NOT NULL DEFAULT 0,
  max_uses_per_user INT DEFAULT 1,
  starts_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(active);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active coupons"
  ON coupons FOR SELECT
  USING (true);

CREATE POLICY "Admin manage coupons"
  ON coupons FOR ALL
  USING (public.is_admin());

SELECT pg_notify('pgrst', 'reload schema');
