import { updateCartPill } from '/lib/cart.js';
import { supabase } from '/lib/supabase.js';
import '/lib/cookie-banner.js';
updateCartPill();

/* ---------- Hide nav links for deactivated activities ---------- */
(async () => {
  try {
    const { data: activities } = await supabase
      .from('activities')
      .select('slug, activo');
    if (!activities) return;
    const inactive = new Set(
      activities.filter(a => !a.activo).map(a => `/${a.slug}/`)
    );
    if (inactive.size === 0) return;

    // Hide dropdown links for inactive activities
    document.querySelectorAll('.main-nav .dropdown a[href]').forEach(link => {
      if (inactive.has(link.getAttribute('href'))) {
        link.style.display = 'none';
      }
    });

    // Fix top-level trigger: if it points to an inactive activity,
    // re-point it to the first visible dropdown child
    document.querySelectorAll('.main-nav .nav-item.has-dd').forEach(item => {
      const trigger = item.querySelector(':scope > a');
      if (!trigger || !inactive.has(trigger.getAttribute('href'))) return;
      const visibleChild = item.querySelector('.dropdown a:not([style*="display: none"])');
      if (visibleChild) {
        trigger.setAttribute('href', visibleChild.getAttribute('href'));
      } else {
        // All children hidden — hide the whole nav group
        item.style.display = 'none';
      }
    });
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
