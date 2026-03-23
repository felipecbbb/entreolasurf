/* ============================================================
   Reserva Clases — Bonos y reservas de clases (pagos web + admin)
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { formatDate, formatCurrency, showToast, openModal, closeModal } from '../modules/ui.js';
import { TYPE_LABELS, TYPE_COLORS, PACK_PRICING } from '../modules/constants.js';

const BONO_STATUSES = {
  active: 'Activo',
  expired: 'Expirado',
  exhausted: 'Agotado',
  cancelled: 'Cancelado',
};

const BONO_STATUS_COLORS = {
  active: '#22c55e',
  expired: '#ef4444',
  exhausted: '#6b7280',
  cancelled: '#f59e0b',
};

const METHOD_LABELS = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia',
  voucher: 'Voucher', saldo: 'Saldo', online: 'Online', credit_balance: 'Saldo cuenta', otros: 'Otros',
};

async function fetchBonos(statusFilter) {
  let query = supabase
    .from('bonos')
    .select('*, profiles:user_id(id, full_name, phone, email)')
    .order('created_at', { ascending: false });

  if (statusFilter) query = query.eq('status', statusFilter);
  const { data, error } = await query;
  if (error) { console.warn('fetchBonos:', error.message); return []; }
  return data || [];
}

async function fetchClassPayments() {
  // All enrollment payments (includes class + bono payments)
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('reservation_type', 'enrollment')
    .order('payment_date', { ascending: false });
  if (error) { console.warn('fetchClassPayments:', error.message); return []; }
  return data || [];
}

async function fetchBonoPayments(bonoId) {
  // Bono payments use reservation_type='enrollment' and reference_id=bonoId
  // Also check enrollments linked to this bono
  const { data: directPayments } = await supabase
    .from('payments')
    .select('*')
    .eq('reservation_type', 'enrollment')
    .eq('reference_id', bonoId)
    .order('payment_date', { ascending: false });

  // Also find payments via enrollment IDs linked to this bono
  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('id')
    .eq('bono_id', bonoId);

  let enrollPayments = [];
  if (enrollments?.length) {
    const eIds = enrollments.map(e => e.id);
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('reservation_type', 'enrollment')
      .in('reference_id', eIds);
    if (data) enrollPayments = data;
  }

  // Merge and deduplicate
  const all = [...(directPayments || []), ...enrollPayments];
  const seen = new Set();
  return all.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
    .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
}

async function fetchBonoEnrollments(bonoId) {
  const { data, error } = await supabase
    .from('class_enrollments')
    .select('*, surf_classes:class_id(id, type, date, time_start, time_end)')
    .eq('bono_id', bonoId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

function getExpectedPrice(type, totalCredits) {
  const tiers = PACK_PRICING[type];
  if (!tiers) return 0;
  if (totalCredits < tiers.length) return tiers[totalCredits] || 0;
  const maxTier = tiers.length - 1;
  const maxPrice = tiers[maxTier];
  const perSession = maxPrice / maxTier;
  return maxPrice + (totalCredits - maxTier) * perSession;
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${bonos.length ? bonos.map(b => {
                const name = b.profiles?.full_name || '—';
                const type = TYPE_LABELS[b.class_type] || b.class_type || '—';
                const color = TYPE_COLORS[b.class_type] || '#64748b';
                const status = BONO_STATUSES[b.status] || b.status;
                const statusColor = BONO_STATUS_COLORS[b.status] || '#6b7280';
                const expected = getExpectedPrice(b.class_type, b.total_credits || 0);
                const paid = Number(b.total_paid || 0);
                const pending = Math.max(0, expected - paid);
                const pendingHtml = pending > 0 ? `<span style="color:#ef4444;font-size:.72rem;margin-left:4px">(debe ${formatCurrency(pending)})</span>` : '';
                return `<tr style="cursor:pointer" data-bono-id="${b.id}">
                  <td><strong>${name}</strong></td>
                  <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>${type}</span></td>
                  <td>${b.used_credits || 0} / ${b.total_credits || 0}</td>
                  <td>${formatCurrency(paid)}${pendingHtml}</td>
                  <td><span class="admin-badge" style="--badge-bg:${statusColor}18;--badge-color:${statusColor}">${status}</span></td>
                  <td>${formatDate(b.created_at)}</td>
                  <td><button class="admin-action-btn rc-view-btn" data-bono-id="${b.id}">Ver ficha</button></td>
                </tr>`;
              }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--color-muted);padding:32px">No hay bonos registrados</td></tr>'}
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
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Importe</th>
                <th>Método</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${payments.length ? payments.map(p => {
                const typeLabel = p.reservation_type === 'bono' ? 'Bono' : 'Clase';
                const method = METHOD_LABELS[p.payment_method] || p.payment_method || '—';
                const clientName = (p.user_id && profileMap[p.user_id]?.full_name) || '—';
                return `<tr>
                  <td>${clientName}</td>
                  <td><span class="admin-badge" data-status="${p.reservation_type === 'bono' ? 'active' : 'confirmed'}">${typeLabel}</span></td>
                  <td>${formatCurrency(p.amount)}</td>
                  <td>${method}</td>
                  <td>${formatDate(p.payment_date)}</td>
                </tr>`;
              }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--color-muted);padding:32px">No hay pagos de clases registrados</td></tr>'}
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

    // Click on bono row or "Ver ficha" button → open ficha
    container.querySelectorAll('[data-bono-id]').forEach(el => {
      const handler = async (e) => {
        // Don't trigger on filter select
        if (e.target.closest('.admin-filter')) return;
        const bonoId = el.dataset.bonoId;
        const bono = bonos.find(b => b.id === bonoId);
        if (bono) await openBonoFicha(bono);
      };
      if (el.tagName === 'TR') {
        el.addEventListener('click', handler);
      } else {
        el.addEventListener('click', (e) => { e.stopPropagation(); handler(e); });
      }
    });
  }

  // ---- Ficha de Bono ----
  async function openBonoFicha(bono) {
    const type = TYPE_LABELS[bono.class_type] || bono.class_type || '—';
    const color = TYPE_COLORS[bono.class_type] || '#64748b';
    const status = BONO_STATUSES[bono.status] || bono.status;
    const statusColor = BONO_STATUS_COLORS[bono.status] || '#6b7280';
    const clientName = bono.profiles?.full_name || '—';
    const clientPhone = bono.profiles?.phone || '—';
    const clientEmail = bono.profiles?.email || '—';

    // Expected price from pack pricing
    const expectedPrice = getExpectedPrice(bono.class_type, bono.total_credits || 0);
    const totalPaid = Number(bono.total_paid || 0);
    const pendingAmount = Math.max(0, expectedPrice - totalPaid);
    const isFullyPaid = pendingAmount <= 0;

    // Fetch payments and enrollments for this bono
    const [bonoPayments, enrollments] = await Promise.all([
      fetchBonoPayments(bono.id),
      fetchBonoEnrollments(bono.id),
    ]);

    // Credit usage bar
    const used = bono.used_credits || 0;
    const total = bono.total_credits || 0;
    const usagePct = total > 0 ? Math.round(used / total * 100) : 0;
    const barColor = usagePct >= 100 ? '#6b7280' : usagePct >= 80 ? '#f59e0b' : '#22c55e';

    // Expiry
    const expiresAt = bono.expires_at ? new Date(bono.expires_at) : null;
    const isExpired = expiresAt && expiresAt < new Date();
    const expiryStr = expiresAt ? formatDate(bono.expires_at) : 'Sin fecha';

    // Payments list
    const paymentsHtml = bonoPayments.length
      ? bonoPayments.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6">
          <div>
            <strong style="font-size:.85rem">${formatCurrency(p.amount)}</strong>
            <span style="color:var(--color-muted);font-size:.78rem;margin-left:8px">${METHOD_LABELS[p.payment_method] || p.payment_method || '—'}</span>
          </div>
          <span style="color:var(--color-muted);font-size:.78rem">${formatDate(p.payment_date)}</span>
        </div>`).join('')
      : '<p style="color:var(--color-muted);font-size:.85rem;padding:8px 0">Sin pagos registrados directamente al bono</p>';

    // Enrollments list (classes used with this bono)
    const enrollmentsHtml = enrollments.length
      ? enrollments.map(e => {
        const cls = e.surf_classes;
        const clsType = cls ? (TYPE_LABELS[cls.type] || cls.type) : '—';
        const clsDate = cls ? formatDate(cls.date) : '—';
        const clsTime = cls ? `${(cls.time_start || '').slice(0,5)} – ${(cls.time_end || '').slice(0,5)}` : '';
        const eStatus = e.status === 'completed' ? 'Asistió' : e.status === 'cancelled' ? 'Cancelada' : 'Inscrito';
        const eColor = e.status === 'completed' ? '#22c55e' : e.status === 'cancelled' ? '#ef4444' : '#0ea5e9';
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6;gap:12px">
            <div style="min-width:0">
              <div style="font-size:.85rem;font-weight:600">${clsType}</div>
              <div style="font-size:.76rem;color:var(--color-muted)">${clsDate} ${clsTime}</div>
            </div>
            <span class="admin-badge" style="--badge-bg:${eColor}18;--badge-color:${eColor};flex-shrink:0">${eStatus}</span>
          </div>`;
      }).join('')
      : '<p style="color:var(--color-muted);font-size:.85rem;padding:8px 0">No se han usado créditos aún</p>';

    openModal(`Ficha de Bono — ${type}`, `
      <div style="display:flex;flex-direction:column;gap:20px">
        <!-- Client info -->
        <div style="display:flex;gap:16px;align-items:center;padding:16px;background:#f8fafc;border-radius:10px">
          <div style="width:42px;height:42px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1rem;flex-shrink:0">
            ${clientName.charAt(0).toUpperCase()}
          </div>
          <div style="min-width:0">
            <div style="font-weight:700;font-size:.95rem;color:var(--color-navy)">${clientName}</div>
            <div style="font-size:.78rem;color:var(--color-muted)">${clientPhone} · ${clientEmail}</div>
            ${bono.profiles?.id ? `<a href="#clientes" class="rc-goto-client" data-client-id="${bono.profiles.id}" style="font-size:.72rem;color:#0ea5e9;text-decoration:underline;cursor:pointer">Ver ficha de cliente</a>` : ''}
          </div>
        </div>

        <!-- Status + type -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div>
            <div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:var(--color-muted);font-weight:600;margin-bottom:4px">Estado</div>
            <span class="admin-badge" style="--badge-bg:${statusColor}18;--badge-color:${statusColor}">${status}</span>
          </div>
          <div>
            <div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:var(--color-muted);font-weight:600;margin-bottom:4px">Tipo</div>
            <span style="display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:.88rem"><span style="width:10px;height:10px;border-radius:50%;background:${color}"></span>${type}</span>
          </div>
          <div>
            <div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:var(--color-muted);font-weight:600;margin-bottom:4px">Expira</div>
            <span style="font-size:.88rem;${isExpired ? 'color:#ef4444;font-weight:600' : ''}">${expiryStr}</span>
          </div>
        </div>

        <!-- Credit usage -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
            <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--color-muted);font-weight:600">Créditos usados</span>
            <span style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;color:var(--color-navy)">${used} / ${total}</span>
          </div>
          <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden">
            <div style="height:100%;width:${usagePct}%;background:${barColor};border-radius:5px;transition:width .3s"></div>
          </div>
          <div style="font-size:.74rem;color:var(--color-muted);margin-top:4px">${total - used} créditos restantes</div>
        </div>

        <!-- Payment status -->
        <div style="padding:16px;border-radius:10px;background:${isFullyPaid ? '#f0fdf4' : '#fef2f2'};border:1px solid ${isFullyPaid ? '#bbf7d0' : '#fecaca'}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700;color:${isFullyPaid ? '#166534' : '#b91c1c'};font-size:.88rem">
                ${isFullyPaid ? 'Pagado completamente' : 'Pendiente de pago'}
              </div>
              <div style="font-size:.78rem;color:${isFullyPaid ? '#15803d' : '#dc2626'};margin-top:2px">
                Pagado: ${formatCurrency(totalPaid)} ${expectedPrice > 0 ? `de ${formatCurrency(expectedPrice)}` : ''}
              </div>
            </div>
            ${!isFullyPaid && pendingAmount > 0 ? `<div style="font-family:'Bebas Neue',sans-serif;font-size:1.5rem;color:#b91c1c">${formatCurrency(pendingAmount)}</div>` : ''}
          </div>
        </div>

        <!-- Payments history -->
        <div>
          <h4 style="font-family:'Space Grotesk',sans-serif;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--color-muted);margin:0 0 8px">Historial de pagos</h4>
          ${paymentsHtml}
        </div>

        <!-- Enrollments (classes used) -->
        <div>
          <h4 style="font-family:'Space Grotesk',sans-serif;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--color-muted);margin:0 0 8px">Clases utilizadas (${enrollments.length})</h4>
          ${enrollmentsHtml}
        </div>

        <!-- Meta -->
        <div style="font-size:.72rem;color:#b0b8c1;border-top:1px solid #f3f4f6;padding-top:12px">
          ID: ${bono.id.slice(0, 8)} · Creado: ${formatDate(bono.created_at)}
        </div>
      </div>
    `);

    // Link to client ficha
    document.querySelector('.rc-goto-client')?.addEventListener('click', (e) => {
      e.preventDefault();
      const clientId = e.target.dataset.clientId;
      closeModal();
      location.hash = '#clientes';
      setTimeout(() => {
        const card = document.querySelector(`.cli-list-card[data-id="${clientId}"]`);
        if (card) card.click();
      }, 400);
    });
  }

  await render();
}
