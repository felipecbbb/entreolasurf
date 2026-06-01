-- Migration: descuento de stock de producto atómico (auditoría jun-2026)
-- ============================================================
-- El webhook descontaba stock con read-modify-write sobre products.sizes_stock
-- (carrera en compras simultáneas → sobreventa). Esta RPC lo hace bajo
-- FOR UPDATE, descontando la variante exacta (color×talla) o el stock simple.
-- La llama el webhook (service role). Ejecutar en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION public.decrement_product_stock(p_id uuid, p_color text, p_size text, p_qty int)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  ss jsonb; has_color bool; has_size bool; done bool := false;
  new_ss jsonb := '[]'::jsonb; elem jsonb; total int := 0;
begin
  select sizes_stock into ss from public.products where id = p_id for update;
  if ss is null or jsonb_array_length(ss) = 0 then
    update public.products set stock = greatest(coalesce(stock, 0) - p_qty, 0) where id = p_id;
    return;
  end if;
  select bool_or(coalesce(e->>'color','') <> ''), bool_or(coalesce(e->>'size','') <> '')
    into has_color, has_size from jsonb_array_elements(ss) e;
  for elem in select * from jsonb_array_elements(ss) loop
    if not done
       and (not coalesce(has_color, false) or coalesce(elem->>'color','') = coalesce(p_color,''))
       and (not coalesce(has_size, false)  or coalesce(elem->>'size','')  = coalesce(p_size,'')) then
      elem := jsonb_set(elem, '{stock}', to_jsonb(greatest(coalesce((elem->>'stock')::int, 0) - p_qty, 0)));
      done := true;
    end if;
    new_ss := new_ss || elem;
    total := total + coalesce((elem->>'stock')::int, 0);
  end loop;
  update public.products set sizes_stock = new_ss, stock = total where id = p_id;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.decrement_product_stock(uuid,text,text,int) FROM anon, authenticated, public;
