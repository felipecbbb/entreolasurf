/* ============================================================
   Control Horario — Rejilla semanal de monitores (tipo Excel)
   ------------------------------------------------------------
   · Monitores = lista propia (no cuentas). Categoría 'monitor'
     (pago por horas) o 'carpa' (pago fijo por día: corto/largo/trabaja).
   · Rejilla: fechas en filas, monitores en columnas, editable,
     con TOTAL y PAGO por semana. Navegable por semanas + filtros.
   Acceso: admin + encargado (sección 'control-horario'). Quien tiene la
     sección la tiene entera: rejilla, monitores, tarifas y pagos.
   ============================================================ */
import { openModal, closeModal, showToast, formatCurrency } from '../modules/ui.js';
import { getProfile, canSendSchedules } from '../modules/auth.js';
import { supabase } from '/lib/supabase.js';
import { renderEnvioHorarios } from './envio-horarios.js';

const esc = (s) => s == null ? '' : String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAY_TYPE_OPTS = [
  { v: 'dia_corto', label: 'Día corto' },
  { v: 'dia_largo', label: 'Día largo' },
  { v: 'trabaja', label: 'Trabaja' },
  { v: 'fija', label: 'Fija' },
];

/* ---- Helpers de fecha (semana europea Lun→Dom) ---- */
function getDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function getWeekDates(baseDate) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const out = [];
  for (let i = 0; i < 7; i++) { const dd = new Date(monday); dd.setDate(monday.getDate() + i); out.push(dd); }
  return out;
}
function fmtHours(h) { return (Math.round(h * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 }); }

/* ---- API ---- */
function isSchemaMissing(error) {
  if (!error) return false;
  const code = error.code || '';
  if (['42P01', '42703', 'PGRST205', 'PGRST204'].includes(code)) return true;
  return /does not exist|schema cache|could not find/i.test(error.message || '');
}
async function fetchMonitors() {
  const { data, error } = await supabase.from('monitors')
    .select('*').order('sort_order', { ascending: true }).order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}
async function fetchMonitorShifts(from, to) {
  const { data, error } = await supabase.from('monitor_shifts')
    .select('*').gte('work_date', from).lte('work_date', to);
  if (error) throw error;
  return data || [];
}
async function fetchPayroll() {
  // select('*') a propósito: si falta la columna hora_extra (migración sin aplicar)
  // no queremos que reviente ni que se pierdan las tarifas de día ya guardadas.
  const { data, error } = await supabase.from('payroll_config').select('*').eq('id', 1).maybeSingle();
  if (error && !isSchemaMissing(error)) throw error;
  return data || { dia_corto: 62, dia_largo: 70, dia_trabaja: 36, hora_extra: 10 };
}
// Horas extra de la semana. Si falta la migración, degradamos a "sin extras"
// para no tumbar la rejilla entera.
async function fetchExtras(weekStart) {
  const { data, error } = await supabase.from('monitor_extra_hours')
    .select('monitor_id, week_start, hours').eq('week_start', weekStart);
  if (error) { if (isSchemaMissing(error)) return null; throw error; }
  return data || [];
}
async function saveExtra(monitor_id, week_start, hours) {
  const h = Number(hours);
  // Vacío o 0 → borrar la celda
  if (hours === '' || hours == null || !Number.isFinite(h) || h <= 0) {
    const { error } = await supabase.from('monitor_extra_hours')
      .delete().eq('monitor_id', monitor_id).eq('week_start', week_start);
    if (error) throw error; return;
  }
  const { error } = await supabase.from('monitor_extra_hours').upsert({
    monitor_id, week_start, hours: Math.round(h * 100) / 100, updated_at: new Date().toISOString(),
  }, { onConflict: 'monitor_id,week_start' });
  if (error) throw error;
}
// Semanas ya pagadas. Si falta la migración, degradamos a "ninguna pagada"
// para no tumbar la rejilla entera.
async function fetchPayments(weekStart) {
  const { data, error } = await supabase.from('monitor_payments')
    .select('monitor_id, week_start, amount, paid_at').eq('week_start', weekStart);
  if (error) { if (isSchemaMissing(error)) return null; throw error; }
  return data || [];
}
async function setPaid(monitor_id, week_start, amount, paid) {
  if (!paid) {
    const { error } = await supabase.from('monitor_payments')
      .delete().eq('monitor_id', monitor_id).eq('week_start', week_start);
    if (error) throw error; return;
  }
  const { error } = await supabase.from('monitor_payments').upsert({
    monitor_id, week_start, amount: Math.round(amount * 100) / 100,
    paid_at: new Date().toISOString(), paid_by: getProfile()?.id || null,
  }, { onConflict: 'monitor_id,week_start' });
  if (error) throw error;
}
async function saveCell(monitor_id, work_date, pay_type, hours) {
  // Vacío → borrar la celda
  if (!pay_type || (pay_type === 'hora' && (hours === '' || hours == null))) {
    const { error } = await supabase.from('monitor_shifts').delete().eq('monitor_id', monitor_id).eq('work_date', work_date);
    if (error) throw error; return;
  }
  const row = { monitor_id, work_date, pay_type, hours: pay_type === 'hora' ? Number(hours) : null };
  const { error } = await supabase.from('monitor_shifts').upsert(row, { onConflict: 'monitor_id,work_date' });
  if (error) throw error;
}

