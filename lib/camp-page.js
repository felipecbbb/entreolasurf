/* ============================================================
   Camp Page — Dynamic content from Supabase
   Loads camp data and replaces static HTML with live DB content.
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { addItem, updateCartPill } from '/lib/cart.js';
import { campPriceFor, formatEuro } from '/lib/domain/camp-pricing.js';

/* ---------- Determine which camp to load ---------- */
function getCampSlug() {
  const attr = document.body.dataset.campSlug || document.querySelector('main')?.dataset.campSlug;
  if (attr) return attr;

  const params = new URLSearchParams(window.location.search);
  if (params.get('slug')) return params.get('slug');

  const path = window.location.pathname.replace(/^\/|\/$/g, '');
  if (path && path.startsWith('surf-camp') && path !== 'surf-camp') return path;

  return null;
}

/* ---------- Fetch camp + related data ---------- */
async function fetchCamp(slug) {
  const { data: camp, error } = await supabase
    .from('surf_camps')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !camp) return null;

  const [photos, testimonials, faqs, tiers] = await Promise.all([
    supabase.from('camp_photos').select('*').eq('camp_id', camp.id).order('sort_order'),
    supabase.from('camp_testimonials').select('*').eq('camp_id', camp.id).order('sort_order'),
    supabase.from('camp_faqs').select('*').eq('camp_id', camp.id).order('sort_order'),
    // Si falta la migración de precio por volumen, seguimos sin tramos
    supabase.from('camp_price_tiers').select('spots, price_per_person').eq('camp_id', camp.id).order('spots'),
  ]);

  return {
    ...camp,
    photos: photos.data || [],
    testimonials: testimonials.data || [],
    faqs: faqs.data || [],
    tiers: tiers.data || [],
  };
}

/* ---------- Render functions ---------- */
function renderHero(c) {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  if (c.hero_image) {
    // Evita re-pintar el hero si la imagen ya es la misma que trae el HTML
    const next = `url('${c.hero_image}')`;
    if (hero.style.getPropertyValue('--hero-image') !== next) {
      hero.style.setProperty('--hero-image', next);
    }
  }
  if (c.color) {
    document.documentElement.style.setProperty('--camp-color', c.color);
    document.querySelectorAll('.btn.red').forEach(btn => btn.style.background = c.color);
    document.querySelectorAll('.kicker').forEach(k => k.style.color = c.color);
  }
  const kicker = hero.querySelector('.kicker');
  const title = hero.querySelector('.page-title');
  const lead = hero.querySelector('.lead');
  if (kicker && c.hero_kicker) kicker.textContent = c.hero_kicker;
  if (title && c.hero_title) title.textContent = c.hero_title;
  if (lead && c.hero_subtitle) lead.textContent = c.hero_subtitle;

  // Hero tags (pills bajo el subtítulo)
  const tagRow = hero.querySelector('.hero-tags');
  if (tagRow && Array.isArray(c.hero_tags) && c.hero_tags.length) {
    tagRow.innerHTML = c.hero_tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');
  }
}

function renderPhotos(c) {
  const strip = document.querySelector('.class-photo-strip');
  if (!strip) return;
  const section = strip.closest('section');
  if (!c.photos.length) {
    if (section) section.style.display = 'none';
    return;
  }
  strip.innerHTML = c.photos.map(p =>
    `<figure><img src="${esc(p.url)}" alt="${esc(p.alt_text || c.title)}" loading="lazy"></figure>`
  ).join('');
}

function renderTestimonials(c) {
  const grid = document.querySelector('.hp-reviews-grid');
  if (!grid) return;
  if (!c.testimonials.length) {
    const section = grid.closest('section');
    if (section) section.style.display = 'none';
    return;
  }
  grid.innerHTML = c.testimonials.map(t => `
    <article class="hp-review-card">
      <div class="hp-review-stars">${'★'.repeat(t.stars)}${'☆'.repeat(5 - t.stars)}</div>
      <blockquote>«${esc(t.quote)}»</blockquote>
      <p class="hp-review-name">${esc(t.author_name)}</p>
    </article>`).join('');
}

