/* ============================================================
   Estadísticas Section — Full analytics with slide-in detail panels
   Business domains:
     - Servicios: Clases/Actividades + Alquiler Material (comparten calendario)
     - Bonos/Packs: créditos prepago para clases
     - Surf Camps: experiencias multi-día (reservas independientes)
     - Tienda Online: venta de productos físicos (sin relación con clases)
   ============================================================ */
import { fetchEstadisticas } from '../modules/api.js';
import { formatCurrency, formatDate, showToast } from '../modules/ui.js';
import { TYPE_LABELS, TYPE_COLORS, PACK_PRICING } from '../modules/constants.js';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('eos_admin_settings') || '{}'); } catch { return {}; }
}
function saveSettings(s) { localStorage.setItem('eos_admin_settings', JSON.stringify(s)); }
function getSetting(key, fallback) { return loadSettings()[key] ?? fallback; }

const BONO_STATUS = { active: 'Activo', expired: 'Expirado', exhausted: 'Agotado', cancelled: 'Cancelado' };
const BONO_COLORS = { active: '#22c55e', expired: '#ef4444', exhausted: '#6b7280', cancelled: '#f59e0b' };
const ORDER_STATUS = { pending: 'Pendiente', paid: 'Pagado', shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado' };
const BOOKING_STATUS = { pending: 'Pendiente', deposit_paid: 'Señal pagada', fully_paid: 'Pagado', cancelled: 'Cancelado', refunded: 'Reembolsado' };
const EQUIP_STATUS = { pending: 'Pendiente', confirmed: 'Confirmado', active: 'Activo', returned: 'Devuelto', cancelled: 'Cancelado' };
const METHOD_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', voucher: 'Voucher', saldo: 'Saldo', online: 'Online', otros: 'Otros' };
const METHOD_COLORS = { efectivo: '#22c55e', tarjeta: '#0ea5e9', transferencia: '#6366f1', voucher: '#f59e0b', saldo: '#8b5cf6', online: '#ec4899', otros: '#94a3b8' };

// ---- Slide-in panel ----
function showStatPanel(container, title, bodyHtml, color) {
  closeStatPanel(container);
  const overlay = document.createElement('div');
  overlay.className = 'stat-panel-overlay';
  const panel = document.createElement('div');
  panel.className = 'stat-panel';
  panel.innerHTML = `
    <div class="stat-panel-header">
      <div class="stat-panel-header-bar" style="background:${color || 'var(--color-navy)'}"></div>
      <h3>${title}</h3>
      <button class="stat-panel-close">&times;</button>
    </div>
    <div class="stat-panel-body">${bodyHtml}</div>
  `;
  container.appendChild(overlay);
  container.appendChild(panel);
  requestAnimationFrame(() => { overlay.classList.add('open'); panel.classList.add('open'); });
  const close = () => closeStatPanel(container);
  overlay.addEventListener('click', close);
  panel.querySelector('.stat-panel-close').addEventListener('click', close);
}

function closeStatPanel(container) {
  const overlay = container.querySelector('.stat-panel-overlay');
  const panel = container.querySelector('.stat-panel');
  if (overlay) { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); }
  if (panel) { panel.classList.remove('open'); setTimeout(() => panel.remove(), 200); }
}

function buildTable(headers, rows, emptyMsg = 'Sin datos en este período') {
  if (!rows.length) return `<p class="dash-empty">${emptyMsg}</p>`;
  return `<div class="stat-table-wrap"><table class="stat-detail-table">
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table></div>`;
}

function statusPill(label, color) {
  return `<span class="stat-status-pill" style="background:${color}15;color:${color};border:1px solid ${color}30">${label}</span>`;
}

function occBar(enrolled, max) {
  const pct = max > 0 ? Math.min(Math.round(enrolled / max * 100), 100) : 0;
  const color = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';
  return `<div class="stat-occ-bar-wrap">
    <div class="stat-occ-bar-track"><div class="stat-occ-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    <span class="stat-occ-bar-text">${enrolled}/${max} (${pct}%)</span>
  </div>`;
}

function typeBadge(type) {
  const color = TYPE_COLORS[type] || '#94a3b8';
  return `<span class="stat-type-badge" style="background:${color}15;color:${color};border:1px solid ${color}30">${TYPE_LABELS[type] || type || '—'}</span>`;
}

