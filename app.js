import { supabase } from '/lib/supabase.js';
import '/lib/cookie-banner.js';
import { initHeader } from '/lib/header.js';
import { initFooter } from '/lib/footer.js';

// Header y footer únicos (sin duplicar markup) — ver lib/header.js / lib/footer.js
initHeader();
initFooter();

const revealNodes = document.querySelectorAll('.reveal-up');
if (revealNodes.length && 'IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.2, rootMargin: '0px 0px -10% 0px' },
  );
  revealNodes.forEach((node) => revealObserver.observe(node));
}

const autoVideos = document.querySelectorAll('video.auto-play-scroll');
if (autoVideos.length && 'IntersectionObserver' in window) {
  const videoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting) {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
          }
          return;
        }
        video.pause();
      });
    },
    { threshold: 0.45 },
  );
  autoVideos.forEach((video) => videoObserver.observe(video));
}

/* ---------- Contact forms — send via Supabase Edge Function ---------- */
document.querySelectorAll('form[data-mailto]').forEach(form => {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    const fd = new FormData(form);
    const fields = Object.fromEntries(fd.entries());
    const page = window.location.pathname;

    try {
      const res = await supabase.functions.invoke('send-email', {
        body: {
          to: form.dataset.mailto,
          type: 'contact',
          data: { ...fields, page, customerName: fields.nombre || '' },
        },
      });

      if (res.error) throw res.error;
      form.reset();
      if (btn) { btn.textContent = '¡Enviado!'; btn.style.background = '#22c55e'; }
      setTimeout(() => {
        if (btn) { btn.textContent = originalText; btn.style.background = ''; btn.disabled = false; }
      }, 3000);
    } catch (err) {
      console.error('Contact form error:', err);
      // Fallback: open mailto
      const body = [...Object.entries(fields)].map(([k, v]) => `${k}: ${v}`).join('\n');
      window.location.href = `mailto:${form.dataset.mailto}?subject=${encodeURIComponent('Consulta desde entreolasurf.com')}&body=${encodeURIComponent(body)}`;
      if (btn) { btn.textContent = originalText; btn.disabled = false; }
    }
  });
});

document.querySelectorAll('[data-toggle-audio]').forEach((toggle) => {
  const videoId = toggle.getAttribute('data-video');
  if (!videoId) return;
  const video = document.getElementById(videoId);
  if (!video) return;

  toggle.addEventListener('click', () => {
    video.muted = !video.muted;
    const soundOn = !video.muted;
    toggle.setAttribute('aria-pressed', String(soundOn));
    toggle.setAttribute('aria-label', soundOn ? 'Silenciar video' : 'Activar sonido');
    const icon = toggle.querySelector('span');
    if (icon) icon.textContent = soundOn ? '🔊' : '🔇';
    if (video.paused) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    }
  });
});