function renderFaqs(c) {
  const faqList = document.querySelector('.faq-accordion-list');
  if (!faqList || !c.faqs.length) return;

  const col0 = c.faqs.filter(f => f.col_index === 0);
  const col1 = c.faqs.filter(f => f.col_index === 1);

  const renderCol = items => items.map(f => `
    <details class="faq-acc-item">
      <summary>${esc(f.question)}</summary>
      <div class="faq-acc-body"><p>${esc(f.answer)}</p></div>
    </details>`).join('');

  faqList.innerHTML = `
    <div class="faq-accordion-col">${renderCol(col0)}</div>
    <div class="faq-accordion-col">${renderCol(col1)}</div>`;
}

function renderIncludesIdealFor(c) {
  const grid = document.querySelector('.cards-2');
  if (!grid) return;

  const cards = grid.querySelectorAll('.card');
  const includesCard = cards[0];
  const idealCard = cards[1];

  if (includesCard && c.whats_included?.length) {
    const h3 = includesCard.querySelector('h3');
    if (h3 && c.whats_included_title) h3.textContent = c.whats_included_title;
    const tagRow = includesCard.querySelector('.tag-row');
    if (tagRow) tagRow.innerHTML = c.whats_included.map(t => `<span class="tag">${esc(t)}</span>`).join('');
  }

  if (idealCard && c.ideal_for?.length) {
    const h3 = idealCard.querySelector('h3');
    if (h3 && c.ideal_for_title) h3.textContent = c.ideal_for_title;
    const list = idealCard.querySelector('.list');
    if (list) list.innerHTML = c.ideal_for.map(item => `<li>${esc(item)}</li>`).join('');
  }
}

function renderPrice(c) {
  if (!c.price) return;
  const priceBig = document.querySelector('.price-big');
  if (priceBig) {
    const price = Number(c.price).toLocaleString('es-ES');
    if (c.original_price && Number(c.original_price) > Number(c.price)) {
      const old = Number(c.original_price).toLocaleString('es-ES');
      const savings = Number(c.original_price) - Number(c.price);
      priceBig.innerHTML = `<span class="old-price">${old}€</span> ${price}€`;
      const savingsEl = document.querySelector('.savings');
      if (savingsEl) savingsEl.textContent = `Ahorras ${savings}€`;
    } else {
      priceBig.textContent = `${price}€`;
      const savingsEl = document.querySelector('.savings');
      if (savingsEl) savingsEl.style.display = 'none';
    }
  }

  // Also update deposit text
  const metaP = document.querySelector('.price-big + .savings + .meta, .price-big ~ .meta');
  if (metaP && c.deposit) {
    metaP.textContent = `Reserva con ${Number(c.deposit)}€ · resto la semana antes del trip.`;
  }
}

// La tarjeta de reserva y el chip de duración estaban escritos a mano en cada
// HTML, así que se quedaban desfasados en cuanto se tocaba el camp en el panel
// (de ahí el "9–13 Septiembre" con las fechas ya cambiadas a 10–13).
function renderBookingCard(c) {
  const card = document.querySelector('.booking-card');
  if (card && c.title) {
    const h3 = card.querySelector('h3');
    if (h3) h3.textContent = c.title;
  }
  // Nombre que viaja al carrito y al pedido
  document.querySelectorAll('[data-reserve-camp]').forEach(btn => {
    if (c.title) btn.dataset.campName = c.title;
  });

  // Chip de duración: se localiza por patrón ("4 días / 3 noches"), no por
  // posición, para no depender del orden de los tags en cada página.
  const label = c.duration_label || durationFromDates(c);
  if (!label) return;
  document.querySelectorAll('.tag').forEach(tag => {
    if (/^\s*\d+\s*d[ií]as?\s*\/\s*\d+\s*noches?\s*$/i.test(tag.textContent)) {
      tag.textContent = label;
    }
  });
}

