/* ============================================================
   Estadísticas — Tabs: Resumen · Cobrado · Pendiente · Detalle
   ============================================================ */
import {
  fetchPaymentsFiltered,
  fetchPendingBookings, fetchPendingRentals, fetchPendingOrders, fetchPendingBonos,
} from '../modules/api.js';
import { formatCurrency } from '../modules/ui.js';

const esc = (s) => s == null ? '' : String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const CHANNEL_LABELS = { web: 'Web', in_person: 'Presencial (playa)' };
const METHOD_LABELS = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia',
  voucher: 'Voucher', saldo: 'Saldo', online: 'Online (Stripe)',
};
const TYPE_LABELS = {
  enrollment: 'Clases', booking: 'Surf camps', order: 'Tienda',
  bono: 'Bonos', rental: 'Alquiler', custom: 'Custom',
};
const ENTITY_LABELS = {
  all: 'Todas',
  booking: 'Surf camps',
  rental: 'Alquileres material',
  order: 'Pedidos tienda',
  bono: 'Bonos / clases',
};

function pad(n) { return String(n).padStart(2, '0'); }
function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
}
function fmtDateTime(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function loadState() {
  try { return JSON.parse(localStorage.getItem('eos_estad_state') || '{}'); } catch { return {}; }
}
function saveState(s) { localStorage.setItem('eos_estad_state', JSON.stringify(s)); }

function defaultDates() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmt(monthStart), to: fmt(now) };
}

const TABS = [
  { id: 'resumen',   label: 'Resumen' },
  { id: 'cobrado',   label: 'Cobrado' },
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'detalle',   label: 'Detalle' },
];