export async function renderEstadisticas(container) {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let dateFrom = getSetting('stat_from', fmtDate(monthStart));
  let dateTo = getSetting('stat_to', fmtDate(today));

  async function render() {
    container.innerHTML = '<p style="color:var(--color-muted);padding:24px">Cargando estadísticas…</p>';

    let data;
    try {
      data = await fetchEstadisticas(dateFrom, dateTo);
    } catch (err) {
      container.innerHTML = `<p style="color:#ef4444;padding:24px">Error: ${err.message}</p>`;
      return;
    }

    // ==================== CALCULATIONS ====================
    const payments = data.payments;
    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

    // Revenue by payment method
    const byMethod = {};
    payments.forEach(p => { const m = p.payment_method || 'otros'; byMethod[m] = (byMethod[m] || 0) + Number(p.amount || 0); });

    // Revenue by reservation type (line of business)
    const byResType = {};
    payments.forEach(p => { const t = p.reservation_type || 'otros'; byResType[t] = (byResType[t] || 0) + Number(p.amount || 0); });

    // --- SERVICIOS: Clases por tipo ---
    const classesByType = {};
    Object.keys(TYPE_LABELS).forEach(t => { classesByType[t] = { count: 0, students: 0, maxSlots: 0, classes: [] }; });
    data.classes.forEach(c => {
      const t = c.type || 'otros';
      if (!classesByType[t]) classesByType[t] = { count: 0, students: 0, maxSlots: 0, classes: [] };
      classesByType[t].count++;
      classesByType[t].students += c.enrolled_count || 0;
      classesByType[t].maxSlots += c.max_students || 0;
      classesByType[t].classes.push(c);
    });
    const totalClasses = data.classes.length;
    const totalStudents = data.classes.reduce((s, c) => s + (c.enrolled_count || 0), 0);
    const totalMaxSlots = data.classes.reduce((s, c) => s + (c.max_students || 0), 0);
    const avgOccupancy = totalMaxSlots > 0 ? Math.round(totalStudents / totalMaxSlots * 100) : 0;

    // Enrollments by class type
    const enrollByType = {};
    (data.enrollmentsWithType || []).forEach(e => {
      const t = e.class_type || 'otros';
      if (!enrollByType[t]) enrollByType[t] = { total: 0, withBono: 0, list: [] };
      enrollByType[t].total++;
      if (e.bono_id) enrollByType[t].withBono++;
      enrollByType[t].list.push(e);
    });
    const totalEnrollments = data.enrollments.length;
    const enrollWithBono = data.enrollments.filter(e => e.bono_id).length;
    const enrollmentRevenue = byResType['enrollment'] || 0;

    // --- SERVICIOS: Alquiler Material (comparte calendario con clases) ---
    const equip = data.equipDetailed || [];
    const rentalRevenue = equip.reduce((s, r) => s + Number(r.deposit_paid || 0), 0);
    const equipRevenue = byResType['equipment'] || 0;

    // Total servicios (clases + alquiler = lo que se gestiona en el calendario)
    const serviciosRevenue = enrollmentRevenue + equipRevenue + (byResType['bono'] || 0);

    // --- SURF CAMPS (experiencias independientes) ---
    const bookings = data.bookingsDetailed || [];
    const campRevenue = bookings.filter(b => ['deposit_paid', 'fully_paid'].includes(b.status)).reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const paidBookings = bookings.filter(b => ['deposit_paid', 'fully_paid'].includes(b.status)).length;

    // --- TIENDA ONLINE (productos, independiente de servicios) ---
    const orders = data.ordersDetailed || [];
    const paidOrders = orders.filter(o => ['paid', 'shipped', 'delivered'].includes(o.status));
    const orderRevenue = paidOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const ticketMedio = paidOrders.length > 0 ? Math.round(orderRevenue / paidOrders.length * 100) / 100 : 0;
    const ordersByStatus = {};
    orders.forEach(o => { const st = o.status || 'pending'; if (!ordersByStatus[st]) ordersByStatus[st] = []; ordersByStatus[st].push(o); });

    // --- BONOS/PACKS (créditos prepago para clases) ---
    const bonos = data.bonosDetailed || [];
    const bonoRevenue = bonos.reduce((s, b) => s + Number(b.total_paid || 0), 0);
    const totalCredits = bonos.reduce((s, b) => s + (b.total_credits || 0), 0);
    const usedCredits = bonos.reduce((s, b) => s + (b.used_credits || 0), 0);
    const activeBonos = bonos.filter(b => b.status === 'active').length;
    const bonosByType = {};
    Object.keys(TYPE_LABELS).forEach(t => { bonosByType[t] = { count: 0, credits: 0, used: 0, revenue: 0, list: [] }; });
    bonos.forEach(b => {
      const t = b.class_type || 'otros';
      if (!bonosByType[t]) bonosByType[t] = { count: 0, credits: 0, used: 0, revenue: 0, list: [] };
      bonosByType[t].count++;
      bonosByType[t].credits += b.total_credits || 0;
      bonosByType[t].used += b.used_credits || 0;
      bonosByType[t].revenue += Number(b.total_paid || 0);
      bonosByType[t].list.push(b);
    });

    // Top clients
    const clientPayments = {};
    payments.forEach(p => {
      const name = (p.user_id && data.profileMap?.[p.user_id]?.full_name) || null;
      if (!name) return;
      if (!clientPayments[name]) clientPayments[name] = { count: 0, total: 0, types: new Set() };
      clientPayments[name].count++;
      clientPayments[name].total += Number(p.amount || 0);
      clientPayments[name].types.add(p.reservation_type);
    });
    const topClients = Object.entries(clientPayments).sort((a, b) => b[1].total - a[1].total).slice(0, 10);

    const rangeLabel = getDateRangeLabel(dateFrom, dateTo);
    const maxTypeVal = Math.max(1, ...Object.values(classesByType).map(d => d.students));

    // Service type labels for revenue
    const RES_TYPE_LABELS = {
      enrollment: 'Clases / Actividades',
      bono: 'Bonos / Packs',
      booking: 'Surf Camps',
      order: 'Tienda (productos)',
      equipment: 'Alquiler material',
    };
    const RES_TYPE_COLORS = {
      enrollment: '#22c55e',
      bono: '#16a34a',
      booking: '#0ea5e9',
      order: '#f59e0b',
      equipment: '#8b5cf6',
    };

    // ==================== RENDER ====================
    container.innerHTML = `
      <div class="dash-controls">
        <div class="dash-date-range">
          <div class="dash-presets">
            <button class="dash-preset-btn ${rangeLabel === 'Hoy' ? 'active' : ''}" data-preset="today">Hoy</button>
            <button class="dash-preset-btn ${rangeLabel === 'Esta semana' ? 'active' : ''}" data-preset="week">Semana</button>
            <button class="dash-preset-btn ${rangeLabel === 'Este mes' ? 'active' : ''}" data-preset="month">Mes</button>
            <button class="dash-preset-btn ${rangeLabel === 'Este trimestre' ? 'active' : ''}" data-preset="quarter">Trimestre</button>
            <button class="dash-preset-btn ${rangeLabel === 'Este año' ? 'active' : ''}" data-preset="year">Año</button>
          </div>
          <div class="dash-custom-range">
            <input type="date" id="stat-from" value="${dateFrom}" />
            <span>—</span>
            <input type="date" id="stat-to" value="${dateTo}" />
          </div>
        </div>
      </div>

      <!-- KPI Row -->
      <div class="stat-kpi-row">
        <div class="stat-kpi stat-kpi-big stat-card-link" data-panel="revenue">
          <div class="stat-kpi-label">Ingresos Totales</div>
          <div class="stat-kpi-value">${formatCurrency(totalRevenue)}</div>
          <div class="stat-kpi-hint">${payments.length} pagos registrados</div>
        </div>
        <div class="stat-kpi stat-card-link" data-panel="clases">
          <div class="stat-kpi-label">Servicios (Calendario)</div>
          <div class="stat-kpi-value">${totalClasses} clases</div>
          <div class="stat-kpi-hint">${totalStudents} alumnos &middot; ${equip.length} alquileres</div>
        </div>
        <div class="stat-kpi stat-card-link" data-panel="bonos">
          <div class="stat-kpi-label">Bonos / Packs</div>
          <div class="stat-kpi-value">${bonos.length}</div>
          <div class="stat-kpi-hint">${activeBonos} activos &middot; ${formatCurrency(bonoRevenue)}</div>
        </div>
        <div class="stat-kpi stat-card-link" data-panel="camps">
          <div class="stat-kpi-label">Surf Camps</div>
          <div class="stat-kpi-value">${bookings.length} reservas</div>
          <div class="stat-kpi-hint">${paidBookings} pagados &middot; ${formatCurrency(campRevenue)}</div>
        </div>
        <div class="stat-kpi stat-card-link" data-panel="tienda">
          <div class="stat-kpi-label">Tienda (Productos)</div>
          <div class="stat-kpi-value">${orders.length} pedidos</div>
          <div class="stat-kpi-hint">${paidOrders.length} pagados &middot; ${formatCurrency(orderRevenue)}</div>
        </div>
      </div>

      <!-- ============ SERVICIOS: Clases & Actividades ============ -->
      <div class="stat-section">
        <div class="stat-section-header">
          <h3 class="dash-section-title">Clases y Actividades</h3>
          <span class="stat-section-sub">Servicios gestionados en el calendario</span>
        </div>
        <div class="stat-activity-grid">
          ${Object.entries(TYPE_LABELS).map(([type, label]) => {
            const cd = classesByType[type];
            const ed = enrollByType[type] || { total: 0, withBono: 0 };
            const occ = cd.maxSlots > 0 ? Math.round(cd.students / cd.maxSlots * 100) : 0;
            const avg = cd.count > 0 ? Math.round(cd.students / cd.count * 10) / 10 : 0;
            const barW = maxTypeVal > 0 ? Math.round(cd.students / maxTypeVal * 100) : 0;
            const bd = bonosByType[type];
            return `
              <div class="stat-activity-card stat-card-link" data-panel="activity" data-type="${type}" style="border-left:4px solid ${TYPE_COLORS[type]}">
                <div class="stat-activity-name">${label}</div>
                <div class="stat-activity-big">${cd.count} <small>clases</small></div>
                <div class="stat-metrics-row">
                  <div class="stat-mini"><span>${cd.students}</span> alumnos</div>
                  <div class="stat-mini"><span>${avg}</span> media</div>
                  <div class="stat-mini"><span>${occ}%</span> ocupación</div>
                </div>
                <div class="stat-activity-bar">
                  <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${barW}%;background:${TYPE_COLORS[type]}"></div></div>
                </div>
                <div class="stat-activity-bottom">
                  <span>${ed.total} inscripciones (${ed.withBono} con bono)</span>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Alquiler Material (dentro del calendario) -->
      <div class="stat-section">
        <div class="stat-section-header">
          <h3 class="dash-section-title">Alquiler de Material</h3>
          <span class="stat-section-sub">Gestionado junto a las clases en el calendario</span>
        </div>
        <div class="stat-kpi-row" style="max-width:500px">
          <div class="stat-kpi stat-card-link" data-panel="alquiler">
            <div class="stat-kpi-label">Reservas</div>
            <div class="stat-kpi-value">${equip.length}</div>
            <div class="stat-kpi-hint">En el período</div>
          </div>
          <div class="stat-kpi stat-card-link" data-panel="alquiler">
            <div class="stat-kpi-label">Cobrado</div>
            <div class="stat-kpi-value">${formatCurrency(rentalRevenue)}</div>
            <div class="stat-kpi-hint">Depósitos cobrados</div>
          </div>
        </div>
      </div>

      <!-- ============ BONOS / PACKS ============ -->
      <div class="stat-section">
        <div class="stat-section-header">
          <h3 class="dash-section-title">Bonos / Packs</h3>
          <span class="stat-section-sub">Créditos prepago para clases y actividades</span>
        </div>
        <div class="stat-bonos-overview">
          <div class="stat-bonos-credits stat-card-link" data-panel="bonos">
            <div class="stat-bonos-credits-header">
              <div>
                <div class="stat-bonos-credits-title">Utilización de créditos</div>
                <div class="stat-bonos-credits-numbers">${usedCredits} usados de ${totalCredits}</div>
              </div>
              <div class="stat-bonos-credits-pct">${totalCredits > 0 ? Math.round(usedCredits / totalCredits * 100) : 0}%</div>
            </div>
            <div class="stat-progress-bar"><div class="stat-progress-fill" style="width:${totalCredits > 0 ? Math.round(usedCredits / totalCredits * 100) : 0}%"></div></div>
          </div>
          <div class="stat-bono-type-grid">
            ${Object.entries(TYPE_LABELS).map(([type, label]) => {
              const bd = bonosByType[type];
              const util = bd.credits > 0 ? Math.round(bd.used / bd.credits * 100) : 0;
              return `
                <div class="stat-bono-type-card stat-card-link" data-panel="bono-type" data-type="${type}" style="border-top:3px solid ${TYPE_COLORS[type]}">
                  <div class="stat-bono-type-name">${label}</div>
                  <div class="stat-bono-type-count">${bd.count}</div>
                  <div class="stat-bono-type-meta">${formatCurrency(bd.revenue)} &middot; ${util}% usado</div>
                  <div class="stat-progress-bar stat-progress-sm"><div class="stat-progress-fill" style="width:${util}%;background:${TYPE_COLORS[type]}"></div></div>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- ============ SURF CAMPS ============ -->
      <div class="stat-section">
        <div class="stat-section-header">
          <h3 class="dash-section-title">Surf Camps</h3>
          <span class="stat-section-sub">Experiencias y retiros multi-día</span>
        </div>
        <div class="stat-kpi-row" style="max-width:700px">
          <div class="stat-kpi stat-card-link" data-panel="camps">
            <div class="stat-kpi-label">Reservas</div>
            <div class="stat-kpi-value">${bookings.length}</div>
            <div class="stat-kpi-hint">${paidBookings} pagadas</div>
          </div>
          <div class="stat-kpi stat-card-link" data-panel="camps">
            <div class="stat-kpi-label">Ingresos Camps</div>
            <div class="stat-kpi-value">${formatCurrency(campRevenue)}</div>
            <div class="stat-kpi-hint">Reservas confirmadas</div>
          </div>
          <div class="stat-kpi stat-card-link" data-panel="camps">
            <div class="stat-kpi-label">Próximos</div>
            <div class="stat-kpi-value">${data.futureCamps?.length || 0}</div>
            <div class="stat-kpi-hint">Camps programados</div>
          </div>
        </div>
      </div>

      <!-- ============ TIENDA ONLINE ============ -->
      <div class="stat-section">
        <div class="stat-section-header">
          <h3 class="dash-section-title">Tienda Online</h3>
          <span class="stat-section-sub">Venta de productos (independiente de servicios)</span>
        </div>
        <div class="stat-kpi-row" style="max-width:700px">
          <div class="stat-kpi stat-card-link" data-panel="tienda">
            <div class="stat-kpi-label">Pedidos</div>
            <div class="stat-kpi-value">${orders.length}</div>
            <div class="stat-kpi-hint">${paidOrders.length} pagados</div>
          </div>
          <div class="stat-kpi stat-card-link" data-panel="tienda">
            <div class="stat-kpi-label">Ingresos Tienda</div>
            <div class="stat-kpi-value">${formatCurrency(orderRevenue)}</div>
            <div class="stat-kpi-hint">Pedidos confirmados</div>
          </div>
          <div class="stat-kpi stat-card-link" data-panel="tienda">
            <div class="stat-kpi-label">Ticket Medio</div>
            <div class="stat-kpi-value">${formatCurrency(ticketMedio)}</div>
            <div class="stat-kpi-hint">Por pedido pagado</div>
          </div>
        </div>
        ${Object.keys(ordersByStatus).length > 0 ? `
          <div class="stat-order-status-row">
            ${Object.entries(ordersByStatus).map(([st, list]) => {
              const colors = { pending: '#f59e0b', paid: '#22c55e', shipped: '#0ea5e9', delivered: '#6b7280', cancelled: '#ef4444' };
              return `<div class="stat-order-status-chip" style="border-color:${colors[st] || '#94a3b8'}">
                <strong>${list.length}</strong> ${ORDER_STATUS[st] || st}
              </div>`;
            }).join('')}
          </div>
        ` : ''}
      </div>

      <!-- ============ DESGLOSE DE INGRESOS ============ -->
      <div class="stat-section">
        <h3 class="dash-section-title">Desglose de Ingresos</h3>
        <div class="stat-revenue-grid">
          <div class="stat-revenue-card">
            <h4>Por línea de negocio</h4>
            ${Object.entries(byResType)
              .filter(([t]) => t !== 'otros')
              .sort((a, b) => b[1] - a[1])
              .map(([t, val]) => {
                const pct = totalRevenue > 0 ? Math.round(val / totalRevenue * 100) : 0;
                const col = RES_TYPE_COLORS[t] || '#94a3b8';
                const panelMap = { enrollment: 'clases', booking: 'camps', order: 'tienda', bono: 'bonos', equipment: 'alquiler' };
                return `<div class="stat-rev-row stat-card-link" data-panel="${panelMap[t] || 'revenue'}">
                  <div class="stat-rev-label"><span class="stat-rev-dot" style="background:${col}"></span>${RES_TYPE_LABELS[t] || t}</div>
                  <div class="stat-rev-bar"><div class="stat-rev-bar-fill" style="width:${pct}%;background:${col}"></div></div>
                  <div class="stat-rev-amount">${formatCurrency(val)} <small>(${pct}%)</small></div>
                </div>`;
              }).join('') || '<p class="dash-empty">Sin ingresos</p>'}
          </div>
          <div class="stat-revenue-card">
            <h4>Por método de pago</h4>
            ${Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([m, val]) => {
              const pct = totalRevenue > 0 ? Math.round(val / totalRevenue * 100) : 0;
              const col = METHOD_COLORS[m] || '#94a3b8';
              return `<div class="stat-rev-row stat-card-link" data-panel="payments" data-method="${m}">
                <div class="stat-rev-label"><span class="stat-rev-dot" style="background:${col}"></span>${METHOD_LABELS[m] || m}</div>
                <div class="stat-rev-bar"><div class="stat-rev-bar-fill" style="width:${pct}%;background:${col}"></div></div>
                <div class="stat-rev-amount">${formatCurrency(val)} <small>(${pct}%)</small></div>
              </div>`;
            }).join('') || '<p class="dash-empty">Sin pagos</p>'}
          </div>
        </div>
      </div>

      <!-- Top Clients -->
      ${topClients.length > 0 ? `
        <div class="stat-section">
          <h3 class="dash-section-title">Mejores Clientes</h3>
          <div class="stat-top-clients">
            ${topClients.map(([name, d], i) => {
              const typeLabels = [];
              if (d.types.has('enrollment') || d.types.has('bono')) typeLabels.push('Clases');
              if (d.types.has('booking')) typeLabels.push('Camps');
              if (d.types.has('order')) typeLabels.push('Tienda');
              if (d.types.has('equipment')) typeLabels.push('Alquiler');
              return `
                <div class="stat-top-client">
                  <span class="stat-top-rank">${i + 1}</span>
                  <span class="stat-top-name">${name}</span>
                  <span class="stat-top-types">${typeLabels.join(', ')}</span>
                  <span class="stat-top-amount">${formatCurrency(d.total)}</span>
                  <span class="stat-top-count">${d.count} pagos</span>
                </div>`;
            }).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // ==================== EVENT BINDING ====================
    container.querySelectorAll('.dash-preset-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const d = getPresetDates(btn.dataset.preset);
        dateFrom = d.from; dateTo = d.to;
        saveSettings({ ...loadSettings(), stat_from: dateFrom, stat_to: dateTo });
        await render();
      });
    });
    container.querySelector('#stat-from')?.addEventListener('change', async (e) => {
      dateFrom = e.target.value; saveSettings({ ...loadSettings(), stat_from: dateFrom }); await render();
    });
    container.querySelector('#stat-to')?.addEventListener('change', async (e) => {
      dateTo = e.target.value; saveSettings({ ...loadSettings(), stat_to: dateTo }); await render();
    });

    container.querySelectorAll('.stat-card-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openPanel(el.dataset.panel, el.dataset.type, el.dataset.method);
      });
    });

    // ==================== PANEL BUILDERS ====================
    function openPanel(panelType, typeFilter, methodFilter) {
      switch (panelType) {
        case 'revenue': return openRevenuePanel();
        case 'clases': return openClasesPanel();
        case 'activity': return openActivityPanel(typeFilter);
        case 'camps': return openCampsPanel();
        case 'tienda': return openTiendaPanel();
        case 'bonos': return openBonosPanel();
        case 'bono-type': return openBonoTypePanel(typeFilter);
        case 'alquiler': return openAlquilerPanel();
        case 'payments': return openPaymentsPanel(methodFilter);
      }
    }

    function openRevenuePanel() {
      const rows = payments
        .sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))
        .map(p => {
          const name = (p.user_id && data.profileMap?.[p.user_id]?.full_name) || '—';
          return `<tr>
            <td>${formatDate(p.payment_date)}</td>
            <td>${name}</td>
            <td>${RES_TYPE_LABELS[p.reservation_type] || p.reservation_type || '—'}</td>
            <td>${METHOD_LABELS[p.payment_method] || p.payment_method || '—'}</td>
            <td class="stat-td-right"><strong>${formatCurrency(p.amount)}</strong></td>
          </tr>`;
        });

      const body = `
        <div class="stat-panel-section">
          <div class="stat-panel-kpis">
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(totalRevenue)}</div><div class="stat-panel-kpi-label">Total ingresos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${payments.length}</div><div class="stat-panel-kpi-label">Pagos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(payments.length > 0 ? Math.round(totalRevenue / payments.length * 100) / 100 : 0)}</div><div class="stat-panel-kpi-label">Pago medio</div></div>
          </div>
        </div>
        <div class="stat-panel-section">
          <h4>Por línea de negocio</h4>
          <div class="stat-panel-type-bars">
            ${Object.entries(byResType).filter(([t]) => t !== 'otros').sort((a, b) => b[1] - a[1]).map(([t, val]) =>
              `<div class="stat-panel-type-row">
                <div class="stat-panel-type-label" style="color:${RES_TYPE_COLORS[t] || '#374151'}">${RES_TYPE_LABELS[t] || t}</div>
                <div class="stat-panel-type-stats">${formatCurrency(val)} (${totalRevenue > 0 ? Math.round(val / totalRevenue * 100) : 0}%)</div>
              </div>`
            ).join('')}
          </div>
        </div>
        <div class="stat-panel-section">
          <h4>Todos los pagos (${payments.length})</h4>
          ${buildTable(['Fecha', 'Cliente', 'Concepto', 'Método', 'Importe'], rows)}
        </div>
      `;
      showStatPanel(container, 'Desglose de Ingresos', body, '#0f2f39');
    }

    function openClasesPanel() {
      const enrollments = data.enrollmentsWithType || [];
      const rows = enrollments
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .map(e => `<tr>
          <td>${e._name || 'Sin nombre'}</td>
          <td>${typeBadge(e.class_type)}</td>
          <td>${e.bono_id ? statusPill('Bono', '#8b5cf6') : statusPill('Directa', '#0ea5e9')}</td>
          <td>${formatDate(e.created_at)}</td>
          <td>${e.status || '—'}</td>
        </tr>`);

      const body = `
        <div class="stat-panel-section">
          <div class="stat-panel-kpis">
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${totalClasses}</div><div class="stat-panel-kpi-label">Clases impartidas</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${totalStudents}</div><div class="stat-panel-kpi-label">Alumnos totales</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${avgOccupancy}%</div><div class="stat-panel-kpi-label">Ocupación media</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(enrollmentRevenue)}</div><div class="stat-panel-kpi-label">Ingresos directos</div></div>
          </div>
        </div>
        <div class="stat-panel-section">
          <h4>Por tipo de actividad</h4>
          <div class="stat-panel-type-bars">
            ${Object.entries(TYPE_LABELS).map(([t, label]) => {
              const cd = classesByType[t];
              const ed = enrollByType[t] || { total: 0, withBono: 0 };
              const occ = cd.maxSlots > 0 ? Math.round(cd.students / cd.maxSlots * 100) : 0;
              return `<div class="stat-panel-type-row">
                <div class="stat-panel-type-label" style="color:${TYPE_COLORS[t]}">${label}</div>
                <div class="stat-panel-type-stats">${cd.count} clases &middot; ${cd.students} alumnos &middot; ${occ}% ocup. &middot; ${ed.total} inscrip. (${ed.withBono} con bono)</div>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="stat-panel-section">
          <h4>Alquiler de material (${equip.length} reservas &middot; ${formatCurrency(rentalRevenue)})</h4>
          <p style="font-size:.82rem;color:#6b7280;margin:0 0 8px">El alquiler se gestiona en el mismo calendario que las clases</p>
          ${buildTable(['Cliente', 'Cobrado', 'Estado', 'Desde', 'Hasta'],
            equip.sort((a, b) => (b.date_start || '').localeCompare(a.date_start || '')).slice(0, 20).map(e =>
              `<tr><td>${e._name || '—'}</td><td>${formatCurrency(e.deposit_paid)}</td><td>${EQUIP_STATUS[e.status] || e.status}</td><td>${formatDate(e.date_start)}</td><td>${formatDate(e.date_end)}</td></tr>`
            )
          )}
        </div>
        <div class="stat-panel-section">
          <h4>Inscripciones a clases (${enrollments.length})</h4>
          ${buildTable(['Alumno', 'Actividad', 'Tipo', 'Fecha', 'Estado'], rows)}
        </div>
      `;
      showStatPanel(container, 'Servicios — Clases y Alquiler', body, '#22c55e');
    }

    function openActivityPanel(type) {
      const label = TYPE_LABELS[type] || type;
      const color = TYPE_COLORS[type] || '#64748b';
      const cd = classesByType[type];
      const ed = enrollByType[type] || { total: 0, withBono: 0, list: [] };
      const bd = bonosByType[type];
      const occ = cd.maxSlots > 0 ? Math.round(cd.students / cd.maxSlots * 100) : 0;
      const avg = cd.count > 0 ? Math.round(cd.students / cd.count * 10) / 10 : 0;

      const classRows = cd.classes
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .map(c => `<tr>
          <td>${formatDate(c.date)}</td>
          <td>${(c.time_start || '').slice(0, 5)} – ${(c.time_end || '').slice(0, 5)}</td>
          <td>${occBar(c.enrolled_count || 0, c.max_students || 0)}</td>
          <td>${c.status || '—'}</td>
        </tr>`);

      const enrollRows = ed.list
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .map(e => `<tr>
          <td>${e._name || 'Sin nombre'}</td>
          <td>${e.bono_id ? statusPill('Bono', '#8b5cf6') : statusPill('Directa', '#0ea5e9')}</td>
          <td>${formatDate(e.created_at)}</td>
          <td>${e.status || '—'}</td>
        </tr>`);

      const bonoRows = bd.list
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .map(b => `<tr>
          <td>${b._name || 'Sin nombre'}</td>
          <td>${b.used_credits || 0} / ${b.total_credits || 0}</td>
          <td>${formatCurrency(b.total_paid)}</td>
          <td>${statusPill(BONO_STATUS[b.status] || b.status, BONO_COLORS[b.status] || '#6b7280')}</td>
          <td>${formatDate(b.created_at)}</td>
        </tr>`);

      const body = `
        <div class="stat-panel-section">
          <div class="stat-panel-kpis">
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${cd.count}</div><div class="stat-panel-kpi-label">Clases</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${cd.students}</div><div class="stat-panel-kpi-label">Alumnos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${avg}</div><div class="stat-panel-kpi-label">Media/clase</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${occ}%</div><div class="stat-panel-kpi-label">Ocupación</div></div>
          </div>
        </div>
        <div class="stat-panel-section">
          <div class="stat-panel-kpis">
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${ed.total}</div><div class="stat-panel-kpi-label">Inscripciones</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${ed.withBono}</div><div class="stat-panel-kpi-label">Con bono</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${bd.count}</div><div class="stat-panel-kpi-label">Bonos vendidos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(bd.revenue)}</div><div class="stat-panel-kpi-label">Ingresos bonos</div></div>
          </div>
        </div>
        <div class="stat-panel-section">
          <h4>Clases (${cd.classes.length})</h4>
          ${buildTable(['Fecha', 'Horario', 'Ocupación', 'Estado'], classRows)}
        </div>
        <div class="stat-panel-section">
          <h4>Alumnos inscritos (${ed.list.length})</h4>
          ${buildTable(['Alumno', 'Pago', 'Fecha', 'Estado'], enrollRows)}
        </div>
        ${bd.list.length > 0 ? `
          <div class="stat-panel-section">
            <h4>Bonos de ${label} (${bd.list.length})</h4>
            ${buildTable(['Cliente', 'Créditos', 'Pagado', 'Estado', 'Fecha'], bonoRows)}
          </div>
        ` : ''}
      `;
      showStatPanel(container, label, body, color);
    }

    function openCampsPanel() {
      const rows = bookings
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .map(b => {
          const stLabel = BOOKING_STATUS[b.status] || b.status;
          const stColor = ['deposit_paid', 'fully_paid'].includes(b.status) ? '#22c55e' : b.status === 'cancelled' ? '#ef4444' : '#f59e0b';
          return `<tr>
            <td>${b._name || 'Sin nombre'}</td>
            <td class="stat-td-right">${formatCurrency(b.total_amount)}</td>
            <td>${statusPill(stLabel, stColor)}</td>
            <td>${formatDate(b.created_at)}</td>
          </tr>`;
        });

      const body = `
        <div class="stat-panel-section">
          <p style="font-size:.84rem;color:#6b7280;margin:0 0 12px">Experiencias y retiros multi-día. Independiente de las clases diarias.</p>
          <div class="stat-panel-kpis">
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${bookings.length}</div><div class="stat-panel-kpi-label">Total reservas</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${paidBookings}</div><div class="stat-panel-kpi-label">Pagadas</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(campRevenue)}</div><div class="stat-panel-kpi-label">Ingresos camps</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${data.futureCamps?.length || 0}</div><div class="stat-panel-kpi-label">Camps futuros</div></div>
          </div>
        </div>
        <div class="stat-panel-section">
          <h4>Reservas de camps (${bookings.length})</h4>
          ${buildTable(['Cliente', 'Importe', 'Estado', 'Fecha reserva'], rows)}
        </div>
      `;
      showStatPanel(container, 'Surf Camps', body, '#0ea5e9');
    }

    function openTiendaPanel() {
      const rows = orders
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .map(o => {
          const stLabel = ORDER_STATUS[o.status] || o.status;
          const stColor = ['paid', 'shipped', 'delivered'].includes(o.status) ? '#22c55e' : o.status === 'cancelled' ? '#ef4444' : '#f59e0b';
          return `<tr>
            <td>${o._name || 'Sin nombre'}</td>
            <td class="stat-td-right">${formatCurrency(o.total)}</td>
            <td>${statusPill(stLabel, stColor)}</td>
            <td>${formatDate(o.created_at)}</td>
          </tr>`;
        });

      const statusSummary = Object.entries(ordersByStatus).map(([st, list]) => {
        const total = list.reduce((s, o) => s + Number(o.total || 0), 0);
        return `<div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${list.length}</div><div class="stat-panel-kpi-label">${ORDER_STATUS[st] || st} (${formatCurrency(total)})</div></div>`;
      }).join('');

      const body = `
        <div class="stat-panel-section">
          <p style="font-size:.84rem;color:#6b7280;margin:0 0 12px">Venta de productos online. No tiene relación con las clases ni actividades.</p>
          <div class="stat-panel-kpis">
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${orders.length}</div><div class="stat-panel-kpi-label">Total pedidos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(orderRevenue)}</div><div class="stat-panel-kpi-label">Ingresos productos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(ticketMedio)}</div><div class="stat-panel-kpi-label">Ticket medio</div></div>
          </div>
        </div>
        ${statusSummary ? `
          <div class="stat-panel-section">
            <h4>Por estado</h4>
            <div class="stat-panel-kpis">${statusSummary}</div>
          </div>
        ` : ''}
        <div class="stat-panel-section">
          <h4>Todos los pedidos (${orders.length})</h4>
          ${buildTable(['Cliente', 'Total', 'Estado', 'Fecha'], rows)}
        </div>
      `;
      showStatPanel(container, 'Tienda Online — Productos', body, '#f59e0b');
    }

    function openBonosPanel() {
      const rows = bonos
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .map(b => `<tr>
          <td>${b._name || 'Sin nombre'}</td>
          <td>${typeBadge(b.class_type)}</td>
          <td>${b.used_credits || 0} / ${b.total_credits || 0}</td>
          <td class="stat-td-right">${formatCurrency(b.total_paid)}</td>
          <td>${statusPill(BONO_STATUS[b.status] || b.status, BONO_COLORS[b.status] || '#6b7280')}</td>
          <td>${formatDate(b.created_at)}</td>
        </tr>`);

      const utilizacion = totalCredits > 0 ? Math.round(usedCredits / totalCredits * 100) : 0;

      const typeSummary = Object.entries(TYPE_LABELS).map(([t, label]) => {
        const bd = bonosByType[t];
        const util = bd.credits > 0 ? Math.round(bd.used / bd.credits * 100) : 0;
        return `<div class="stat-panel-type-row">
          <div class="stat-panel-type-label" style="color:${TYPE_COLORS[t]}">${label}</div>
          <div class="stat-panel-type-stats">${bd.count} bonos &middot; ${bd.used}/${bd.credits} créditos &middot; ${util}% usado &middot; ${formatCurrency(bd.revenue)}</div>
        </div>`;
      }).join('');

      const body = `
        <div class="stat-panel-section">
          <p style="font-size:.84rem;color:#6b7280;margin:0 0 12px">Packs de créditos prepago para clases y actividades.</p>
          <div class="stat-panel-kpis">
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${bonos.length}</div><div class="stat-panel-kpi-label">Total bonos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${activeBonos}</div><div class="stat-panel-kpi-label">Activos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(bonoRevenue)}</div><div class="stat-panel-kpi-label">Ingresos bonos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${utilizacion}%</div><div class="stat-panel-kpi-label">Utilización</div></div>
          </div>
          <div style="max-width:400px;margin-top:12px">
            <div style="font-size:.82rem;color:#374151;margin-bottom:4px">${usedCredits} de ${totalCredits} créditos usados</div>
            <div class="stat-progress-bar"><div class="stat-progress-fill" style="width:${utilizacion}%"></div></div>
          </div>
        </div>
        <div class="stat-panel-section">
          <h4>Por actividad</h4>
          <div class="stat-panel-type-bars">${typeSummary}</div>
        </div>
        <div class="stat-panel-section">
          <h4>Todos los bonos (${bonos.length})</h4>
          ${buildTable(['Cliente', 'Actividad', 'Créditos', 'Pagado', 'Estado', 'Fecha'], rows)}
        </div>
      `;
      showStatPanel(container, 'Bonos / Packs de Clases', body, '#8b5cf6');
    }

    function openBonoTypePanel(type) {
      const label = TYPE_LABELS[type] || type;
      const color = TYPE_COLORS[type] || '#64748b';
      const bd = bonosByType[type];
      const util = bd.credits > 0 ? Math.round(bd.used / bd.credits * 100) : 0;

      const rows = bd.list
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .map(b => `<tr>
          <td>${b._name || 'Sin nombre'}</td>
          <td>${b.total_credits || 0} créditos</td>
          <td>${b.used_credits || 0} usados</td>
          <td class="stat-td-right">${formatCurrency(b.total_paid)}</td>
          <td>${statusPill(BONO_STATUS[b.status] || b.status, BONO_COLORS[b.status] || '#6b7280')}</td>
          <td>${formatDate(b.created_at)}</td>
        </tr>`);

      const body = `
        <div class="stat-panel-section">
          <div class="stat-panel-kpis">
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${bd.count}</div><div class="stat-panel-kpi-label">Bonos vendidos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(bd.revenue)}</div><div class="stat-panel-kpi-label">Ingresos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${bd.used} / ${bd.credits}</div><div class="stat-panel-kpi-label">Créditos usados</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${util}%</div><div class="stat-panel-kpi-label">Utilización</div></div>
          </div>
          <div style="max-width:400px;margin-top:12px">
            <div class="stat-progress-bar"><div class="stat-progress-fill" style="width:${util}%;background:${color}"></div></div>
          </div>
        </div>
        <div class="stat-panel-section">
          <h4>Compradores (${bd.list.length})</h4>
          ${buildTable(['Cliente', 'Pack', 'Usados', 'Pagado', 'Estado', 'Fecha'], rows)}
        </div>
      `;
      showStatPanel(container, `Bonos — ${label}`, body, color);
    }

    function openAlquilerPanel() {
      const rows = equip
        .sort((a, b) => (b.date_start || '').localeCompare(a.date_start || ''))
        .map(e => {
          const stLabel = EQUIP_STATUS[e.status] || e.status;
          const stColor = ['active', 'confirmed'].includes(e.status) ? '#22c55e' : e.status === 'returned' ? '#6b7280' : '#f59e0b';
          return `<tr>
            <td>${e._name || 'Sin nombre'}</td>
            <td class="stat-td-right">${formatCurrency(e.total_amount)}</td>
            <td class="stat-td-right">${formatCurrency(e.deposit_paid)}</td>
            <td>${statusPill(stLabel, stColor)}</td>
            <td>${formatDate(e.date_start)}</td>
            <td>${formatDate(e.date_end)}</td>
          </tr>`;
        });

      const body = `
        <div class="stat-panel-section">
          <p style="font-size:.84rem;color:#6b7280;margin:0 0 12px">Alquiler de tablas, neoprenos y material. Se gestiona en el calendario junto a las clases.</p>
          <div class="stat-panel-kpis">
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${equip.length}</div><div class="stat-panel-kpi-label">Total reservas</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(rentalRevenue)}</div><div class="stat-panel-kpi-label">Cobrado</div></div>
          </div>
        </div>
        <div class="stat-panel-section">
          <h4>Todas las reservas de material (${equip.length})</h4>
          ${buildTable(['Cliente', 'Importe', 'Cobrado', 'Estado', 'Desde', 'Hasta'], rows)}
        </div>
      `;
      showStatPanel(container, 'Alquiler de Material', body, '#7c3aed');
    }

    function openPaymentsPanel(method) {
      const label = METHOD_LABELS[method] || method;
      const color = METHOD_COLORS[method] || '#94a3b8';
      const filtered = payments.filter(p => (p.payment_method || 'otros') === method);
      const total = filtered.reduce((s, p) => s + Number(p.amount || 0), 0);

      const rows = filtered
        .sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))
        .map(p => {
          const name = (p.user_id && data.profileMap?.[p.user_id]?.full_name) || '—';
          return `<tr>
            <td>${formatDate(p.payment_date)}</td>
            <td>${name}</td>
            <td>${RES_TYPE_LABELS[p.reservation_type] || p.reservation_type || '—'}</td>
            <td class="stat-td-right"><strong>${formatCurrency(p.amount)}</strong></td>
          </tr>`;
        });

      const body = `
        <div class="stat-panel-section">
          <div class="stat-panel-kpis">
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${filtered.length}</div><div class="stat-panel-kpi-label">Pagos</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(total)}</div><div class="stat-panel-kpi-label">Total</div></div>
            <div class="stat-panel-kpi"><div class="stat-panel-kpi-val">${formatCurrency(filtered.length > 0 ? Math.round(total / filtered.length * 100) / 100 : 0)}</div><div class="stat-panel-kpi-label">Pago medio</div></div>
          </div>
        </div>
        <div class="stat-panel-section">
          <h4>Pagos con ${label} (${filtered.length})</h4>
          ${buildTable(['Fecha', 'Cliente', 'Concepto', 'Importe'], rows)}
        </div>
      `;
      showStatPanel(container, `Pagos — ${label}`, body, color);
    }
  }

  await render();
}

// ---- Helpers ----
function getPresetDates(preset) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  switch (preset) {
    case 'today': return { from: fmt(now), to: fmt(now) };
    case 'week': {
      const day = now.getDay();
      const mon = new Date(now); mon.setDate(d - (day === 0 ? 6 : day - 1));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { from: fmt(mon), to: fmt(sun) };
    }
    case 'month': return { from: `${y}-${pad(m + 1)}-01`, to: fmt(new Date(y, m + 1, 0)) };
    case 'quarter': {
      const qs = new Date(y, Math.floor(m / 3) * 3, 1);
      return { from: fmt(qs), to: fmt(new Date(y, Math.floor(m / 3) * 3 + 3, 0)) };
    }
    case 'year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    default: return { from: fmt(now), to: fmt(now) };
  }
}

function getDateRangeLabel(from, to) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const todayStr = fmt(now);
  if (from === todayStr && to === todayStr) return 'Hoy';
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const day = now.getDay();
  const mon = new Date(now); mon.setDate(d - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  if (from === fmt(mon) && to === fmt(sun)) return 'Esta semana';
  if (from === `${y}-${pad(m + 1)}-01` && to === fmt(new Date(y, m + 1, 0))) return 'Este mes';
  const qs = new Date(y, Math.floor(m / 3) * 3, 1);
  if (from === fmt(qs) && to === fmt(new Date(y, Math.floor(m / 3) * 3 + 3, 0))) return 'Este trimestre';
  if (from === `${y}-01-01` && to === `${y}-12-31`) return 'Este año';
  return 'Personalizado';
}
