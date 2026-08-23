/* ============================================================
   Precios de clases de la portada — sincronizados con el panel
   ------------------------------------------------------------
   Estaban escritos a mano en el HTML ("Desde 35€", "-33%"), asi que al
   cambiar un precio en el panel la portada seguia anunciando el viejo.
   Aqui se leen de activity_packs y se recalculan los ahorros, que es lo
   mismo que hacen las paginas de cada clase.
   ============================================================ */
import { supabase } from '/lib/supabase.js';

const PILLS = [2, 3, 5, 7];   // packs que se destacan en la portada

async function init() {
  const precioEls = document.querySelectorAll('[data-price-for]');
  const pillsWrap = document.querySelector('[data-savings-pills]');
  const tituloEl = document.querySelector('[data-max-discount]');
  if (!precioEls.length && !pillsWrap) return;

  const [{ data: acts }, { data: packs }] = await Promise.all([
    supabase.from('activities').select('id, type_key'),
    supabase.from('activity_packs').select('activity_id, sessions, price, public'),
  ]);
  if (!acts?.length || !packs?.length) return;   // sin datos, se queda lo del HTML

  const idPorTipo = {};
  acts.forEach(a => { idPorTipo[a.type_key] = a.id; });
  const packsDe = (tipo) => packs
    .filter(p => p.activity_id === idPorTipo[tipo] && p.public !== false)
    .sort((a, b) => a.sessions - b.sessions);

  // Precio de una clase suelta
  precioEls.forEach(el => {
    const tipo = el.dataset.priceFor;
    const suelta = packsDe(tipo).find(p => p.sessions === 1);
    if (suelta) el.firstChild.textContent = `Desde ${Number(suelta.price).toLocaleString('es-ES')}€ `;
  });

  // Ahorro de cada pack respecto a pagar las clases sueltas
  const grupales = packsDe('grupal');
  const base = grupales.find(p => p.sessions === 1)?.price;
  if (!base) return;
  const descuento = (n) => {
    const pack = grupales.find(p => p.sessions === n);
    if (!pack) return null;
    return Math.round((1 - Number(pack.price) / (base * n)) * 100);
  };

  if (pillsWrap) {
    const html = PILLS.map((n, i) => {
      const d = descuento(n);
      if (d == null || d <= 0) return '';
      const destacada = i === PILLS.length - 1 ? ' accent' : '';
      return `<span class="savings-pill${destacada}">${n} clases <strong>-${d}%</strong></span>`;
    }).filter(Boolean).join('');
    if (html) pillsWrap.innerHTML = html;
  }

  // Titular: el mayor ahorro real de todo el catalogo de grupales
  if (tituloEl) {
    const maximo = Math.max(...grupales.filter(p => p.sessions > 1).map(p => descuento(p.sessions) ?? 0));
    if (maximo > 0) tituloEl.textContent = `Ahorra hasta un ${maximo}%`;
  }
}

init();
