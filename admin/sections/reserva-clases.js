/* ============================================================
   Reserva Clases — Bonos y reservas de clases (pagos web + admin)
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { formatDate, formatCurrency, showToast, statusBadge } from '../modules/ui.js';
import { TYPE_LABELS, TYPE_COLORS } from '../modules/constants.js';

const BONO_STATUSES = {
  active: 'Activo',
  expired: 'Expirado',
  fully_used: 'Agotado',
  cancelled: 'Cancelado',
};

const BONO_STATUS_COLORS = {
  active: '#22c55e',
  expired: '#ef4444',
  fully_used: '#6b7280',
  cancelled: '#f59e0b',
};

async function fetchBonos(statusFilter) {
  let query = supabase
    .from('bonos')
    .select('*, profiles:user_id(id, full_name, phone)')
    .order('created_at', { ascending: false });

  if (statusFilter) query = query.eq('status', statusFilter);
  const { data, error } = await query;
  if (error) { console.warn('fetchBonos:', error.message); return []; }
  return data || [];
}

async function fetchClassPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .in('reservation_type', ['enrollment', 'bono'])
    .order('payment_date', { ascending: false });
  if (error) { console.warn('fetchClassPayments:', error.message); return []; }
  return data || [];
}

export async function renderReservaClases(container) {
  let activeTab = 'bonos';
  let bonoFilter = '';

  async function render() {
    const [bonos, payments] = await Promise.all([
      fetchBonos(bonoFilter || undefined),
      fetchClassPayments(),
    ]);

    // Resolve profile names for payments
    const userIds = [...new Set(payments.filter(p => p.user_id).map(p => p.user_id))];
    let profileMap = {};
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      if (profiles) profiles.forEach(p => { profileMap[p.id] = p; });
    }

    const totalBonoRevenue = bonos.reduce((s, b) => s + Number(b.total_paid || 0), 0);
    const activeBonos = bonos.filter(b => b.status === 'active').length;
    const totalCredits = bonos.reduce((s, b) => s + (b.total_credits || 0), 0);
    const usedCredits = bonos.reduce((s, b) => s + (b.used_credits || 0), 0);
    const classPaymentTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

    const bonoFilterOptions = Object.entries(BONO_STATUSES).map(([val, label]) =>
      `<option value="${val}" ${bonoFilter === val ? 'selected' : ''}>${label}</option>`
    ).join('');

    container.innerHTML = `
      <!-- KPIs -->
      <div class="admin-stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 24px">
        <div class="admin-stat-card">
          <p class="admin-stat-label">Bonos vendidos</p>
          <p class="admin-stat-value">${bonos.length}</p>
          <p class="admin-stat-sub">${activeBonos} activos</p>
        </div>
        <div class="admin-stat-card">
          <p class="admin-stat-label">Ingresos bonos</p>
          <p class="admin-stat-value">${formatCurrency(totalBonoRevenue)}</p>
        </div>
        <div class="admin-stat-card">
          <p class="admin-stat-label">Créditos</p>
          <p class="admin-stat-value">${usedCredits} / ${totalCredits}</p>
          <p class="admin-stat-sub">${totalCredits > 0 ? Math.round(usedCredits / totalCredits * 100) : 0}% utilizados</p>
        </div>
        <div class="admin-stat-card">
          <p class="admin-stat-label">Pagos clases</p>
          <p class="admin-stat-value">${formatCurrency(classPaymentTotal)}</p>
          <p class="admin-stat-sub">${payments.length} pagos</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="admin-toolbar" style="gap:0; margin-bottom:0; border-bottom: 1px solid var(--color-line)">
        <button class="rc-tab ${activeTab === 'bonos' ? 'active' : ''}" data-tab="bonos">Bonos / Packs</button>
        <button class="rc-tab ${activeTab === 'pagos' ? 'active' : ''}" data-tab="pagos">Pagos de Clases</button>
      </div>

      <!-- Bonos tab -->
      <div class="rc-panel" id="rc-bonos" style="${activeTab === 'bonos' ? '' : 'display:none'}">
        <div class="admin-toolbar" style="margin-top:16px">
          <select class="admin-filter" id="rc-bono-filter">
            <option value="">Todos los estados</option>
            ${bonoFilterOptions}
          </select>
        </div>
        <div class="table-wrap" style="margin-top:8px">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Créditos</th>
                <th>Pagado</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${bonos.length ? bonos.map(b => {
                const name = b.profiles?.full_name || '—';
                const type = TYPE_LABELS[b.class_type] || b.class_type || '—';
                const color = TYPE_COLORS[b.class_type] || '#64748b';
                const status = BONO_STATUSES[b.status] || b.status;
                const statusColor = BONO_STATUS_COLORS[b.status] || '#6b7280';
                return `<tr>
                  <td>${name}</td>
                  <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>${type}</span></td>
                  <td>${b.used_credits || 0} / ${b.total_credits || 0}</td>
                  <td>${formatCurrency(b.total_paid || 0)}</td>
                  <td><span class="admin-badge" style="--badge-bg:${statusColor}18;--badge-color:${statusColor}">${status}</span></td>
                  <td>${formatDate(b.created_at)}</td>
                </tr>`;
              }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--color-muted);padding:32px">No hay bonos registrados</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Payments tab -->
      <div class="rc-panel" id="rc-pagos" style="${activeTab === 'pagos' ? '' : 'display:none'}">
        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Importe</th>
                <th>Método</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${payments.length ? payments.map(p => {
                const typeLabel = p.reservation_type === 'bono' ? 'Bono' : 'Clase';
                const method = p.payment_method || '—';
                return `<tr>
                  <td><span class="admin-badge" data-status="${p.reservation_type === 'bono' ? 'active' : 'confirmed'}">${typeLabel}</span></td>
                  <td>${formatCurrency(p.amount)}</td>
                  <td style="text-transform:capitalize">${method}</td>
                  <td>${formatDate(p.payment_date)}</td>
                </tr>`;
              }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--color-muted);padding:32px">No hay pagos de clases registrados</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Tab switching
    container.querySelectorAll('.rc-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        render();
      });
    });

    // Bono filter
    container.querySelector('#rc-bono-filter')?.addEventListener('change', (e) => {
      bonoFilter = e.target.value;
      render();
    });
  }

  await render();
}
