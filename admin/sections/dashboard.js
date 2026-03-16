/* ============================================================
   Dashboard Section — Full statistics with date range filtering
   ============================================================ */
import { fetchDashboardStats, fetchClassesInRange } from '../modules/api.js';
import { formatCurrency, showToast } from '../modules/ui.js';
import { TYPE_LABELS, TYPE_COLORS, PACK_PRICING } from '../modules/constants.js';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Settings (persisted in localStorage)
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem('eos_admin_settings') || '{}');
  } catch { return {}; }
}
function saveSettings(s) {
  localStorage.setItem('eos_admin_settings', JSON.stringify(s));
}
function getSetting(key, fallback) {
  return loadSettings()[key] ?? fallback;
}

export async function renderDashboard(container) {
  // Date range state (use local timezone, not UTC)
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let dateFrom = getSetting('dash_from', fmtDate(monthStart));
  let dateTo = getSetting('dash_to', fmtDate(today));
  let ivaPct = getSetting('iva_pct', 21);
  let comisionPct = getSetting('comision_pct', 0);

  async function render() {
    container.innerHTML = '<p style="color:var(--color-muted);padding:24px">Cargando estadísticas…</p>';

    let data, todayClasses;
    try {
      const todayStr = fmtDate(today);
      [data, todayClasses] = await Promise.all([
        fetchDashboardStats(dateFrom, dateTo),
        fetchClassesInRange(todayStr, todayStr),
      ]);
    } catch (err) {
      container.innerHTML = `<p style="color:#ef4444;padding:24px">Error al cargar estadísticas: ${err.message}</p>`;
      console.error('Dashboard render error:', err);
      return;
    }

    try {
    // ---- Calculations ----
    const payments = data.payments;
    const totalPayments = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

    // Revenue by payment method
    const byMethod = {};
    payments.forEach(p => {
      const m = p.payment_method || 'otros';
      byMethod[m] = (byMethod[m] || 0) + Number(p.amount || 0);
    });

    // Revenue by reservation type
    const byType = {};
    payments.forEach(p => {
      const t = p.reservation_type || 'otros';
      byType[t] = (byType[t] || 0) + Number(p.amount || 0);
    });

    // Bookings (camps) revenue
    const campRevenue = (data.bookings)
      .filter(b => ['deposit_paid', 'fully_paid'].includes(b.status))
      .reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const totalBookings = data.bookings.length;
    const paidBookings = data.bookings.filter(b => ['deposit_paid', 'fully_paid'].includes(b.status)).length;

    // Orders (shop) revenue
    const orderRevenue = (data.orders)
      .filter(o => ['paid', 'shipped', 'delivered'].includes(o.status))
      .reduce((s, o) => s + Number(o.total || 0), 0);
    const totalOrders = data.orders.length;
    const paidOrders = data.orders.filter(o => ['paid', 'shipped', 'delivered'].includes(o.status)).length;

    // Classes stats
    const totalClasses = data.classes.length;
    const totalStudents = data.classes.reduce((s, c) => s + (c.enrolled_count || 0), 0);
    const avgOccupancy = totalClasses > 0
      ? Math.round(data.classes.reduce((s, c) => s + ((c.enrolled_count || 0) / (c.max_students || 1)), 0) / totalClasses * 100)
      : 0;

    // Classes by type
    const classesByType = {};
    data.classes.forEach(c => {
      const t = c.type || 'otros';
      if (!classesByType[t]) classesByType[t] = { count: 0, students: 0 };
      classesByType[t].count++;
      classesByType[t].students += c.enrolled_count || 0;
    });

    // Enrollments
    const totalEnrollments = data.enrollments.length;
    const enrollWithBono = data.enrollments.filter(e => e.bono_id).length;
    const enrollWithout = totalEnrollments - enrollWithBono;

    // Bonos
    const totalBonos = data.bonos.length;
    const bonoRevenue = data.bonos.reduce((s, b) => s + Number(b.total_paid || 0), 0);
    const totalCredits = data.bonos.reduce((s, b) => s + (b.total_credits || 0), 0);
    const usedCredits = data.bonos.reduce((s, b) => s + (b.used_credits || 0), 0);

    // Equipment
    const totalRentals = data.equipment.length;
    const rentalRevenue = data.equipment.reduce((s, r) => s + Number(r.deposit_paid || 0), 0);

    // Aggregated revenue: payments table is source of truth; fallback only if no payments exist at all
    const totalRevenue = data.payments.length > 0 ? totalPayments : (campRevenue + orderRevenue + bonoRevenue + rentalRevenue);

    // IVA / Commission calculations
    const baseImponible = Math.round(totalRevenue / (1 + ivaPct / 100) * 100) / 100;
    const ivaAmount = Math.round((totalRevenue - baseImponible) * 100) / 100;
    const comisionAmount = Math.round(totalRevenue * comisionPct / 100 * 100) / 100;
    const netoReal = Math.round((totalRevenue - comisionAmount) * 100) / 100;

    // Ticket medio
    const ticketCount = paidBookings + paidOrders + totalBonos + totalRentals;
    const ticketMedio = ticketCount > 0 ? Math.round(totalRevenue / ticketCount * 100) / 100 : 0;

    // Method labels
    const METHOD_LABELS = {
      efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia',
      voucher: 'Voucher', saldo: 'Saldo', online: 'Online', otros: 'Otros'
    };
    const TYPE_REV_LABELS = {
      enrollment: 'Clases', booking: 'Camps', order: 'Tienda',
      bono: 'Bonos', equipment: 'Alquiler', otros: 'Otros'
    };

    // Date range presets
    const rangeLabel = getDateRangeLabel(dateFrom, dateTo);

    // ---- Render HTML ----
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
            <input type="date" id="dash-from" value="${dateFrom}" />
            <span>—</span>
            <input type="date" id="dash-to" value="${dateTo}" />
          </div>
        </div>
        <button class="dash-settings-btn" id="dash-settings-toggle" title="Configuración">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </button>
      </div>

      <div class="dash-settings-panel" id="dash-settings-panel" style="display:none">
        <div class="dash-settings-row">
          <label>IVA (%)</label>
          <input type="number" id="dash-iva" value="${ivaPct}" min="0" max="100" step="0.5" />
        </div>
        <div class="dash-settings-row">
          <label>Comisión pasarela (%)</label>
          <input type="number" id="dash-comision" value="${comisionPct}" min="0" max="100" step="0.1" />
        </div>
        <button class="dash-settings-save" id="dash-settings-save">Guardar</button>
      </div>

      <!-- Main KPI cards -->
      <div class="dash-kpi-grid">
        <div class="dash-kpi-card dash-kpi-primary">
          <div class="dash-kpi-label">Ingresos Totales</div>
          <div class="dash-kpi-value">${formatCurrency(totalRevenue)}</div>
          <div class="dash-kpi-sub">Base imponible: ${formatCurrency(baseImponible)} · IVA (${ivaPct}%): ${formatCurrency(ivaAmount)}</div>
          ${comisionPct > 0 ? `<div class="dash-kpi-sub">Comisión (${comisionPct}%): ${formatCurrency(comisionAmount)} · Neto: ${formatCurrency(netoReal)}</div>` : ''}
        </div>
        <div class="dash-kpi-card">
          <div class="dash-kpi-label">Ticket Medio</div>
          <div class="dash-kpi-value">${formatCurrency(ticketMedio)}</div>
          <div class="dash-kpi-sub">${ticketCount} transacciones</div>
        </div>
        <div class="dash-kpi-card">
          <div class="dash-kpi-label">Inscripciones a Clases</div>
          <div class="dash-kpi-value">${totalEnrollments}</div>
          <div class="dash-kpi-sub">${enrollWithBono} con bono · ${enrollWithout} directas</div>
        </div>
        <div class="dash-kpi-card">
          <div class="dash-kpi-label">Clases</div>
          <div class="dash-kpi-value">${totalClasses}</div>
          <div class="dash-kpi-sub">${totalStudents} alumnos · ${avgOccupancy}% ocupación</div>
        </div>
      </div>

      <!-- Clases Activas Hoy -->
      <div class="dash-section">
        <h3 class="dash-section-title">Clases Activas Hoy</h3>
        ${todayClasses.length > 0 ? `
          <div class="dash-today-grid">
            ${todayClasses.map(c => {
              const ratio = (c.enrolled_count || 0) / (c.max_students || 1);
              const barColor = ratio >= 1 ? '#ef4444' : ratio >= 0.8 ? '#f59e0b' : '#22c55e';
              const pct = Math.min(Math.round(ratio * 100), 100);
              return `
                <div class="dash-today-card" data-goto="calendario" style="border-left:4px solid ${TYPE_COLORS[c.type] || '#64748b'}">
                  <div class="dash-today-type">${TYPE_LABELS[c.type] || c.type}</div>
                  <div class="dash-today-time">${(c.time_start || '').slice(0, 5)} – ${(c.time_end || '').slice(0, 5)}</div>
                  <div class="dash-today-bar">
                    <div class="dash-today-bar-track">
                      <div class="dash-today-bar-fill" style="width:${pct}%;background:${barColor}"></div>
                    </div>
                    <span class="dash-today-occupancy">${c.enrolled_count || 0}/${c.max_students || 0} plazas</span>
                  </div>
                </div>`;
            }).join('')}
          </div>
        ` : '<p class="dash-empty">No hay clases programadas para hoy</p>'}
      </div>

      <!-- Revenue breakdown -->
      <div class="dash-section">
        <h3 class="dash-section-title">Desglose de Ingresos</h3>
        <div class="dash-breakdown-grid">
          <div class="dash-breakdown-card">
            <h4>Por línea de negocio</h4>
            <div class="dash-bar-list">
              ${renderBarList([
                { label: 'Clases / Actividades', value: byType['enrollment'] || 0, color: '#22c55e' },
                { label: 'Bonos / Packs', value: byType['bono'] || 0, color: '#16a34a' },
                { label: 'Surf Camps', value: byType['booking'] || 0, color: '#0ea5e9' },
                { label: 'Tienda (productos)', value: byType['order'] || 0, color: '#f59e0b' },
                { label: 'Alquiler material', value: byType['equipment'] || 0, color: '#8b5cf6' },
              ], totalRevenue)}
            </div>
          </div>
          <div class="dash-breakdown-card">
            <h4>Por método de pago</h4>
            <div class="dash-bar-list">
              ${Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([m, val]) =>
                renderBarItem(METHOD_LABELS[m] || m, val, totalPayments, getMethodColor(m))
              ).join('') || '<p class="dash-empty">Sin pagos registrados</p>'}
            </div>
          </div>
        </div>
      </div>

      <!-- Classes by type -->
      <div class="dash-section">
        <h3 class="dash-section-title">Actividades por Tipo</h3>
        <div class="dash-type-grid">
          ${Object.entries(classesByType).map(([type, d]) => `
            <div class="dash-type-card" style="border-left: 4px solid ${TYPE_COLORS[type] || '#64748b'}">
              <div class="dash-type-label">${TYPE_LABELS[type] || type}</div>
              <div class="dash-type-stats">
                <span><strong>${d.count}</strong> clases</span>
                <span><strong>${d.students}</strong> alumnos</span>
                <span><strong>${d.count > 0 ? Math.round(d.students / d.count * 10) / 10 : 0}</strong> media/clase</span>
              </div>
            </div>
          `).join('') || '<p class="dash-empty">Sin clases en este período</p>'}
        </div>
      </div>

      <!-- Bonos + Camps + Equipment summary -->
      <div class="dash-section">
        <h3 class="dash-section-title">Resumen Detallado</h3>
        <div class="dash-detail-grid">
          <div class="dash-detail-card">
            <div class="dash-detail-icon" style="background:#dcfce7;color:#166534">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            </div>
            <div class="dash-detail-info">
              <div class="dash-detail-title">Bonos Vendidos</div>
              <div class="dash-detail-value">${totalBonos}</div>
              <div class="dash-detail-sub">${formatCurrency(bonoRevenue)} cobrado · ${totalCredits} créditos (${usedCredits} usados)</div>
            </div>
          </div>
          <div class="dash-detail-card">
            <div class="dash-detail-icon" style="background:#e0f2fe;color:#0369a1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
            </div>
            <div class="dash-detail-info">
              <div class="dash-detail-title">Surf Camps</div>
              <div class="dash-detail-value">${totalBookings} reservas</div>
              <div class="dash-detail-sub">${formatCurrency(campRevenue)} · ${paidBookings} pagadas · ${data.futureCamps.length} camps próximos</div>
            </div>
          </div>
          <div class="dash-detail-card">
            <div class="dash-detail-icon" style="background:#fef3c7;color:#92400e">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
            </div>
            <div class="dash-detail-info">
              <div class="dash-detail-title">Tienda Online</div>
              <div class="dash-detail-value">${totalOrders} pedidos</div>
              <div class="dash-detail-sub">${formatCurrency(orderRevenue)} · ${paidOrders} pagados</div>
            </div>
          </div>
          <div class="dash-detail-card">
            <div class="dash-detail-icon" style="background:#f3e8ff;color:#7c3aed">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <div class="dash-detail-info">
              <div class="dash-detail-title">Alquiler Material</div>
              <div class="dash-detail-value">${totalRentals} reservas</div>
              <div class="dash-detail-sub">${formatCurrency(rentalRevenue)} cobrado</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick indicators -->
      <div class="dash-section">
        <h3 class="dash-section-title">Indicadores Rápidos</h3>
        <div class="dash-indicators">
          <div class="dash-indicator">
            <span class="dash-indicator-label">Clases programadas (futuras)</span>
            <span class="dash-indicator-value">${data.futureClasses.length}</span>
          </div>
          <div class="dash-indicator">
            <span class="dash-indicator-label">Camps próximos</span>
            <span class="dash-indicator-value">${data.futureCamps.length}</span>
          </div>
          <div class="dash-indicator">
            <span class="dash-indicator-label">% reservas con bono</span>
            <span class="dash-indicator-value">${totalEnrollments > 0 ? Math.round(enrollWithBono / totalEnrollments * 100) : 0}%</span>
          </div>
          <div class="dash-indicator">
            <span class="dash-indicator-label">Utilización créditos</span>
            <span class="dash-indicator-value">${totalCredits > 0 ? Math.round(usedCredits / totalCredits * 100) : 0}%</span>
          </div>
        </div>
      </div>
    `;
    // ---- Bind events ----
    // Date presets
    container.querySelectorAll('.dash-preset-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const preset = btn.dataset.preset;
        const d = getPresetDates(preset);
        dateFrom = d.from;
        dateTo = d.to;
        saveSettings({ ...loadSettings(), dash_from: dateFrom, dash_to: dateTo });
        await render();
      });
    });

    // Custom date inputs
    container.querySelector('#dash-from')?.addEventListener('change', async (e) => {
      dateFrom = e.target.value;
      saveSettings({ ...loadSettings(), dash_from: dateFrom });
      await render();
    });
    container.querySelector('#dash-to')?.addEventListener('change', async (e) => {
      dateTo = e.target.value;
      saveSettings({ ...loadSettings(), dash_to: dateTo });
      await render();
    });

    // Settings toggle
    container.querySelector('#dash-settings-toggle')?.addEventListener('click', () => {
      const panel = container.querySelector('#dash-settings-panel');
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
    });

    // Settings save
    container.querySelector('#dash-settings-save')?.addEventListener('click', () => {
      ivaPct = parseFloat(container.querySelector('#dash-iva')?.value) || 0;
      comisionPct = parseFloat(container.querySelector('#dash-comision')?.value) || 0;
      saveSettings({ ...loadSettings(), iva_pct: ivaPct, comision_pct: comisionPct });
      showToast('Configuración guardada', 'success');
      render();
    });

    // Today class cards → navigate to calendario
    container.querySelectorAll('.dash-today-card').forEach(card => {
      card.addEventListener('click', () => { location.hash = '#calendario'; });
    });

    } catch (renderErr) {
      console.error('Dashboard render error:', renderErr);
      container.innerHTML = `<p style="color:#ef4444;padding:24px">Error al renderizar dashboard: ${renderErr.message}</p>`;
    }
  }

  await render();
}

// ---- Helpers ----
function getPresetDates(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

  switch (preset) {
    case 'today': return { from: fmt(now), to: fmt(now) };
    case 'week': {
      const day = now.getDay();
      const mon = new Date(now);
      mon.setDate(d - (day === 0 ? 6 : day - 1));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { from: fmt(mon), to: fmt(sun) };
    }
    case 'month': {
      const lastDay = new Date(y, m + 1, 0);
      return { from: `${y}-${pad(m + 1)}-01`, to: fmt(lastDay) };
    }
    case 'quarter': {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
      const qEnd = new Date(y, Math.floor(m / 3) * 3 + 3, 0);
      return { from: fmt(qStart), to: fmt(qEnd) };
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

  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(d - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  if (from === fmt(mon) && to === fmt(sun)) return 'Esta semana';

  const lastDay = new Date(y, m + 1, 0);
  if (from === `${y}-${pad(m + 1)}-01` && to === fmt(lastDay)) return 'Este mes';

  const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
  const qEnd = new Date(y, Math.floor(m / 3) * 3 + 3, 0);
  if (from === fmt(qStart) && to === fmt(qEnd)) return 'Este trimestre';

  if (from === `${y}-01-01` && to === `${y}-12-31`) return 'Este año';

  return 'Personalizado';
}

function renderBarList(items, total) {
  return items.filter(i => i.value > 0).map(i => renderBarItem(i.label, i.value, total, i.color)).join('')
    || '<p class="dash-empty">Sin datos</p>';
}

function renderBarItem(label, value, total, color) {
  const pct = total > 0 ? Math.round(value / total * 100) : 0;
  return `
    <div class="dash-bar-item">
      <div class="dash-bar-label">
        <span>${label}</span>
        <span>${formatCurrency(value)} <small>(${pct}%)</small></span>
      </div>
      <div class="dash-bar-track">
        <div class="dash-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
}

function getMethodColor(method) {
  const colors = {
    efectivo: '#22c55e', tarjeta: '#0ea5e9', transferencia: '#6366f1',
    voucher: '#f59e0b', saldo: '#8b5cf6', online: '#ec4899', otros: '#94a3b8'
  };
  return colors[method] || '#94a3b8';
}
