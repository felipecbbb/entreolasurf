import { updateCartPill } from '/lib/cart.js';
import { supabase } from '/lib/supabase.js';
import '/lib/cookie-banner.js';
updateCartPill();

/* ---------- Hide nav links for deactivated activities + expired camps ---------- */
(async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: activities }, { data: camps }] = await Promise.all([
      supabase.from('activities').select('slug, activo'),
      supabase.from('surf_camps').select('slug, title, date_start, date_end').order('date_start'),
    ]);

    const inactive = new Set(
      (activities || []).filter(a => !a.activo).map(a => `/${a.slug}/`)
    );

    // Expired camps: date_end before today → hide from nav
    const campsList = camps || [];
    const expiredSlugs = new Set(
      campsList.filter(c => c.date_end && c.date_end < today).map(c => `/${c.slug}/`)
    );
    const activeCamps = campsList.filter(c => !c.date_end || c.date_end >= today);

    // Rebuild the Surf Camp dropdown with only active camps, sorted by date_start
    const campNavItem = [...document.querySelectorAll('.main-nav .nav-item.has-dd')]
      .find(item => item.querySelector(':scope > a')?.getAttribute('href') === '/surf-camp/');
    if (campNavItem) {
      const dropdown = campNavItem.querySelector('.dropdown');
      if (dropdown) {
        const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const links = ['<a href="/surf-camp/">Vista general</a>']
          .concat(activeCamps.map(c => `<a href="/${esc(c.slug)}/">${esc(c.title)}</a>`));
        dropdown.innerHTML = links.join('');
      }
    }

    // Hide dropdown links for inactive activities or expired camps (any leftover static links)
    const hidden = new Set([...inactive, ...expiredSlugs]);
    if (hidden.size > 0) {
      document.querySelectorAll('.main-nav .dropdown a[href]').forEach(link => {
        if (hidden.has(link.getAttribute('href'))) {
          link.style.display = 'none';
        }
      });
    }

    // Fix top-level trigger: if it points to an inactive activity,
    // re-point it to the first visible dropdown child
    document.querySelectorAll('.main-nav .nav-item.has-dd').forEach(item => {
      const trigger = item.querySelector(':scope > a');
      if (!trigger || !inactive.has(trigger.getAttribute('href'))) return;
      const visibleChild = item.querySelector('.dropdown a:not([style*="display: none"])');
      if (visibleChild) {
        trigger.setAttribute('href', visibleChild.getAttribute('href'));
      } else {
        item.style.display = 'none';
      }
    });

    // If the user is currently on an expired camp page, redirect to /surf-camp/
    const currentPath = window.location.pathname.replace(/\/$/, '') + '/';
    if (expiredSlugs.has(currentPath)) {
      window.location.replace('/surf-camp/');
    }
  } catch (e) { /* silent — nav stays as-is if query fails */ }
})();

const btn = document.querySelector('.menu-btn');
const nav = document.querySelector('.main-nav');
const hasMobileWidth = () => window.matchMedia('(max-width: 820px)').matches;

if (btn && nav) {
  btn.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('.nav-item.has-dd').forEach((item) => {
    const trigger = item.querySelector(':scope > a');
    if (!trigger) return;

    trigger.addEventListener('click', (event) => {
      if (!hasMobileWidth()) return;
      event.preventDefault();
      item.classList.toggle('open');
    });
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (hasMobileWidth() && link.closest('.dropdown')) return;
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      nav.querySelectorAll('.nav-item.has-dd.open').forEach((item) => {
        item.classList.remove('open');
      });
    });
  });
}

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
