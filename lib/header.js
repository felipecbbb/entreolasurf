/* ============================================================
   Header — fuente ÚNICA del header del sitio. Se inyecta por JS en
   todas las páginas (no se duplica markup en cada HTML).
   Incluye: logo (según ruta), navegación con dropdowns, menú móvil,
   carrito (icono → drawer lateral) y enlace de cuenta.
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { updateCartPill } from '/lib/cart.js';
import { openCartDrawer } from '/lib/cart-drawer.js';

// Definición declarativa de la navegación (única fuente)
const NAV = [
  { label: 'Escuela de Surf', href: '/clases-de-surf-grupales/', children: [
    { label: 'Clases grupales', href: '/clases-de-surf-grupales/' },
    { label: 'Clases individuales', href: '/clases-de-surf-individuales/' },
    { label: 'Alquiler de material', href: '/alquiler-de-material/' },
  ]},
  { label: 'Surf Camp', href: '/surf-camp/', children: [
    { label: 'Vista general', href: '/surf-camp/' },
  ]},
  { label: 'Servicios', href: '/clases-de-yoga/', children: [
    { label: 'Clases de yoga', href: '/clases-de-yoga/' },
    { label: 'Paddle Surf', href: '/paddle-surf/' },
    { label: 'Clases de SurfSkate', href: '/clases-de-surfskate/' },
  ]},
  { label: 'Tienda', href: '/tienda-2/' },
  { label: 'Contacto', href: '/contacto/', children: [
    { label: 'Página de contacto', href: '/contacto/' },
    { label: 'WhatsApp', href: 'https://wa.me/34634466130&text=%C2%A1Hola!%20Quer%C3%ADa%20informaci%C3%B3n%20acerca%20de%20los%20cursos', ext: true },
    { label: 'Instagram', href: 'https://www.instagram.com/entreolasurf/', ext: true },
  ]},
];

function logoHtml() {
  const isCamp = location.pathname.startsWith('/surf-camp');
  return isCamp
    ? `<a class="logo logo-surf-house" href="/"><span class="logo-line">ENTRE OLAS</span><span class="logo-line">SURF HOUSE</span></a>`
    : `<a class="logo" href="/"><span class="logo-entre">entre</span><span class="logo-olas">olas</span></a>`;
}

function navItemHtml(item) {
  const ext = item.ext ? ' target="_blank" rel="noopener"' : '';
  if (!item.children) {
    return `<div class="nav-item"><a href="${item.href}"${ext}>${item.label}</a></div>`;
  }
  return `
    <div class="nav-item has-dd">
      <a href="${item.href}">${item.label} <span class="caret">▾</span></a>
      <div class="dropdown">
        ${item.children.map(c => `<a href="${c.href}"${c.ext ? ' target="_blank" rel="noopener"' : ''}>${c.label}</a>`).join('')}
      </div>
    </div>`;
}

function headerHtml() {
  return `
    <div class="container nav-row">
      ${logoHtml()}
      <button class="menu-btn" aria-label="Abrir menú" aria-expanded="false">Menu</button>
      <nav class="main-nav" aria-label="Navegación principal">
        ${NAV.map(navItemHtml).join('')}
        <div class="nav-item">
          <a href="/mi-cuenta/" class="nav-account-link">
            <svg class="nav-account-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/></svg>
            Mi cuenta
          </a>
        </div>
        <div class="nav-item cart-nav">
          <a href="/carrito/" class="nav-cart-link" aria-label="Abrir carrito">
            <svg class="nav-cart-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
            <span class="cart-pill">0</span>
          </a>
        </div>
      </nav>
    </div>`;
}

function markActive(header) {
  const path = location.pathname.replace(/\/$/, '') + '/';
  header.querySelectorAll('.main-nav .nav-item > a[href^="/"]').forEach(a => {
    const href = a.getAttribute('href');
    if (href !== '/' && path.startsWith(href.replace(/\/$/, '') + '/')) {
      a.closest('.nav-item').classList.add('active');
    }
  });
}

const hasMobileWidth = () => window.matchMedia('(max-width: 820px)').matches;

function wireMenu(header) {
  const btn = header.querySelector('.menu-btn');
  const nav = header.querySelector('.main-nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('.nav-item.has-dd').forEach(item => {
    const trigger = item.querySelector(':scope > a');
    trigger?.addEventListener('click', (e) => {
      if (!hasMobileWidth()) return;
      e.preventDefault();
      item.classList.toggle('open');
    });
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (hasMobileWidth() && link.closest('.dropdown')) return;
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      nav.querySelectorAll('.nav-item.has-dd.open').forEach(i => i.classList.remove('open'));
    });
  });
}

function wireCart(header) {
  const link = header.querySelector('.cart-nav .nav-cart-link');
  link?.addEventListener('click', (e) => { e.preventDefault(); openCartDrawer(); });
}

// Reconstruye el dropdown de Surf Camp con los camps activos y oculta
// actividades desactivadas. Se ejecuta en cada página (datos de Supabase).
async function rebuildDynamicNav(header) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: activities }, { data: camps }] = await Promise.all([
      supabase.from('activities').select('slug, activo'),
      supabase.from('surf_camps').select('slug, title, date_start, date_end').order('date_start'),
    ]);

    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const campsList = camps || [];
    const activeCamps = campsList.filter(c => !c.date_end || c.date_end >= today);

    const campNavItem = [...header.querySelectorAll('.main-nav .nav-item.has-dd')]
      .find(item => item.querySelector(':scope > a')?.getAttribute('href') === '/surf-camp/');
    if (campNavItem) {
      const dropdown = campNavItem.querySelector('.dropdown');
      if (dropdown) {
        dropdown.innerHTML = ['<a href="/surf-camp/">Vista general</a>']
          .concat(activeCamps.map(c => `<a href="/${esc(c.slug)}/">${esc(c.title)}</a>`))
          .join('');
      }
    }

    const inactive = new Set((activities || []).filter(a => !a.activo).map(a => `/${a.slug}/`));
    const expiredSlugs = new Set(campsList.filter(c => c.date_end && c.date_end < today).map(c => `/${c.slug}/`));
    const hidden = new Set([...inactive, ...expiredSlugs]);
    if (hidden.size) {
      header.querySelectorAll('.main-nav .dropdown a[href]').forEach(link => {
        if (hidden.has(link.getAttribute('href'))) link.style.display = 'none';
      });
    }

    header.querySelectorAll('.main-nav .nav-item.has-dd').forEach(item => {
      const trigger = item.querySelector(':scope > a');
      if (!trigger || !inactive.has(trigger.getAttribute('href'))) return;
      const visibleChild = item.querySelector('.dropdown a:not([style*="display: none"])');
      if (visibleChild) trigger.setAttribute('href', visibleChild.getAttribute('href'));
      else item.style.display = 'none';
    });

    const currentPath = location.pathname.replace(/\/$/, '') + '/';
    if (expiredSlugs.has(currentPath)) window.location.replace('/surf-camp/');
  } catch { /* silent — la nav se queda como está si falla */ }
}

export function initHeader() {
  let header = document.querySelector('header.site-header');
  if (!header) {
    header = document.createElement('header');
    document.body.prepend(header);
  }
  header.className = 'site-header lp-header';
  header.innerHTML = headerHtml();

  markActive(header);
  wireMenu(header);
  wireCart(header);
  updateCartPill();
  rebuildDynamicNav(header);
}
