/* ============================================================
   Hash Router — Admin Panel SPA navigation
   ============================================================ */
import { getUser, getProfile } from './auth.js';
import { showToast } from './ui.js';

const routes = {};
let contentEl = null;
let titleEl = null;

const sectionTitles = {
  dashboard: 'Dashboard',
  estadisticas: 'Estadísticas',
  reservas: 'Reservas Camps',
  actividades: 'Actividades',
  camps: 'Surf Camps',
  calendario: 'Calendario Clases',
  material: 'Material',
  productos: 'Productos',
  pedidos: 'Pedidos Tienda',
  clientes: 'Clientes',
  'reserva-clases': 'Reserva Clases',
  cupones: 'Cupones',
  equipo: 'Equipo',
};

// Secciones restringidas: solo role='admin' puede acceder
const ADMIN_ONLY_SECTIONS = new Set(['estadisticas', 'cupones', 'equipo']);

function currentRole() {
  return getProfile()?.role || null;
}

// Oculta del sidebar los items cuyo data-roles no incluye el rol actual
export function applyRolePermissions() {
  const role = currentRole();
  document.querySelectorAll('a.admin-nav-item[data-roles]').forEach(a => {
    const allowed = a.dataset.roles.split(',').map(s => s.trim());
    a.style.display = allowed.includes(role) ? '' : 'none';
  });
}

// Register a route
export function register(hash, renderFn) {
  routes[hash] = renderFn;
}

// Initialize router
export function initRouter() {
  contentEl = document.getElementById('admin-content');
  titleEl = document.getElementById('section-title');

  window.addEventListener('hashchange', () => navigate());
  navigate();
}

// Navigate to current hash
export async function navigate() {
  if (!getUser()) return;

  let hash = (location.hash || '#dashboard').replace('#', '');

  // Bloqueo por rol: encargado intentando entrar a sección admin-only
  if (ADMIN_ONLY_SECTIONS.has(hash) && currentRole() !== 'admin') {
    showToast('Sin permisos para esa sección', 'error');
    location.hash = '#dashboard';
    return; // hashchange disparará navigate() de nuevo con #dashboard
  }

  const renderFn = routes[hash];

  // Update topbar title
  if (titleEl) titleEl.textContent = sectionTitles[hash] || hash;

  // Update sidebar active
  document.querySelectorAll('a.admin-nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.section === hash);
  });

  // Close mobile sidebar
  document.getElementById('admin-sidebar')?.classList.remove('open');
  document.getElementById('admin-overlay')?.classList.remove('open');

  if (renderFn && contentEl) {
    contentEl.innerHTML = `<div class="admin-skeleton">
      <div class="admin-skeleton-row"><div class="admin-skeleton-block w-md h-lg"></div><div class="admin-skeleton-block w-sm"></div></div>
      <div class="admin-skeleton-row"><div class="admin-skeleton-block w-full h-card"></div><div class="admin-skeleton-block w-full h-card"></div></div>
      <div class="admin-skeleton-row"><div class="admin-skeleton-block w-full h-card"></div><div class="admin-skeleton-block w-full h-card"></div></div>
    </div>`;
    try {
      await renderFn(contentEl);
    } catch (err) {
      contentEl.innerHTML = `<div class="admin-empty"><p>Error al cargar: ${err.message}</p></div>`;
      console.error(err);
    }
  } else if (contentEl) {
    contentEl.innerHTML = '<div class="admin-empty"><p>Sección no encontrada</p></div>';
  }
}
