/* ============================================================
   i18n — traducción ES (principal) → EN por diccionario.
   El HTML está en español; si el idioma activo es 'en', se
   recorren los nodos de texto y atributos y se sustituyen por su
   traducción del diccionario. Lo no traducido se queda en español.
   El idioma se guarda en localStorage; al cambiar, se recarga.
   ============================================================ */
const LANG_KEY = 'eo_lang';

export function getLang() {
  try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'es'; } catch { return 'es'; }
}

export function setLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang === 'en' ? 'en' : 'es'); } catch {}
  location.reload();
}

// Diccionario ES → EN. Clave = texto español EXACTO (trim). Ir ampliando.
const EN = {
  // ---- Navegación / header ----
  'Escuela de Surf': 'Surf School',
  'Surf Camp': 'Surf Camp',
  'Servicios': 'Services',
  'Tienda': 'Shop',
  'Contacto': 'Contact',
  'Mi cuenta': 'My account',
  'Clases grupales': 'Group lessons',
  'Clases individuales': 'Private lessons',
  'Alquiler de material': 'Gear rental',
  'Vista general': 'Overview',
  'Clases de yoga': 'Yoga classes',
  'Paddle Surf': 'Paddle Surf',
  'Clases de SurfSkate': 'SurfSkate lessons',
  'Página de contacto': 'Contact page',

  // ---- Footer ----
  'Navegar': 'Browse',
  'Síguenos': 'Follow us',
  'Clases grupales': 'Group lessons',
  'Escuela de surf en Roche, Cádiz. Villa privada, clases para todos los niveles y la mejor experiencia surf de la costa.':
    'Surf school in Roche, Cádiz. Private villa, lessons for all levels and the best surf experience on the coast.',
  'Playa de Roche, Conil de la Frontera, Cádiz': 'Playa de Roche, Conil de la Frontera, Cádiz',
  '© 2026 Entre Olas Surf School. Todos los derechos reservados.': '© 2026 Entre Olas Surf School. All rights reserved.',
  'Aviso Legal': 'Legal Notice',
  'Política de Privacidad': 'Privacy Policy',
  'Política de Cookies': 'Cookie Policy',

  // ---- Home / hero ----
  'Playa de Roche, Cádiz': 'Playa de Roche, Cádiz',
  'Vive la experiencia del surf': 'Experience the surf',
  'Aprende a surfear con instructores profesionales. Clases para todos los niveles, material incluido, packs con descuento y Surf Camp +18 en villa privada.':
    'Learn to surf with professional instructors. Lessons for all levels, gear included, discounted packs and an 18+ Surf Camp in a private villa.',
  'Ver clases de surf': 'See surf lessons',
  'Conoce el Surf Camp': 'Discover the Surf Camp',

  // ---- CTAs / botones comunes ----
  'Reservar': 'Book',
  'Reservar clase': 'Book class',
  'Comprar bono': 'Buy pack',
  'Añadir al carrito': 'Add to cart',
  'Finalizar compra': 'Checkout',
  'Ver carrito': 'View cart',
  'Tu carrito': 'Your cart',
  'Tu carrito está vacío': 'Your cart is empty',
  'Ir a la tienda': 'Go to shop',
  'Seguir comprando': 'Keep shopping',
  'Total': 'Total',
  'Cancelar': 'Cancel',
  'Confirmar': 'Confirm',
  'Continuar': 'Continue',
  'Volver': 'Back',
  'Volver al inicio': 'Back to home',
  'Material incluido': 'Gear included',
  'Seguro de accidentes': 'Accident insurance',
  'Todos los niveles': 'All levels',
  'por persona': 'per person',

  // ---- Cuenta / panel ----
  'Mis datos': 'My details',
  'Mi Familia': 'My Family',
  'Mis Bonos': 'My Packs',
  'Reservar Clases': 'Book Classes',
  'Mis Clases': 'My Classes',
  'Mis Pagos': 'My Payments',
  'Mis Pedidos': 'My Orders',
  'Cerrar sesión': 'Log out',
  'Iniciar sesión': 'Log in',
  'Crear cuenta': 'Create account',
  'Bienvenido de nuevo': 'Welcome back',
  'Email': 'Email',
  'Contraseña': 'Password',
  '¿No tienes cuenta?': "Don't have an account?",
  'Consulta el calendario y reserva': 'Check the calendar and book',
  'No tienes créditos de clases': 'You have no class credits',
  'Compra un pack de clases para poder reservar en el calendario.': 'Buy a class pack to book on the calendar.',
  'Surf Grupal': 'Group Surf',
  'Surf Individual': 'Private Surf',
  'Yoga': 'Yoga',
  'SurfSkate': 'SurfSkate',
  'Todas': 'All',
  'Principiante': 'Beginner',
  'Intermedio': 'Intermediate',
  'Avanzado': 'Advanced',
};

const DICTS = { en: EN };

