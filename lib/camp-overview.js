/* ============================================================
   Camp Overview — Sync camp cards with Supabase
   Handles: prices, offers, sold out, past dates, next-camp highlight.
   Works on /surf-camp/ and homepage.
   ============================================================ */
import { supabase } from '/lib/supabase.js';

async function init() {
  const { data: camps, error } = await supabase
    .from('surf_camps')
    .select('slug, sold_out, spots_taken, max_spots, price, original_price, deposit, status, hero_image, date_start')
    .order('date_start');

  if (error || !camps?.length) return;

  const bySlug = {};
  camps.forEach(c => { bySlug[c.slug] = c; });

  const todayMs = new Date().setHours(0, 0, 0, 0);
  const isPast = (d) => d && new Date(d).getTime() < todayMs;
  const isFuture = (d) => d && new Date(d).getTime() >= todayMs;
  let nextCampSlug = null;

  // Find the next upcoming available camp
  for (const c of camps) {
    const soldOut = c.sold_out || c.spots_taken >= c.max_spots || isPast(c.date_start);
    if (!soldOut && isFuture(c.date_start) && c.status !== 'coming_soon') {
      nextCampSlug = c.slug;
      break;
    }
  }
  if (!nextCampSlug) {
    const cs = camps.find(c => c.status === 'coming_soon');
    if (cs) nextCampSlug = cs.slug;
  }

  document.querySelectorAll('.camp-card').forEach(card => {
    const link = card.querySelector('a[href*="surf-camp"]');
    if (!link) return;

    const href = link.getAttribute('href').replace(/^\/|\/$/g, '');
    const camp = bySlug[href];
    if (!camp) return;

    const isSoldOut = isPast(camp.date_start) || camp.sold_out || camp.spots_taken >= camp.max_spots;
    const remaining = Math.max(camp.max_spots - camp.spots_taken, 0);
    const hasOffer = camp.original_price && Number(camp.original_price) > Number(camp.price);

    // --- Price (always sync from DB) ---
    const priceEl = card.querySelector('.camp-from');
    if (priceEl && camp.price) {
      const price = Number(camp.price).toLocaleString('es-ES');
      if (hasOffer && !isSoldOut) {
        const original = Number(camp.original_price).toLocaleString('es-ES');
        priceEl.innerHTML = `<span class="old-price">${original}€</span> ${price}€`;
      } else {
        priceEl.textContent = `Desde ${price}€`;
      }
    }

    // --- Deposit ---
    const depositSpan = card.querySelector('.camp-meta span:last-child');
    if (depositSpan && camp.deposit) {
      const text = depositSpan.textContent;
      if (text.includes('Reserva')) {
        depositSpan.textContent = `Reserva ${Number(camp.deposit)}€`;
      }
    }

    // --- Spots text ---
    const metaSpans = card.querySelectorAll('.camp-meta span');
    if (metaSpans[0]) {
      if (isSoldOut) {
        metaSpans[0].textContent = 'AGOTADO';
      } else if (remaining <= 5) {
        metaSpans[0].textContent = 'Últimas plazas';
      }
    }

    // --- Badge ---
    const cover = card.querySelector('.camp-cover');
    const existingBadge = cover?.querySelector('.camp-badge');

    if (isSoldOut) {
      // --- SOLD OUT ---
      card.classList.add('camp-card-soldout');

      if (existingBadge) {
        existingBadge.textContent = 'SOLD OUT';
        existingBadge.className = 'camp-badge camp-badge-soldout';
      } else if (cover) {
        const b = document.createElement('span');
        b.className = 'camp-badge camp-badge-soldout';
        b.textContent = 'SOLD OUT';
        cover.appendChild(b);
      }

      // Disable all links
      card.querySelectorAll('a').forEach(a => {
        a.removeAttribute('href');
        a.style.pointerEvents = 'none';
      });

      // Replace buttons
      const actions = card.querySelector('.camp-actions');
      if (actions) {
        actions.innerHTML = '<span class="btn disabled" style="width:100%;text-align:center">SOLD OUT</span>';
      }
    } else if (hasOffer) {
      // --- OFERTA badge ---
      if (existingBadge) {
        existingBadge.textContent = 'OFERTA';
        existingBadge.className = 'camp-badge camp-badge-offer';
      } else if (cover) {
        const b = document.createElement('span');
        b.className = 'camp-badge camp-badge-offer';
        b.textContent = 'OFERTA';
        cover.appendChild(b);
      }
    } else if (existingBadge) {
      // No offer and not sold out — remove stale badge
      existingBadge.remove();
    }

    // --- Hero image ---
    const img = card.querySelector('.camp-cover img');
    if (img && camp.hero_image) img.src = camp.hero_image;

    // --- Highlight next camp ---
    if (href === nextCampSlug) {
      card.classList.add('camp-card-next');
    }
  });
}

init();
