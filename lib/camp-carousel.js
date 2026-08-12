/* ============================================================
   Carrusel de fotos del Surf Camp
   ------------------------------------------------------------
   Scroll con snap (funciona a dedo en móvil/iPad sin JS), más flechas y
   puntos para escritorio. Sin librerías.
   Si el camp tiene fotos en la BD (camp_photos), camp-page.js las inyecta
   antes de inicializar: manda el panel, y el HTML es solo el respaldo.
   ============================================================ */

export function initCampCarousel(root) {
  const el = root || document.querySelector('.camp-carousel');
  if (!el || el.dataset.ready === '1') return;

  const track = el.querySelector('.camp-carousel-track');
  const slides = [...el.querySelectorAll('.camp-slide')];
  if (!track || slides.length === 0) return;

  const prev = el.querySelector('.camp-carousel-prev');
  const next = el.querySelector('.camp-carousel-next');
  const dotsWrap = el.querySelector('.camp-carousel-dots');

  // Una sola foto: sin controles ni puntos
  if (slides.length < 2) {
    prev?.remove(); next?.remove(); dotsWrap?.remove();
    el.dataset.ready = '1';
    return;
  }

  if (dotsWrap) {
    dotsWrap.innerHTML = slides.map((_, i) =>
      `<button class="camp-dot${i === 0 ? ' is-active' : ''}" type="button" aria-label="Ir a la foto ${i + 1}"></button>`
    ).join('');
  }
  const dots = [...(dotsWrap?.querySelectorAll('.camp-dot') || [])];

  const stepOf = () => {
    const a = slides[0].getBoundingClientRect();
    const b = slides[1]?.getBoundingClientRect();
    return b ? Math.round(b.left - a.left) : Math.round(a.width);
  };

  const indexOf = () => {
    const step = stepOf() || 1;
    return Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / step)));
  };

  function goTo(i) {
    const n = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: n * stepOf(), behavior: 'smooth' });
  }

  function paint() {
    const i = indexOf();
    dots.forEach((d, n) => d.classList.toggle('is-active', n === i));
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === slides.length - 1;
  }

  prev?.addEventListener('click', () => goTo(indexOf() - 1));
  next?.addEventListener('click', () => goTo(indexOf() + 1));
  dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));

  let raf = null;
  track.addEventListener('scroll', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(paint);
  }, { passive: true });

  // Flechas del teclado cuando el carrusel tiene el foco
  el.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(indexOf() - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(indexOf() + 1); }
  });

  window.addEventListener('resize', paint);
  paint();
  el.dataset.ready = '1';
}

// Auto-init para las páginas que no cargan camp-page.js
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initCampCarousel());
  } else {
    initCampCarousel();
  }
}