/* ============================================================
   Punto de entrada: dos pestañas. La rejilla la ve quien tenga la sección;
   "Envío de horarios" solo el admin y las cuentas con can_send_schedules.
   ============================================================ */
export async function renderControlHorario(container) {
  const puedeEnviar = canSendSchedules();
  let tab = 'rejilla';

  function shell() {
    container.innerHTML = `
      ${puedeEnviar ? `<div class="ch-tabs" role="tablist">
        <button class="ch-tab ${tab === 'rejilla' ? 'is-active' : ''}" data-tab="rejilla" role="tab">Rejilla de horas</button>
        <button class="ch-tab ${tab === 'envio' ? 'is-active' : ''}" data-tab="envio" role="tab">Envío de horarios</button>
      </div>` : ''}
      <div id="ch-tab-body"></div>`;
    container.querySelectorAll('.ch-tab').forEach(b => b.addEventListener('click', () => {
      if (tab === b.dataset.tab) return;
      tab = b.dataset.tab; mount();
    }));
    return container.querySelector('#ch-tab-body');
  }

  async function mount() {
    const body = shell();
    if (tab === 'envio' && puedeEnviar) await renderEnvioHorarios(body);
    else await renderRejilla(body);
  }

  await mount();
}

/* ============================================================ */
async function renderRejilla(container) {
  let currentDate = new Date(); currentDate.setHours(0, 0, 0, 0);
  let catFilter = '';       // '' | 'monitor' | 'carpa'
  let search = '';
  let monitors = [], shifts = [], payroll = { dia_corto: 62, dia_largo: 70, dia_trabaja: 36, hora_extra: 10 };
  let payments = [];        // pagos de la semana visible
  let paymentsOff = false;  // true si falta la migración monitor_payments
  let extras = [];          // horas extra de la semana visible
  let extrasOff = false;    // true si falta la migración monitor_extra_hours

  const rateOf = (m) => m.hourly_rate != null ? Number(m.hourly_rate) : 0;
  function dayRate(pt, m) {
    if (pt === 'dia_corto') return Number(payroll.dia_corto) || 0;
    if (pt === 'dia_largo') return Number(payroll.dia_largo) || 0;
    if (pt === 'trabaja') return Number(payroll.dia_trabaja) || 0;
    if (pt === 'fija') return m?.fixed_rate != null ? Number(m.fixed_rate) : 0;
    return 0;
  }
  function shiftPago(s, m) {
    if (!s) return 0;
    if (s.pay_type === 'hora') return (Number(s.hours) || 0) * rateOf(m);
    return dayRate(s.pay_type, m);
  }
  const extraRate = () => Number(payroll.hora_extra) || 0;

  async function render() {
    const wk = getWeekDates(currentDate);
    const from = getDateStr(wk[0]), to = getDateStr(wk[6]);
    try {
      let pay, ext;
      [monitors, shifts, payroll, pay, ext] = await Promise.all([
        fetchMonitors(), fetchMonitorShifts(from, to), fetchPayroll(), fetchPayments(from), fetchExtras(from),
      ]);
      paymentsOff = pay === null;
      payments = pay || [];
      extrasOff = ext === null;
      extras = ext || [];
    } catch (err) {
      if (isSchemaMissing(err)) {
        container.innerHTML = `<div class="admin-empty"><p><strong>Falta aplicar la migración de monitores.</strong><br>Ejecuta <code>supabase/migration-monitores.sql</code> en el SQL Editor de Supabase y recarga la página.</p></div>`;
      } else {
        container.innerHTML = `<div class="admin-empty"><p>Error al cargar: ${esc(err.message)}</p></div>`;
      }
      return;
    }

    // Columnas (monitores) según filtros
    let cols = monitors.filter(m => m.active);
    if (catFilter) cols = cols.filter(m => m.category === catFilter);
    if (search) cols = cols.filter(m => (m.name || '').toLowerCase().includes(search.toLowerCase()));

    const todayStr = getDateStr(new Date());
    const rangeLabel = `${wk[0].getDate()} – ${wk[6].getDate()} ${MONTH_NAMES[wk[6].getMonth()]} ${wk[6].getFullYear()}`;
    // Lookup de turnos: monitor|fecha → shift
    const map = {};
    shifts.forEach(s => { map[`${s.monitor_id}|${s.work_date}`] = s; });

    // Pago de la semana por monitor + lookup de semanas ya pagadas
    const paidMap = {};
    payments.forEach(p => { paidMap[p.monitor_id] = p; });
    // Horas extra de la semana por monitor (ajuste semanal, no un día trabajado)
    const extraByMon = {};
    extras.forEach(e => { extraByMon[e.monitor_id] = Number(e.hours) || 0; });

    const pagoByMon = {};
    cols.forEach(m => {
      const dayShifts = wk.map(d => map[`${m.id}|${getDateStr(d)}`]).filter(Boolean);
      const base = dayShifts.reduce((a, s) => a + shiftPago(s, m), 0);
      pagoByMon[m.id] = base + (extraByMon[m.id] || 0) * extraRate();
    });

    // ---- Cabecera de columnas ----
    const headCols = cols.map(m => {
      const paid = paidMap[m.id];
      return `<th class="mon-col-head ${m.category === 'carpa' ? 'is-carpa' : ''} ${paid ? 'is-paid' : ''}" title="${esc(m.name)}${paid ? ' · pagado' : ''}">${esc(m.name)}${paid ? ' <span class="mon-paid-tick">✓</span>' : ''}</th>`;
    }).join('');

    // ---- Filas por día ----
    const bodyRows = wk.map((d, i) => {
      const ds = getDateStr(d);
      const isToday = ds === todayStr;
      const cells = cols.map(m => {
        const s = map[`${m.id}|${ds}`];
        if (m.category === 'carpa') {
          const opts = `<option value="">—</option>` + DAY_TYPE_OPTS.map(o =>
            `<option value="${o.v}" ${s && s.pay_type === o.v ? 'selected' : ''}>${o.label}</option>`).join('');
          return `<td><select class="mon-cell mon-cell-sel" data-mid="${m.id}" data-date="${ds}">${opts}</select></td>`;
        }
        const val = s && s.pay_type === 'hora' && s.hours != null ? s.hours : '';
        return `<td><input type="number" min="0" step="0.5" class="mon-cell mon-cell-num" data-mid="${m.id}" data-date="${ds}" value="${val}" placeholder=""></td>`;
      }).join('');
      return `<tr class="${isToday ? 'is-today' : ''}">
        <th class="mon-day-head">${DAY_NAMES[i]} <span class="mon-day-num">${d.getDate()}</span></th>
        ${cells}
      </tr>`;
    }).join('');

    // ---- Fila TOTAL ----
    const totalCells = cols.map(m => {
      const dayShifts = wk.map(d => map[`${m.id}|${getDateStr(d)}`]).filter(Boolean);
      if (m.category === 'carpa') {
        const c = dayShifts.filter(s => s.pay_type === 'dia_corto').length;
        const l = dayShifts.filter(s => s.pay_type === 'dia_largo').length;
        const t = dayShifts.filter(s => s.pay_type === 'trabaja').length;
        const f = dayShifts.filter(s => s.pay_type === 'fija').length;
        const parts = [c && `${c}C`, l && `${l}L`, t && `${t}T`, f && `${f}F`].filter(Boolean).join(' ');
        return `<td class="mon-total-cell">${parts || '·'}</td>`;
      }
      const h = dayShifts.reduce((a, s) => a + (Number(s.hours) || 0), 0);
      return `<td class="mon-total-cell">${h > 0 ? fmtHours(h) + ' h' : '·'}</td>`;
    }).join('');

    // ---- Fila EXTRA (horas extra de la semana, para monitores y carpa) ----
    const extraCells = cols.map(m => {
      const h = extraByMon[m.id] || 0;
      const imp = h * extraRate();
      return `<td class="mon-extra-cell ${h > 0 ? 'has-extra' : ''}">
        <input type="number" min="0" step="0.5" class="mon-cell mon-cell-extra" data-mid="${m.id}"
          value="${h > 0 ? h : ''}" placeholder="0"
          title="Horas extra de ${esc(m.name)} esta semana${h > 0 ? ` · ${formatCurrency(imp)}` : ''}">
        ${h > 0 ? `<span class="mon-extra-imp">${formatCurrency(imp)}</span>` : ''}
      </td>`;
    }).join('');

    // ---- Fila PAGO ----
    let grandTotal = 0, paidTotal = 0;
    const pagoCells = cols.map(m => {
      const pago = pagoByMon[m.id];
      grandTotal += pago;
      if (paidMap[m.id]) paidTotal += pago;
      return `<td class="mon-pago-cell">${pago > 0 ? formatCurrency(pago) : '·'}</td>`;
    }).join('');

    // ---- Fila PAGADO (marcar la semana como abonada a cada monitor) ----
    const paidCells = cols.map(m => {
      const pago = pagoByMon[m.id];
      const p = paidMap[m.id];
      if (!pago && !p) return `<td class="mon-paid-cell">·</td>`;
      const when = p ? new Date(p.paid_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : '';
      const stale = p && Math.abs(Number(p.amount) - pago) > 0.01;
      return `<td class="mon-paid-cell ${p ? 'is-paid' : ''}">
        <label class="mon-paid-lbl" title="${p ? `Pagado el ${when} · ${formatCurrency(Number(p.amount))}` : 'Marcar como pagado'}">
          <input type="checkbox" class="mon-paid-cb" data-mid="${m.id}" data-amount="${pago}" ${p ? 'checked' : ''}>
          <span class="mon-paid-when">${p ? when : 'Pagar'}</span>
        </label>
        ${stale ? `<span class="mon-paid-warn" title="Se pagaron ${formatCurrency(Number(p.amount))}, pero ahora la semana suma ${formatCurrency(pago)}">≠</span>` : ''}
      </td>`;
    }).join('');

    container.innerHTML = `
      <div class="mon-page">
        <div class="ch-topbar">
          <div class="ch-nav">
            <button class="ch-nav-arrow" id="mon-prev" title="Semana anterior">‹</button>
            <button class="ch-today-btn" id="mon-today">Hoy</button>
            <button class="ch-nav-arrow" id="mon-next" title="Semana siguiente">›</button>
            <label class="ch-date-pick" title="Ir a una fecha">
              <span class="ch-date-ico" aria-hidden="true">📅</span>
              <input type="date" id="mon-date" value="${getDateStr(currentDate)}">
            </label>
          </div>
          <div class="ch-range">${rangeLabel}</div>
          <div class="ch-actions">
            <select id="mon-cat" class="mon-filter">
              <option value="" ${!catFilter ? 'selected' : ''}>Todas las categorías</option>
              <option value="monitor" ${catFilter === 'monitor' ? 'selected' : ''}>Monitores (horas)</option>
              <option value="carpa" ${catFilter === 'carpa' ? 'selected' : ''}>Carpa (día)</option>
            </select>
            <input type="search" id="mon-search" class="mon-filter" placeholder="Buscar monitor…" value="${esc(search)}">
            <button class="btn line" id="mon-manage">Monitores</button>
            <button class="btn line" id="mon-rates">Tarifas</button>
          </div>
        </div>

        ${cols.length === 0 ? `<div class="admin-empty"><p>${monitors.length ? 'Ningún monitor con ese filtro.' : 'No hay monitores. Pulsa "Monitores" para añadirlos.'}</p></div>` : `
        <div class="mon-grid-wrap">
          <table class="mon-grid">
            <thead><tr><th class="mon-corner">Semana</th>${headCols}</tr></thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
              <tr class="mon-total-row"><th class="mon-day-head">TOTAL</th>${totalCells}</tr>
              ${extrasOff ? '' : `<tr class="mon-extra-row"><th class="mon-day-head" title="Horas extra de la semana · ${formatCurrency(extraRate())}/h">EXTRA</th>${extraCells}</tr>`}
              <tr class="mon-pago-row"><th class="mon-day-head">PAGO</th>${pagoCells}</tr>
              ${paymentsOff ? '' : `<tr class="mon-paid-row"><th class="mon-day-head">PAGADO</th>${paidCells}</tr>`}
            </tfoot>
          </table>
        </div>
        <div class="mon-grandtotal">
          Total semana: <strong>${formatCurrency(grandTotal)}</strong>
          ${paymentsOff ? '' : ` · Pagado: <strong class="mon-gt-paid">${formatCurrency(paidTotal)}</strong> · Pendiente: <strong class="mon-gt-pending">${formatCurrency(grandTotal - paidTotal)}</strong>`}
        </div>
        <div class="mon-legend">C = día corto · L = día largo · T = trabaja · F = fija${extrasOff ? ' · <em>Falta aplicar migration-horas-extra.sql para las horas extra</em>' : ` · EXTRA = horas extra de la semana a ${formatCurrency(extraRate())}/h (se suman al PAGO)`}${paymentsOff ? ' · <em>Falta aplicar migration-monitor-payments.sql para marcar pagos</em>' : ''}</div>`}
      </div>`;

    bindEvents();
  }

  function bindEvents() {
    container.querySelector('#mon-prev')?.addEventListener('click', () => { currentDate.setDate(currentDate.getDate() - 7); render(); });
    container.querySelector('#mon-next')?.addEventListener('click', () => { currentDate.setDate(currentDate.getDate() + 7); render(); });
    container.querySelector('#mon-today')?.addEventListener('click', () => { currentDate = new Date(); currentDate.setHours(0, 0, 0, 0); render(); });
    container.querySelector('#mon-date')?.addEventListener('change', (e) => {
      const v = e.target.value; if (!v) return;
      const [y, m, d] = v.split('-').map(Number);
      currentDate = new Date(y, m - 1, d); currentDate.setHours(0, 0, 0, 0);
      render();
    });
    container.querySelector('#mon-cat')?.addEventListener('change', (e) => { catFilter = e.target.value; render(); });
    const searchEl = container.querySelector('#mon-search');
    if (searchEl) {
      let t = null;
      searchEl.addEventListener('input', (e) => { clearTimeout(t); const v = e.target.value; t = setTimeout(() => { search = v; render(); }, 300); });
    }
    container.querySelector('#mon-manage')?.addEventListener('click', openMonitorsModal);
    container.querySelector('#mon-rates')?.addEventListener('click', openRatesModal);

    // Celdas: guardar al cambiar
    container.querySelectorAll('.mon-cell-num').forEach(inp => {
      inp.addEventListener('change', async () => {
        try { await saveCell(inp.dataset.mid, inp.dataset.date, 'hora', inp.value); await render(); }
        catch (err) { showToast('Error: ' + err.message, 'error'); }
      });
    });
    container.querySelectorAll('.mon-cell-sel').forEach(sel => {
      sel.addEventListener('change', async () => {
        try { await saveCell(sel.dataset.mid, sel.dataset.date, sel.value, null); await render(); }
        catch (err) { showToast('Error: ' + err.message, 'error'); }
      });
    });

    // Fila EXTRA: horas extra de la semana por monitor
    container.querySelectorAll('.mon-cell-extra').forEach(inp => {
      inp.addEventListener('change', async () => {
        const weekStart = getDateStr(getWeekDates(currentDate)[0]);
        try { await saveExtra(inp.dataset.mid, weekStart, inp.value); await render(); }
        catch (err) { showToast('Error: ' + err.message, 'error'); }
      });
    });

    // Fila PAGADO: marcar/desmarcar la semana como abonada
    container.querySelectorAll('.mon-paid-cb').forEach(cb => {
      cb.addEventListener('change', async () => {
        const weekStart = getDateStr(getWeekDates(currentDate)[0]);
        const paid = cb.checked;
        const amount = Number(cb.dataset.amount) || 0;
        const name = monitors.find(m => m.id === cb.dataset.mid)?.name || 'el monitor';
        if (!paid && !confirm(`¿Desmarcar el pago de ${name} de esta semana?`)) { cb.checked = true; return; }
        cb.disabled = true;
        try {
          await setPaid(cb.dataset.mid, weekStart, amount, paid);
          showToast(paid ? `Pago registrado: ${name} · ${formatCurrency(amount)}` : 'Pago desmarcado', 'success');
          await render();
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
          cb.checked = !paid; cb.disabled = false;
        }
      });
    });
  }

  /* ---- Modal: gestionar monitores ---- */
  function openMonitorsModal() {
    const rows = monitors.map(m => `
      <div class="mon-row" data-id="${m.id}">
        <input type="text" class="act-form-input mon-m-name" value="${esc(m.name)}" placeholder="Nombre" style="flex:2">
        <select class="act-form-input mon-m-cat" style="flex:1">
          <option value="monitor" ${m.category === 'monitor' ? 'selected' : ''}>Monitor (horas)</option>
          <option value="carpa" ${m.category === 'carpa' ? 'selected' : ''}>Carpa (día)</option>
        </select>
        <input type="number" min="0" step="0.5" class="act-form-input mon-m-rate" value="${m.hourly_rate ?? ''}" placeholder="€/h" title="€/h (solo categoría monitor)" style="width:80px">
        <label style="display:flex;align-items:center;gap:4px;font-size:.8rem"><input type="checkbox" class="mon-m-active" ${m.active ? 'checked' : ''}>Activo</label>
      </div>`).join('');
    openModal('Monitores', `
      <p class="ch-rates-hint">Lista de monitores. El €/h solo aplica a categoría "Monitor". Los de "Carpa" se pagan por día (tarifas en el botón Tarifas).</p>
      <div class="mon-rows-list">${rows}</div>
      <div class="mon-row" style="margin-top:8px;border-top:1px dashed #e2e8f0;padding-top:10px">
        <input type="text" class="act-form-input" id="mon-new-name" placeholder="Nuevo monitor…" style="flex:2">
        <select class="act-form-input" id="mon-new-cat" style="flex:1"><option value="monitor">Monitor (horas)</option><option value="carpa">Carpa (día)</option></select>
        <input type="number" min="0" step="0.5" class="act-form-input" id="mon-new-rate" placeholder="€/h" style="width:80px">
        <button type="button" class="btn line" id="mon-add">Añadir</button>
      </div>
      <div class="ch-form-actions">
        <button type="button" class="btn line" id="mon-cancel">Cerrar</button>
        <button type="button" class="btn red" id="mon-save">Guardar cambios</button>
      </div>`);

    document.getElementById('mon-add').addEventListener('click', async () => {
      const name = document.getElementById('mon-new-name').value.trim();
      if (!name) { showToast('Escribe un nombre', 'error'); return; }
      const category = document.getElementById('mon-new-cat').value;
      const rateStr = document.getElementById('mon-new-rate').value;
      try {
        await supabase.from('monitors').insert({
          name, category, default_pay_type: category === 'carpa' ? 'dia_corto' : 'hora',
          hourly_rate: category === 'monitor' && rateStr !== '' ? Number(rateStr) : null,
          sort_order: monitors.length,
        });
        showToast('Monitor añadido', 'success'); closeModal(); await render(); openMonitorsModal();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
    document.getElementById('mon-cancel').addEventListener('click', closeModal);
    document.getElementById('mon-save').addEventListener('click', async () => {
      const btn = document.getElementById('mon-save'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        for (const row of document.querySelectorAll('.mon-row[data-id]')) {
          const id = row.dataset.id;
          const name = row.querySelector('.mon-m-name').value.trim();
          const category = row.querySelector('.mon-m-cat').value;
          const rateStr = row.querySelector('.mon-m-rate').value;
          const active = row.querySelector('.mon-m-active').checked;
          await supabase.from('monitors').update({
            name, category, active,
            hourly_rate: category === 'monitor' && rateStr !== '' ? Number(rateStr) : null,
          }).eq('id', id);
        }
        showToast('Monitores guardados', 'success'); closeModal(); await render();
      } catch (err) { showToast('Error: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    });
  }

  /* ---- Modal: tarifas globales de día (corto/largo/trabaja) ---- */
  function openRatesModal() {
    openModal('Tarifas de día', `
      <p class="ch-rates-hint">Importe fijo por día para la categoría "Carpa". El €/h de cada monitor se edita en el botón Monitores. La hora extra aplica a todos (monitores y carpa).</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div class="act-form-field" style="flex:1;min-width:120px"><label class="act-form-label">DÍA CORTO €</label><input type="number" min="0" step="0.5" class="act-form-input" id="mon-r-corto" value="${Number(payroll.dia_corto)}"></div>
        <div class="act-form-field" style="flex:1;min-width:120px"><label class="act-form-label">DÍA LARGO €</label><input type="number" min="0" step="0.5" class="act-form-input" id="mon-r-largo" value="${Number(payroll.dia_largo)}"></div>
        <div class="act-form-field" style="flex:1;min-width:120px"><label class="act-form-label">TRABAJA €</label><input type="number" min="0" step="0.5" class="act-form-input" id="mon-r-trab" value="${Number(payroll.dia_trabaja)}"></div>
        ${extrasOff ? '' : `<div class="act-form-field" style="flex:1;min-width:120px"><label class="act-form-label">HORA EXTRA €/h</label><input type="number" min="0" step="0.5" class="act-form-input" id="mon-r-extra" value="${extraRate()}"></div>`}
      </div>
      <div class="ch-form-actions">
        <button type="button" class="btn line" id="mon-r-cancel">Cancelar</button>
        <button type="button" class="btn red" id="mon-r-save">Guardar tarifas</button>
      </div>`);
    document.getElementById('mon-r-cancel').addEventListener('click', closeModal);
    document.getElementById('mon-r-save').addEventListener('click', async () => {
      const btn = document.getElementById('mon-r-save'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const patch = {
          dia_corto: Number(document.getElementById('mon-r-corto').value) || 0,
          dia_largo: Number(document.getElementById('mon-r-largo').value) || 0,
          dia_trabaja: Number(document.getElementById('mon-r-trab').value) || 0,
          updated_at: new Date().toISOString(),
        };
        const extraEl = document.getElementById('mon-r-extra');
        if (extraEl) patch.hora_extra = Number(extraEl.value) || 0;
        await supabase.from('payroll_config').update(patch).eq('id', 1);
        showToast('Tarifas guardadas', 'success'); closeModal(); await render();
      } catch (err) { showToast('Error: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Guardar tarifas'; }
    });
  }

  await render();
}
