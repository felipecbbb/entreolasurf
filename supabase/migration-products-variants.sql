-- ============================================================
-- Productos: variantes (color, tallas con stock individual, galería)
-- Aplicado vía MCP el 2026-05-31. Guardado aquí como registro.
-- ============================================================

-- Atributos de variante en products
alter table public.products add column if not exists colors text;        -- CSV: 'Negro, Blanco'
alter table public.products add column if not exists sizes text;         -- CSV (compat): 'S, M, L'
alter table public.products add column if not exists gallery text;       -- CSV de URLs de imagen
alter table public.products add column if not exists sizes_stock jsonb
  not null default '[]'::jsonb;                                          -- [{ "size": "M", "stock": 10 }]

-- Variante (color · talla) en cada línea de pedido
alter table public.order_items add column if not exists variant text;    -- 'Negro · Talla M'
