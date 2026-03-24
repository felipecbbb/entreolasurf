/* ============================================================
   Camp Overview — Sync camp cards on /surf-camp/ with Supabase
   Applies sold_out status, spots, prices dynamically.
   ============================================================ */
import { supabase } from '/lib/supabase.js';

async function init() {
  const { data: camps } = await supabase
    .from('surf_camps')
    .select('slug, sold_out, spots_taken, max_spots, price, status, hero_image')
    .order('date_start');

  if (!camps?.length) return;

  // Map slugs to camp data
  const bySlug = {};
  camps.forEach(c => { bySlug[c.slug] = c; });

  // Find all camp cards and match by their link hrefs
  document.querySelectorAll('.camp-card').forEach(card => {
    const link = card.querySelector('a[href*="surf-camp"]');
    if (!link) return;

    const href = link.getAttribute('href').replace(/^\/|\/$/g, '');
    const camp = bySlug[href];
    if (!camp) return;

    const isSoldOut = camp.sold_out || camp.spots_taken >= camp.max_spots;

    // Update spots text — never show exact count publicly
    const metaSpans = card.querySelectorAll('.camp-meta span');
    if (metaSpans[0]) {
      const remaining = Math.max(camp.max_spots - camp.spots_taken, 0);
      if (isSoldOut) {
        metaSpans[0].textContent = '🚫 AGOTADO';
      } else if (remaining <= 5) {
        metaSpans[0].textContent = '🔥 Últimas plazas';
      }
      // else: leave default static text
    }

    // Update price
    const priceEl = card.querySelector('.camp-from');
    if (priceEl && camp.price) {
      priceEl.textContent = `Desde ${Number(camp.price).toLocaleString('es-ES')}€`;
    }

    // Update hero image
    const img = card.querySelector('.camp-cover img');
    if (img && camp.hero_image) img.src = camp.hero_image;

    if (isSoldOut) {
      // Add sold out badge
      const cover = card.querySelector('.camp-cover');
      const existingBadge = cover?.querySelector('.camp-badge');
      if (existingBadge) {
        existingBadge.textContent = 'SOLD OUT';
        existingBadge.style.background = '#b91c1c';
        existingBadge.style.color = '#fff';
      } else if (cover) {
        const badge = document.createElement('span');
        badge.className = 'camp-badge';
        badge.textContent = 'SOLD OUT';
        badge.style.background = '#b91c1c';
        badge.style.color = '#fff';
        cover.appendChild(badge);
      }

      // Disable reserve button
      const reserveBtn = card.querySelector('.btn.red');
      if (reserveBtn) {
        reserveBtn.textContent = 'SOLD OUT';
        reserveBtn.style.opacity = '0.5';
        reserveBtn.style.pointerEvents = 'none';
        reserveBtn.style.background = '#888';
      }

      // Grey out card slightly
      card.style.opacity = '0.75';
    }
  });
}

init();