// ---- Caché de auto-traducción (rellena lo que no está en el diccionario) ----
const TR_CACHE_KEY = 'eo_tr_en';
let autoCache = (() => { try { return JSON.parse(localStorage.getItem(TR_CACHE_KEY)) || {}; } catch { return {}; } })();
let _saveTimer = null;
function saveCache() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { try { localStorage.setItem(TR_CACHE_KEY, JSON.stringify(autoCache)); } catch {} }, 400);
}

// Devuelve la traducción conocida (diccionario o caché) o undefined
function known(key) {
  return EN[key] !== undefined ? EN[key] : autoCache[key];
}
function translateText(s) {
  const key = s.trim();
  if (!key) return null;
  const hit = known(key);
  if (hit === undefined) return null;
  return s.replace(key, hit);
}

// ¿merece la pena auto-traducir esta cadena? (evita números, símbolos, muy cortas)
function shouldAuto(key) {
  if (key.length < 3 || key.length > 600) return false;
  if (!/[a-záéíóúñü]/i.test(key)) return false;
  return true;
}

const _pending = new Map();
async function fetchTranslation(key) {
  if (known(key) !== undefined) return known(key);
  if (_pending.has(key)) return _pending.get(key);
  const p = (async () => {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(key)}&langpair=es|en&de=entreolasurf@gmail.com`;
      const r = await fetch(url);
      const d = await r.json();
      const t = d && d.responseData && d.responseData.translatedText;
      if (t && d.responseStatus === 200 && !/MYMEMORY WARNING|QUOTA/i.test(t)) {
        autoCache[key] = t; saveCache(); return t;
      }
    } catch {}
    return null;
  })();
  _pending.set(key, p);
  const out = await p;
  _pending.delete(key);
  return out;
}

// Cola de auto-traducción con concurrencia limitada
const _queue = [];
let _active = 0;
function enqueueAuto(key, apply) {
  _queue.push({ key, apply });
  pumpQueue();
}
function pumpQueue() {
  while (_active < 4 && _queue.length) {
    const { key, apply } = _queue.shift();
    _active++;
    fetchTranslation(key).then(t => { if (t) apply(t); }).finally(() => { _active--; pumpQueue(); });
  }
}

const ATTRS = ['placeholder', 'title', 'alt', 'aria-label', 'value'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE']);

export function translateTree(root) {
  if (getLang() !== 'en') return;
  if (!root) root = document.body;
  if (root.nodeType === 1 && root.closest && root.closest('[data-i18n-skip]')) return;

  // Nodos de texto
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && SKIP_TAGS.has(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && node.parentElement.closest('[data-i18n-skip]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    const original = n.nodeValue;
    const out = translateText(original);
    if (out !== null) { n.nodeValue = out; return; }
    const key = original.trim();
    if (shouldAuto(key)) {
      enqueueAuto(key, (t) => { if (n.nodeValue === original) n.nodeValue = original.replace(key, t); });
    }
  });

  // Atributos traducibles
  const els = root.querySelectorAll ? root.querySelectorAll('[placeholder],[title],[alt],[aria-label]') : [];
  els.forEach(el => {
    if (el.closest('[data-i18n-skip]')) return;
    ATTRS.forEach(attr => {
      if (!el.hasAttribute(attr)) return;
      const original = el.getAttribute(attr);
      const out = translateText(original);
      if (out !== null) { el.setAttribute(attr, out); return; }
      const key = original.trim();
      if (shouldAuto(key)) {
        enqueueAuto(key, (t) => { if (el.getAttribute(attr) === original) el.setAttribute(attr, original.replace(key, t)); });
      }
    });
  });
}

// Aplica al documento + marca <html lang>
export function applyLang() {
  const lang = getLang();
  document.documentElement.setAttribute('lang', lang);
  if (lang === 'en') translateTree(document.body);
}

// Inicializa: traduce lo presente y observa contenido dinámico (tabs, modales,
// páginas de actividad, carrito, picker…) para traducirlo según se inserta.
let _observer = null;
export function initI18n() {
  applyLang();
  if (getLang() !== 'en' || _observer) return;
  _observer = new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(n => {
        if (n.nodeType === 1) translateTree(n);
        else if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) {
          const original = n.nodeValue;
          const out = translateText(original);
          if (out !== null) { n.nodeValue = out; return; }
          const key = original.trim();
          if (shouldAuto(key)) enqueueAuto(key, (t) => { if (n.nodeValue === original) n.nodeValue = original.replace(key, t); });
        }
      });
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });
}

// Selector ES/EN (devuelve el HTML del control)
export function langSelectorHtml(variant = 'header') {
  const lang = getLang();
  return `
    <div class="lang-switch lang-switch-${variant}" data-i18n-skip>
      <button class="lang-opt ${lang === 'es' ? 'active' : ''}" data-lang="es">ES</button>
      <span class="lang-sep">/</span>
      <button class="lang-opt ${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
    </div>`;
}

// Enlaza los clicks de un selector dentro de un contenedor
export function wireLangSelector(root) {
  (root || document).querySelectorAll('.lang-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const l = btn.dataset.lang;
      if (l !== getLang()) setLang(l);
    });
  });
}
