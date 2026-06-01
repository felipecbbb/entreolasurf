-- Migration: datos de factura en los pedidos
-- ============================================================
-- El checkout ahora pide dirección de envío (obligatoria) y permite
-- solicitar factura con datos fiscales. Guardamos esos datos en el pedido.
-- Ejecutar en el SQL Editor de Supabase.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS wants_invoice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_name text,
  ADD COLUMN IF NOT EXISTS invoice_tax_id text,
  ADD COLUMN IF NOT EXISTS invoice_address text;

COMMENT ON COLUMN public.orders.wants_invoice IS 'El cliente solicitó factura en el checkout';
COMMENT ON COLUMN public.orders.invoice_name IS 'Razón social / nombre fiscal para la factura';
COMMENT ON COLUMN public.orders.invoice_tax_id IS 'NIF/CIF para la factura';
COMMENT ON COLUMN public.orders.invoice_address IS 'Dirección fiscal para la factura';