/* ---------- Oferta por volumen, en grande ---------- */
// Bloque destacado con el precio de 1, 2, 3… plazas. Se pinta desde los tramos
// del camp, así que basta con tocarlos en el panel para que cambie aquí.
function renderVolumeOffer(c) {
  const tiers = (c.tiers || []).slice().sort((a, b) => a.spots - b.spots);
  if (tiers.length < 2) return;   // con un solo tramo no hay oferta que enseñar

  const intro = document.querySelector('.booking-card')?.closest('.two-col')?.querySelector('.page-intro');
  if (!intro) return;

  const cards = tiers.map(t => {
    const n = Number(t.spots);
    const { total, perPerson, saving } = campPriceFor(n, c, tiers);
    return `
      <div class="camp-vol-item${saving > 0 ? ' is-deal' : ''}">
        <span class="camp-vol-qty">${n === 1 ? '1 plaza' : `${n} plazas`}</span>
        <span class="camp-vol-total">${formatEuro(total)}</span>
        ${n > 1 ? `<span class="camp-vol-each">${formatEuro(perPerson)} por persona</span>` : '<span class="camp-vol-each">precio individual</span>'}
        ${saving > 0 ? `<span class="camp-vol-save">Ahorras ${formatEuro(saving)}</span>` : ''}
      </div>`;
  }).join('');

  const box = document.createElement('div');
  box.className = 'camp-vol';
  box.innerHTML = `
    <p class="camp-vol-kicker">Cuantos más, mejor precio</p>
    <div class="camp-vol-grid">${cards}</div>`;

  const tagRow = intro.querySelector('.tag-row');
  if (tagRow) tagRow.insertAdjacentElement('afterend', box);
  else intro.appendChild(box);
}

/* ---------- Selector de plazas + precio por volumen ---------- */
// Estado vivo de la tarjeta: cuántas plazas quiere el cliente.
let selectedSpots = 1;

function renderSpotsPicker(c) {
  const card = document.querySelector('.booking-card');
  if (!card || !c.tiers?.length) return;   // sin tramos, la tarjeta se queda como estaba

  const libres = Math.max(Number(c.max_spots || 0) - Number(c.spots_taken || 0), 0);
  const maxTier = Math.max(...c.tiers.map(t => Number(t.spots)));
  // Tope: lo que quede libre, y si no hay límite por tramos dejamos llegar al mayor + 3
  const max = Math.max(1, Math.min(libres || 1, c.extra_spot_price != null ? Math.max(maxTier + 3, libres) : maxTier));

  const opciones = [];
  for (let i = 1; i <= max; i++) opciones.push(i);
  if (!opciones.length) return;

  const wrap = document.createElement('div');
  wrap.className = 'camp-spots-picker';
  wrap.innerHTML = `
    <label class="camp-spots-label" for="camp-spots">¿Cuántas plazas?</label>
    <select id="camp-spots" class="camp-spots-select">
      ${opciones.map(i => `<option value="${i}">${i} ${i === 1 ? 'plaza' : 'plazas'}</option>`).join('')}
    </select>
    <p class="camp-spots-hint"></p>`;

  const priceEl = card.querySelector('.price-big');
  if (priceEl) priceEl.insertAdjacentElement('beforebegin', wrap);
  else card.querySelector('h3')?.insertAdjacentElement('afterend', wrap);

  const sel = wrap.querySelector('#camp-spots');
  sel.addEventListener('change', () => {
    selectedSpots = Number(sel.value) || 1;
    paintPriceFor(c);
  });
  paintPriceFor(c);
}

// Repinta precio, señal y ahorro según las plazas elegidas.
function paintPriceFor(c) {
  const n = selectedSpots;
  const { total, perPerson, saving } = campPriceFor(n, c, c.tiers);
  const deposit = (Number(c.deposit) || 180) * n;

  const priceBig = document.querySelector('.price-big');
  if (priceBig) {
    const sinDescuento = (Number(c.original_price) || Number(c.price) || 0) * n;
    priceBig.innerHTML = sinDescuento > total
      ? `<span class="old-price">${formatEuro(sinDescuento)}</span> ${formatEuro(total)}`
      : formatEuro(total);
  }

  const hint = document.querySelector('.camp-spots-hint');
  if (hint) {
    hint.textContent = n === 1
      ? ''
      : `${n} plazas × ${formatEuro(perPerson)} por persona${saving > 0 ? ` · ahorras ${formatEuro(saving)}` : ''}`;
  }

  const savingsEl = document.querySelector('.savings');
  if (savingsEl) {
    if (saving > 0) { savingsEl.textContent = `Ahorras ${formatEuro(saving)}`; savingsEl.style.display = ''; }
    else savingsEl.style.display = 'none';
  }

  const metaP = document.querySelector('.booking-card .meta');
  if (metaP) metaP.textContent = `Reserva con ${formatEuro(deposit)} · resto la semana antes del trip.`;
}

