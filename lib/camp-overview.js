/* ============================================================
   Camp Overview — Sync camp cards with Supabase
   Handles: prices, sold out, offers, next-camp highlight.
   Works on /surf-camp/ and homepage.
   ============================================================ */
import { supabase } from '/lib/supabase.js';

async function init() {
  const { data: camps } = await supabase
    .from('surf_camps')
    .select('slug, sold_out, spots_taken, max_spots, price, old_price, status, hero_image, date_start')
    .order('date_start');

  if (!camps?.length) return;

  const bySlug = {};
  camps.forEach(c => { bySlug[c.slug] = c; });

  const today = new Date().toISOString().slice(0, 10);
  let nextCampSlug = null;

  // Find the next upcoming available camp (not sold out, not past, not coming soon)
  for (const c of camps) {
    const isSoldOut = c.sold_out || c.spots_taken >= c.max_spots;
    if (!isSoldOut && c.date_start >= today && c.status !== 'coming_soon') {
      nextCampSlug = c.slug;
      break;
    }
  }

  // If no available camp found, highlight the first coming_soon as fallback
  if (!nextCampSlug) {
    const comingSoon = camps.find(c => c.status === 'coming_soon');
    if (comingSoon) nextCampSlug = comingSoon.slug;
  }

  document.querySelectorAll('.camp-card').forEach(card => {
    const link = card.querySelector('a[href*="surf-camp"]');
    if (!link) return;

    const href = link.getAttribute('href').replace(/^\/|\/$/g, '');
    const camp = bySlug[href];
    if (!camp) return;

    const isPast = camp.date_start < today;
    const isSoldOut = isPast || camp.sold_out || camp.spots_taken >= camp.max_spots;
    const remaining = Math.max(camp.max_spots - camp.spots_taken, 0);
    const hasOffer = camp.old_price && Number(camp.old_price) > Number(camp.price);

    // --- Spots text ---
    const metaSpans = card.querySelectorAll('.camp-meta span');
    if (metaSpans[0]) {
      if (isSoldOut) {
        metaSpans[0].textContent = 'AGOTADO';
      } else if (remaining <= 5) {
        metaSpans[0].textContent = 'Últimas plazas';
      }
    }

    // --- Price ---
    const priceEl = card.querySelector('.camp-from');
    if (priceEl && camp.price) {
      const price = Number(camp.price).toLocaleString('es-ES');
      if (hasOffer) {
        const old = Number(camp.old_price).toLocaleString('es-ES');
        priceEl.innerHTML = `<span class="old-price">${old}€</span> ${price}€`;
      } else {
        priceEl.textContent = `Desde ${price}€`;
      }
    }

    // --- Offer badge ---
    const cover = card.querySelector('.camp-cover');
    const existingBadge = cover?.querySelector('.camp-badge');
    if (hasOffer && !isSoldOut) {
      if (existingBadge) {
        existingBadge.textContent = 'OFERTA';
        existingBadge.className = 'camp-badge camp-badge-offer';
      } else if (cover) {
        const badge = document.createElement('span');
        badge.className = 'camp-badge camp-badge-offer';
        badge.textContent = 'OFERTA';
        cover.appendChild(badge);
      }
    }

    // --- Hero image ---
    const img = card.querySelector('.camp-cover img');
    if (img && camp.hero_image) img.src = camp.hero_image;

    // --- Sold out ---
    if (isSoldOut) {
      card.classList.add('camp-card-soldout');

      // Replace badge
      if (existingBadge) {
        existingBadge.textContent = 'SOLD OUT';
        existingBadge.className = 'camp-badge camp-badge-soldout';
      } else if (cover) {
        const badge = document.createElement('span');
        badge.className = 'camp-badge camp-badge-soldout';
        badge.textContent = 'SOLD OUT';
        cover.appendChild(badge);
      }

      // Disable all links — can't enter the page
      card.querySelectorAll('a').forEach(a => {
        a.removeAttribute('href');
        a.style.pointerEvents = 'none';
      });

      // Replace buttons
      const actions = card.querySelector('.camp-actions');
      if (actions) {
        actions.innerHTML = '<span class="btn disabled" style="width:100%;text-align:center">SOLD OUT</span>';
      }
    }

    // --- Highlight next camp ---
    if (href === nextCampSlug) {
      card.classList.add('camp-card-next');
    }
  });
}

init();
