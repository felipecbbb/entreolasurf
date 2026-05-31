import { supabase } from '/lib/supabase.js';
import '/lib/cookie-banner.js';
import { initHeader } from '/lib/header.js';
import { initFooter } from '/lib/footer.js';
import { initI18n } from '/lib/i18n.js';

// Header y footer únicos (sin duplicar markup) — ver lib/header.js / lib/footer.js
initHeader();
initFooter();
// Traducción ES→EN (idioma en localStorage). Traduce todo el documento + dinámico.
initI18n();

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
  // Anti-bot: honeypot oculto + marca de tiempo de carga
  if (!form.querySelector('.hp-field')) {
    const hp = document.createElement('input');
    hp.type = 'text'; hp.name = '_hp_website'; hp.className = 'hp-field';
    hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    form.appendChild(hp);
  }
  form.dataset.loadedAt = String(Date.now());

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn?.textContent;

    const fd = new FormData(form);
    const fields = Object.fromEntries(fd.entries());
    const honeypot = fields._hp_website || '';
    const elapsed = Date.now() - Number(form.dataset.loadedAt || 0);
    delete fields._hp_website;

    // Bot detectado: honeypot relleno o envío demasiado rápido (<2,5s) → fingir éxito y no enviar
    if (honeypot || elapsed < 2500) {
      form.reset();
      if (btn) { btn.textContent = '¡Enviado!'; btn.style.background = '#22c55e'; }
      setTimeout(() => { if (btn) { btn.textContent = originalText; btn.style.background = ''; btn.disabled = false; } }, 3000);
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    const page = window.location.pathname;

    try {
      const res = await supabase.functions.invoke('send-email', {
        body: {
          to: form.dataset.mailto,
          type: 'contact',
          data: { ...fields, page, customerName: fields.nombre || '', _hp: honeypot, _elapsed: elapsed },
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