function durationFromDates(c) {
  if (!c.date_start || !c.date_end) return null;
  const days = Math.round((new Date(c.date_end + 'T00:00:00') - new Date(c.date_start + 'T00:00:00')) / 86400000) + 1;
  if (!Number.isFinite(days) || days < 1) return null;
  return `${days} días / ${Math.max(days - 1, 0)} noches`;
}

function renderSoldOut(c) {
  const isPast = c.date_start && new Date(c.date_start).getTime() < new Date().setHours(0, 0, 0, 0);
  // 'closed' y 'full' cuentan: si el panel cierra un camp, la web tiene que
  // dejar de venderlo (create-checkout ya lo rechaza, pero el cliente no debe
  // llegar hasta el pago para enterarse).
  const isSoldOut = isPast || c.sold_out || c.spots_taken >= c.max_spots
    || c.status === 'closed' || c.status === 'full';
  if (!isSoldOut) return;

  // Disable all reserve buttons
  document.querySelectorAll('[data-reserve-camp]').forEach(btn => {
    btn.disabled = true;
    btn.textContent = 'SOLD OUT';
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    btn.style.background = '#888';
    btn.removeAttribute('data-reserve-camp');
  });
}

function renderDeposit(c) {
  // Update reserve buttons with the correct deposit from Supabase
  document.querySelectorAll('[data-reserve-camp]').forEach(btn => {
    const deposit = Number(c.deposit) || 180;
    btn.dataset.campDeposit = deposit;
  });
}

/* ---------- Toast ---------- */
function showCartToast(msg) {
  let toast = document.querySelector('.cart-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'cart-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

/* ---------- Helpers ---------- */
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- Init ---------- */
async function init() {
  const slug = getCampSlug();
  if (!slug) return;

  const camp = await fetchCamp(slug);
  const isTemplate = document.body.dataset.campTemplate === '1';
  if (!camp) {
    // Template sirviendo un slug que no existe en BD → redirect
    if (isTemplate) window.location.replace('/surf-camp/');
    return;
  }

  // Update page title
  if (camp.meta_title) {
    document.title = camp.meta_title;
  } else if (camp.title) {
    document.title = `${camp.title} | Entre Olas`;
  }

  if (camp.meta_description) {
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = camp.meta_description;
  }

  renderHero(camp);
  renderPhotos(camp);
  renderIncludesIdealFor(camp);
  renderTestimonials(camp);
  renderFaqs(camp);
  renderPrice(camp);
  renderBookingCard(camp);
  renderVolumeOffer(camp);   // bloque grande con el precio de 1, 2, 3 plazas
  renderSpotsPicker(camp);   // repinta el precio si hay tramos por volumen
  renderDeposit(camp);
  renderSoldOut(camp); // must be after renderDeposit

  // Re-bind reserve buttons with dynamic deposit
  document.querySelectorAll('[data-reserve-camp]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const deposit = Number(btn.dataset.campDeposit) || Number(camp.deposit) || 180;
      const spots = Math.max(1, selectedSpots);
      const { total } = campPriceFor(spots, camp, camp.tiers);
      addItem({
        id: `camp-${camp.id}`,
        type: 'camp_reservation',
        // price = señal por plaza; el carrito multiplica por quantity
        name: spots > 1 ? `Reserva: ${camp.title} (${spots} plazas)` : `Reserva: ${camp.title}`,
        price: deposit,
        quantity: spots,
        metadata: { campId: camp.id, edition: camp.title, spots, totalAmount: total },
      });
      updateCartPill();
      showCartToast(`${camp.title} anadido al carrito`);
    });
  });
}

init();
