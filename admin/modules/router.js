/* ============================================================
   Hash Router — Admin Panel SPA navigation
   ============================================================ */
import { getUser } from './auth.js';

const routes = {};
let contentEl = null;
let titleEl = null;

const sectionTitles = {
  dashboard: 'Dashboard',
  estadisticas: 'Estadísticas',
  reservas: 'Reservas',
  actividades: 'Actividades',
  camps: 'Surf Camps',
  calendario: 'Calendario Clases',
  material: 'Material',
  productos: 'Productos',
  pedidos: 'Pedidos',
  clientes: 'Clientes'
};

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

  const hash = (location.hash || '#dashboard').replace('#', '');
  const renderFn = routes[hash];

  // Update topbar title
  if (titleEl) titleEl.textContent = sectionTitles[hash] || hash;

  // Update sidebar active
  document.querySelectorAll('.admin-nav-item a').forEach(a => {
    a.classList.toggle('active', a.dataset.section === hash);
  });

  // Close mobile sidebar
  document.getElementById('admin-sidebar')?.classList.remove('open');
  document.getElementById('admin-overlay')?.classList.remove('open');

  if (renderFn && contentEl) {
    contentEl.innerHTML = '<p style="color:var(--color-muted)">Cargando…</p>';
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
