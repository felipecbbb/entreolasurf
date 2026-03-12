/* ============================================================
   Dashboard Section
   ============================================================ */
import { fetchStats, fetchRecentBookings } from '../modules/api.js';
import { renderTable, statusBadge, formatDate, formatCurrency } from '../modules/ui.js';

export async function renderDashboard(container) {
  const [stats, recent] = await Promise.all([
    fetchStats(),
    fetchRecentBookings(5)
  ]);

  const statsHTML = `
    <div class="admin-stats-grid">
      <div class="admin-stat-card">
        <p class="admin-stat-label">Total Reservas</p>
        <div class="admin-stat-value">${stats.totalBookings}</div>
      </div>
      <div class="admin-stat-card">
        <p class="admin-stat-label">Camps Próximos</p>
        <div class="admin-stat-value">${stats.upcomingCamps}</div>
      </div>
      <div class="admin-stat-card">
        <p class="admin-stat-label">Ingresos</p>
        <div class="admin-stat-value">${formatCurrency(stats.revenue)}</div>
      </div>
      <div class="admin-stat-card">
        <p class="admin-stat-label">Clases Programadas</p>
        <div class="admin-stat-value">${stats.scheduledClasses}</div>
      </div>
    </div>`;

  const tableHTML = renderTable(
    [
      { label: 'Cliente', render: r => r.profiles?.full_name || '—' },
      { label: 'Camp', render: r => r.surf_camps?.title || '—' },
      { label: 'Estado', render: r => statusBadge(r.status) },
      { label: 'Monto', render: r => formatCurrency(r.total_amount) },
      { label: 'Fecha', render: r => formatDate(r.created_at) }
    ],
    recent
  );

  container.innerHTML = `
    ${statsHTML}
    <h3 class="admin-section-sub">Últimas Reservas</h3>
    ${tableHTML}`;
}