export async function renderEstadisticas(container) {
  const saved = loadState();
  const defaults = defaultDates();
  const state = {
    tab:        saved.tab        || 'resumen',
    dateFrom:   saved.dateFrom   || defaults.from,
    dateTo:     saved.dateTo     || defaults.to,
    channel:    saved.channel    || 'all',
    method:     saved.method     || 'all',
    type:       saved.type       || 'all',
    pendingEnt: saved.pendingEnt || 'all',
  };

  function persist() { saveState(state); }

  async function renderShell() {
    container.innerHTML = `
      <div class="estad-toolbar">
        <div class="estad-date-range">
          <div class="estad-presets">
            ${['Hoy', 'Semana', 'Mes', 'Trimestre', 'Año'].map(p => `
              <button class="estad-preset-btn" data-preset="${p.toLowerCase()}">${p}</button>
            `).join('')}
          </div>
          <div class="estad-custom-range">
            <input type="date" id="estad-from" value="${state.dateFrom}" />
            <span>—</span>
            <input type="date" id="estad-to" value="${state.dateTo}" />
          </div>
        </div>
      </div>

      <div class="estad-tabs">
        ${TABS.map(t => `
          <button class="estad-tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>
        `).join('')}
      </div>

      <div class="estad-tab-content" id="estad-content">
        <div class="admin-skeleton" style="padding:24px 0">
          <div class="admin-skeleton-row"><div class="admin-skeleton-block w-full h-card"></div><div class="admin-skeleton-block w-full h-card"></div></div>
        </div>
      </div>
    `;

    container.querySelectorAll('.estad-tab').forEach(b => {
      b.addEventListener('click', () => {
        state.tab = b.dataset.tab;
        persist();
        container.querySelectorAll('.estad-tab').forEach(x => x.classList.toggle('active', x === b));
        renderTab();
      });
    });

    container.querySelector('#estad-from').addEventListener('change', (e) => { state.dateFrom = e.target.value; persist(); renderTab(); });
    container.querySelector('#estad-to').addEventListener('change',   (e) => { state.dateTo   = e.target.value; persist(); renderTab(); });

    container.querySelectorAll('.estad-preset-btn').forEach(b => {
      b.addEventListener('click', () => {
        const d = presetDates(b.dataset.preset);
        state.dateFrom = d.from; state.dateTo = d.to;
        container.querySelector('#estad-from').value = d.from;
        container.querySelector('#estad-to').value = d.to;
        persist(); renderTab();
      });
    });

    await renderTab();
  }

  async function renderTab() {
    const content = container.querySelector('#estad-content');
    content.innerHTML = `<div class="estad-loading">Cargando…</div>`;
    try {
      if (state.tab === 'resumen')   await renderResumen(content);
      if (state.tab === 'cobrado')   await renderCobrado(content);
      if (state.tab === 'pendiente') await renderPendiente(content);
      if (state.tab === 'detalle')   await renderDetalle(content);
    } catch (err) {
      content.innerHTML = `<p style="color:#ef4444;padding:18px">Error: ${esc(err.message)}</p>`;
      console.error(err);
    }
  }

  // ---------- RESUMEN ----------
  async function renderResumen(el) {
    const payments = await fetchPaymentsFiltered({ dateFrom: state.dateFrom, dateTo: state.dateTo });

    const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const byCh  = { web: 0, in_person: 0 };
    payments.forEach(p => { byCh[p.channel || 'in_person'] += Number(p.amount || 0); });
    const txCount = payments.length;
    const ticket  = txCount > 0 ? total / txCount : 0;
    const webPct  = total > 0 ? Math.round((byCh.web / total) * 100) : 0;

    el.innerHTML = `
      <div class="estad-kpis">
        <div class="estad-kpi estad-kpi-primary">
          <div class="estad-kpi-label">Cobrado en el período</div>
          <div class="estad-kpi-value">${formatCurrency(total)}</div>
          <div class="estad-kpi-sub">${txCount} transacciones · ticket medio ${formatCurrency(ticket)}</div>
        </div>
        <div class="estad-kpi">
          <div class="estad-kpi-label">Web</div>
          <div class="estad-kpi-value">${formatCurrency(byCh.web)}</div>
          <div class="estad-kpi-sub">${webPct}% del total</div>
        </div>
        <div class="estad-kpi">
          <div class="estad-kpi-label">Presencial (playa)</div>
          <div class="estad-kpi-value">${formatCurrency(byCh.in_person)}</div>
          <div class="estad-kpi-sub">${100 - webPct}% del total</div>
        </div>
      </div>

      <div class="estad-resumen-breakdown">
        <h4>Reparto por método de pago</h4>
        ${renderBreakdown(payments, 'payment_method', METHOD_LABELS)}
      </div>

      <div class="estad-resumen-breakdown">
        <h4>Reparto por tipo</h4>
        ${renderBreakdown(payments, 'reservation_type', TYPE_LABELS)}
      </div>
    `;
  }

  // ---------- COBRADO ----------
  async function renderCobrado(el) {
    el.innerHTML = `
      <div class="estad-filters">
        ${filterSelect('estad-f-channel', 'Canal', state.channel, [
          { v: 'all', l: 'Web + Presencial' },
          { v: 'web', l: 'Solo web' },
          { v: 'in_person', l: 'Solo presencial (playa)' },
        ])}
        ${filterSelect('estad-f-method', 'Método', state.method, [
          { v: 'all', l: 'Todos los métodos' },
          ...Object.entries(METHOD_LABELS).map(([v, l]) => ({ v, l })),
        ])}
        ${filterSelect('estad-f-type', 'Tipo', state.type, [
          { v: 'all', l: 'Todos los tipos' },
          ...Object.entries(TYPE_LABELS).map(([v, l]) => ({ v, l })),
        ])}
      </div>
      <div id="estad-cobrado-body"><div class="estad-loading">Cargando…</div></div>
    `;

    el.querySelector('#estad-f-channel').addEventListener('change', (e) => { state.channel = e.target.value; persist(); renderCobradoBody(); });
    el.querySelector('#estad-f-method').addEventListener('change',  (e) => { state.method  = e.target.value; persist(); renderCobradoBody(); });
    el.querySelector('#estad-f-type').addEventListener('change',    (e) => { state.type    = e.target.value; persist(); renderCobradoBody(); });

    await renderCobradoBody();

    async function renderCobradoBody() {
      const body = el.querySelector('#estad-cobrado-body');
      body.innerHTML = `<div class="estad-loading">Cargando…</div>`;
      const payments = await fetchPaymentsFiltered({
        dateFrom: state.dateFrom, dateTo: state.dateTo,
        channel: state.channel, paymentMethod: state.method, reservationType: state.type,
      });

      const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

      // Cruce channel × method
      const matrix = {};
      payments.forEach(p => {
        const ch = p.channel || 'in_person';
        const mt = p.payment_method || 'otros';
        matrix[ch] = matrix[ch] || {};
        matrix[ch][mt] = (matrix[ch][mt] || 0) + Number(p.amount || 0);
      });

      const methods = [...new Set(payments.map(p => p.payment_method))].filter(Boolean).sort();

      body.innerHTML = `
        <div class="estad-total-card">
          <span class="estad-total-label">Total filtrado</span>
          <span class="estad-total-value">${formatCurrency(total)}</span>
          <span class="estad-total-sub">${payments.length} transacciones</span>
        </div>

        ${methods.length ? `
          <div class="estad-table-wrap">
            <table class="estad-table">
              <thead>
                <tr>
                  <th>Canal · Método</th>
                  ${methods.map(m => `<th>${esc(METHOD_LABELS[m] || m)}</th>`).join('')}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${Object.keys(matrix).map(ch => {
                  const rowTotal = Object.values(matrix[ch]).reduce((s, v) => s + v, 0);
                  return `
                    <tr>
                      <td><strong>${esc(CHANNEL_LABELS[ch] || ch)}</strong></td>
                      ${methods.map(m => `<td class="estad-num">${matrix[ch][m] ? formatCurrency(matrix[ch][m]) : '—'}</td>`).join('')}
                      <td class="estad-num"><strong>${formatCurrency(rowTotal)}</strong></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `<p class="estad-empty">Sin pagos para los filtros aplicados</p>`}
      `;
    }
  }

  // ---------- PENDIENTE ----------
  async function renderPendiente(el) {
    el.innerHTML = `
      <div class="estad-filters">
        ${filterSelect('estad-f-entity', 'Mostrar', state.pendingEnt, [
          { v: 'all', l: 'Todas las entidades' },
          { v: 'booking', l: 'Surf camps' },
          { v: 'rental', l: 'Alquileres' },
          { v: 'order', l: 'Pedidos tienda' },
          { v: 'bono', l: 'Bonos sin cobrar' },
        ])}
      </div>
      <div id="estad-pendiente-body"><div class="estad-loading">Cargando…</div></div>
    `;

    el.querySelector('#estad-f-entity').addEventListener('change', (e) => {
      state.pendingEnt = e.target.value; persist(); renderPendienteBody();
    });

    await renderPendienteBody();

    async function renderPendienteBody() {
      const body = el.querySelector('#estad-pendiente-body');
      body.innerHTML = `<div class="estad-loading">Cargando…</div>`;

      const need = state.pendingEnt;
      const tasks = [];
      if (need === 'all' || need === 'booking') tasks.push(fetchPendingBookings().then(arr => ({ key: 'booking', arr })));
      if (need === 'all' || need === 'rental')  tasks.push(fetchPendingRentals().then(arr  => ({ key: 'rental',  arr })));
      if (need === 'all' || need === 'order')   tasks.push(fetchPendingOrders().then(arr   => ({ key: 'order',   arr })));
      if (need === 'all' || need === 'bono')    tasks.push(fetchPendingBonos().then(arr    => ({ key: 'bono',    arr })));

      const results = await Promise.all(tasks);
      const sections = results.filter(r => r.arr.length > 0);

      if (!sections.length) {
        body.innerHTML = `<div class="estad-empty-card"><p>Sin pendientes de cobro</p></div>`;
        return;
      }

      const grandTotal = sections.reduce((s, sec) => s + sec.arr.reduce((acc, x) => acc + (x.pending || 0), 0), 0);

      body.innerHTML = `
        <div class="estad-total-card">
          <span class="estad-total-label">Total pendiente</span>
          <span class="estad-total-value">${formatCurrency(grandTotal)}</span>
        </div>

        ${sections.map(sec => `
          <div class="estad-pending-section">
            <h4 class="estad-pending-title">${esc(ENTITY_LABELS[sec.key] || sec.key)} <span class="estad-pending-count">${sec.arr.length}</span></h4>
            <div class="estad-table-wrap">
              <table class="estad-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contacto</th>
                    ${sec.key === 'rental' || sec.key === 'bono' ? '<th>Concepto</th>' : ''}
                    <th>Fecha</th>
                    <th class="estad-num">Total</th>
                    <th class="estad-num">Pagado</th>
                    <th class="estad-num estad-pending-col">Pendiente</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  ${sec.arr.map(r => `
                    <tr>
                      <td>${esc(r.client)}</td>
                      <td>
                        ${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ''}
                        ${r.phone ? `<small style="display:block;color:var(--color-muted)">${esc(r.phone)}</small>` : ''}
                      </td>
                      ${sec.key === 'rental' || sec.key === 'bono' ? `<td>${esc(r.meta || '')}</td>` : ''}
                      <td>${esc(fmtDate(r.created_at))}</td>
                      <td class="estad-num">${formatCurrency(r.total)}</td>
                      <td class="estad-num">${formatCurrency(r.paid)}</td>
                      <td class="estad-num estad-pending-col"><strong>${formatCurrency(r.pending)}</strong></td>
                      <td>${esc(r.status)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `).join('')}
      `;
    }
  }

  // ---------- DETALLE ----------
  async function renderDetalle(el) {
    el.innerHTML = `
      <div class="estad-filters">
        ${filterSelect('estad-f-channel2', 'Canal', state.channel, [
          { v: 'all', l: 'Web + Presencial' },
          { v: 'web', l: 'Solo web' },
          { v: 'in_person', l: 'Solo presencial' },
        ])}
        ${filterSelect('estad-f-method2', 'Método', state.method, [
          { v: 'all', l: 'Todos los métodos' },
          ...Object.entries(METHOD_LABELS).map(([v, l]) => ({ v, l })),
        ])}
        ${filterSelect('estad-f-type2', 'Tipo', state.type, [
          { v: 'all', l: 'Todos los tipos' },
          ...Object.entries(TYPE_LABELS).map(([v, l]) => ({ v, l })),
        ])}
      </div>
      <div id="estad-detalle-body"><div class="estad-loading">Cargando…</div></div>
    `;

    el.querySelector('#estad-f-channel2').addEventListener('change', (e) => { state.channel = e.target.value; persist(); renderDetalleBody(); });
    el.querySelector('#estad-f-method2').addEventListener('change',  (e) => { state.method  = e.target.value; persist(); renderDetalleBody(); });
    el.querySelector('#estad-f-type2').addEventListener('change',    (e) => { state.type    = e.target.value; persist(); renderDetalleBody(); });

    await renderDetalleBody();

    async function renderDetalleBody() {
      const body = el.querySelector('#estad-detalle-body');
      body.innerHTML = `<div class="estad-loading">Cargando…</div>`;
      const payments = await fetchPaymentsFiltered({
        dateFrom: state.dateFrom, dateTo: state.dateTo,
        channel: state.channel, paymentMethod: state.method, reservationType: state.type,
      });

      if (!payments.length) {
        body.innerHTML = `<p class="estad-empty">Sin pagos para los filtros aplicados</p>`;
        return;
      }

      const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

      body.innerHTML = `
        <div class="estad-total-card">
          <span class="estad-total-label">${payments.length} pagos · total</span>
          <span class="estad-total-value">${formatCurrency(total)}</span>
        </div>
        <div class="estad-table-wrap">
          <table class="estad-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Canal</th>
                <th>Método</th>
                <th>Tipo</th>
                <th class="estad-num">Importe</th>
                <th>Concepto / Notas</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map(p => `
                <tr>
                  <td>${esc(fmtDateTime(p.payment_date))}</td>
                  <td><span class="estad-chip estad-chip-${p.channel || 'in_person'}">${esc(CHANNEL_LABELS[p.channel] || p.channel || '—')}</span></td>
                  <td>${esc(METHOD_LABELS[p.payment_method] || p.payment_method || '—')}</td>
                  <td>${esc(TYPE_LABELS[p.reservation_type] || p.reservation_type || '—')}</td>
                  <td class="estad-num"><strong>${formatCurrency(p.amount)}</strong></td>
                  <td><small>${esc(p.concept || p.notes || '')}</small></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  // ---------- Helpers ----------
  function filterSelect(id, label, value, options) {
    return `
      <label class="estad-filter">
        <span>${esc(label)}</span>
        <select id="${id}">
          ${options.map(o => `<option value="${esc(o.v)}" ${o.v === value ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
        </select>
      </label>
    `;
  }

  function renderBreakdown(payments, field, labels) {
    const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    if (!total) return '<p class="estad-empty">Sin datos</p>';
    const agg = {};
    payments.forEach(p => {
      const k = p[field] || 'otros';
      agg[k] = (agg[k] || 0) + Number(p.amount || 0);
    });
    return `
      <div class="estad-bar-list">
        ${Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
          const pct = Math.round((v / total) * 100);
          return `
            <div class="estad-bar-item">
              <div class="estad-bar-label">
                <span>${esc(labels[k] || k)}</span>
                <span>${formatCurrency(v)} <small>(${pct}%)</small></span>
              </div>
              <div class="estad-bar-track"><div class="estad-bar-fill" style="width:${pct}%"></div></div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function presetDates(preset) {
    const n = new Date();
    const y = n.getFullYear(), m = n.getMonth(), d = n.getDate();
    switch (preset) {
      case 'hoy': return { from: fmt(n), to: fmt(n) };
      case 'semana': {
        const day = n.getDay();
        const mon = new Date(n); mon.setDate(d - (day === 0 ? 6 : day - 1));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        return { from: fmt(mon), to: fmt(sun) };
      }
      case 'mes': {
        const last = new Date(y, m + 1, 0);
        return { from: `${y}-${pad(m + 1)}-01`, to: fmt(last) };
      }
      case 'trimestre': {
        const qs = new Date(y, Math.floor(m / 3) * 3, 1);
        const qe = new Date(y, Math.floor(m / 3) * 3 + 3, 0);
        return { from: fmt(qs), to: fmt(qe) };
      }
      case 'año': case 'ano': return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    return defaultDates();
  }

  await renderShell();
}
