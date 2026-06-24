/* ============================================================
   Control Horario — Horas y pago de instructores
   ------------------------------------------------------------
   · Calendario semanal (tipo Google Calendar) para anotar las
     horas de cada instructor escribiendo entrada/salida.
   · Tarifa por hora configurable por instructor (profiles.hourly_rate).
   · Cálculo del pago por día / semana / mes.
   Acceso: admin + encargado (sección 'control-horario').
   ============================================================ */
import { openModal, closeModal, showToast, formatCurrency } from '../modules/ui.js';
import { isAdmin } from '../modules/auth.js';
import { supabase } from '/lib/supabase.js';

const esc = (s) => s == null ? '' : String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Paleta de colores por instructor (asignación estable por índice)
const COLORS = ['#0ea5e9', '#2d6a4f', '#c2410c', '#7c3aed', '#be123c', '#0f2f39', '#b45309', '#0891b2', '#9333ea', '#15803d'];

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* ---- Helpers de fecha (Date nativo, semana europea Lun→Dom) ---- */
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
  for (let i = 0; i < 7; i++) {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    out.push(dd);
  }
  return out;
}
function minDateStr(a, b) { return a < b ? a : b; }
function maxDateStr(a, b) { return a > b ? a : b; }

/* ---- Helpers de horas ---- */
function parseHM(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}
function shiftHours(s) {
  const a = parseHM(s.start_time), b = parseHM(s.end_time);
  if (a == null || b == null || b <= a) return 0;
  return (b - a) / 60;
}
function shiftCost(s, fallbackRate) {
  const rate = s.hourly_rate != null ? Number(s.hourly_rate)
    : (fallbackRate != null ? Number(fallbackRate) : 0);
  return shiftHours(s) * (Number.isFinite(rate) ? rate : 0);
}
function fmtHours(h) {
  return (Math.round(h * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' h';
}
const hm = (t) => t ? String(t).slice(0, 5) : '';

/* ---- API (específico de esta sección → supabase.from directo) ---- */
// Detecta el error típico de "tabla/columna inexistente" (migración sin aplicar)
function isSchemaMissing(error) {
  if (!error) return false;
  const code = error.code || '';
  if (['42P01', '42703', 'PGRST205', 'PGRST204'].includes(code)) return true;
  return /does not exist|schema cache|could not find/i.test(error.message || '');
}
async function fetchInstructors() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, hourly_rate')
    .in('role', ['admin', 'encargado'])
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data || [];
}
async function fetchShifts(from, to) {
  const { data, error } = await supabase
    .from('instructor_shifts')
    .select('*')
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data || [];
}
async function upsertShift(row) {
  if (row.id) {
    const id = row.id; const r = { ...row }; delete r.id;
    const { data, error } = await supabase.from('instructor_shifts').update(r).eq('id', id).select().single();
    if (error) throw error; return data;
  }
  const { data, error } = await supabase.from('instructor_shifts').insert(row).select().single();
  if (error) throw error; return data;
}
async function deleteShift(id) {
  const { error } = await supabase.from('instructor_shifts').delete().eq('id', id);
  if (error) throw error;
}
async function updateInstructorRate(id, rate) {
  const { error } = await supabase.from('profiles').update({ hourly_rate: rate }).eq('id', id);
  if (error) throw error;
}

/* ============================================================
   Render principal
   ============================================================ */
export async function renderControlHorario(container) {
  let currentDate = new Date(); currentDate.setHours(0, 0, 0, 0);
  let summaryPeriod = 'semana';           // 'dia' | 'semana' | 'mes'
  let instructors = [];                    // [{id, full_name, hourly_rate}]
  let byId = {};                           // id → instructor
  let colorOf = {};                        // id → color
  let shifts = [];                         // turnos del rango cargado

  function rateFor(id) {
    const r = byId[id]?.hourly_rate;
    return r != null ? Number(r) : null;
  }
  function nameFor(id) {
    return byId[id]?.full_name || 'Instructor';
  }

  async function render() {
    // Rango: cubre la semana visible y el mes completo (para el resumen mensual)
    const weekDates = getWeekDates(currentDate);
    const weekFrom = getDateStr(weekDates[0]);
    const weekTo = getDateStr(weekDates[6]);
    const y = currentDate.getFullYear(), mo = currentDate.getMonth();
    const monthFrom = getDateStr(new Date(y, mo, 1));
    const monthTo = getDateStr(new Date(y, mo + 1, 0));
    const from = minDateStr(weekFrom, monthFrom);
    const to = maxDateStr(weekTo, monthTo);

    try {
      [instructors, shifts] = await Promise.all([fetchInstructors(), fetchShifts(from, to)]);
    } catch (err) {
      if (isSchemaMissing(err)) {
        container.innerHTML = `<div class="admin-empty"><p><strong>Falta aplicar la migración de Control Horario.</strong><br>Ejecuta <code>supabase/migration-instructor-shifts.sql</code> en el SQL Editor de Supabase y recarga la página.</p></div>`;
      } else {
        container.innerHTML = `<div class="admin-empty"><p>Error al cargar: ${esc(err.message)}</p></div>`;
      }
      return;
    }
    byId = {}; colorOf = {};
    instructors.forEach((ins, i) => { byId[ins.id] = ins; colorOf[ins.id] = COLORS[i % COLORS.length]; });

    const todayStr = getDateStr(new Date());
    const rangeLabel = `${weekDates[0].getDate()} – ${weekDates[6].getDate()} ${MONTH_NAMES[weekDates[6].getMonth()]} ${weekDates[6].getFullYear()}`;

    // ---- Rejilla semanal ----
    const grid = weekDates.map((d, i) => {
      const ds = getDateStr(d);
      const dayShifts = shifts.filter(s => s.work_date === ds);
      const dayHours = dayShifts.reduce((a, s) => a + shiftHours(s), 0);
      const isToday = ds === todayStr;
      const blocks = dayShifts.map(s => {
        const c = colorOf[s.instructor_id] || '#0f2f39';
        return `
          <div class="ch-shift" data-id="${s.id}" style="border-left-color:${c}">
            <span class="ch-shift-time">${hm(s.start_time)}–${hm(s.end_time)}</span>
            <span class="ch-shift-name" style="color:${c}">${esc(nameFor(s.instructor_id))}</span>
            <span class="ch-shift-meta">${fmtHours(shiftHours(s))} · ${formatCurrency(shiftCost(s, rateFor(s.instructor_id)))}</span>
          </div>`;
      }).join('') || `<div class="ch-day-empty">—</div>`;
      return `
        <div class="ch-day ${isToday ? 'is-today' : ''}">
          <div class="ch-day-header" data-add-date="${ds}" title="Añadir horas">
            <span class="ch-day-name">${DAY_NAMES[i]}</span>
            <span class="ch-day-num">${d.getDate()}</span>
          </div>
          <div class="ch-day-body">${blocks}</div>
          <div class="ch-day-foot">${dayHours > 0 ? fmtHours(dayHours) : ''}</div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="ch-page">
        <div class="ch-topbar">
          <div class="ch-nav">
            <button class="ch-nav-arrow" id="ch-prev" title="Semana anterior">‹</button>
            <button class="ch-today-btn" id="ch-today">Hoy</button>
            <button class="ch-nav-arrow" id="ch-next" title="Semana siguiente">›</button>
          </div>
          <div class="ch-range">${rangeLabel}</div>
          <div class="ch-actions">
            ${isAdmin() ? '<button class="btn line" id="ch-rates">Tarifas</button>' : ''}
            <button class="btn red" id="ch-add">+ Añadir horas</button>
          </div>
        </div>

        ${instructors.length === 0 ? `<div class="admin-empty"><p>No hay instructores (staff). Crea encargados en la sección Equipo.</p></div>` : `
        <div class="ch-week-grid">${grid}</div>`}

        <div class="ch-summary">
          <div class="ch-summary-head">
            <h3 class="ch-summary-title">Pago a instructores</h3>
            <div class="ch-period-toggle">
              <button class="ch-period-btn ${summaryPeriod === 'dia' ? 'active' : ''}" data-period="dia">Día</button>
              <button class="ch-period-btn ${summaryPeriod === 'semana' ? 'active' : ''}" data-period="semana">Semana</button>
              <button class="ch-period-btn ${summaryPeriod === 'mes' ? 'active' : ''}" data-period="mes">Mes</button>
            </div>
          </div>
          ${renderSummary()}
        </div>
      </div>`;

    bindEvents();

    function renderSummary() {
      let from2, to2, label;
      if (summaryPeriod === 'dia') {
        from2 = to2 = getDateStr(currentDate);
        label = `Día <input type="date" id="ch-day-picker" class="ch-day-picker" value="${getDateStr(currentDate)}">`;
      } else if (summaryPeriod === 'mes') {
        from2 = monthFrom; to2 = monthTo;
        label = `${MONTH_NAMES[mo].charAt(0).toUpperCase() + MONTH_NAMES[mo].slice(1)} ${y}`;
      } else {
        from2 = weekFrom; to2 = weekTo;
        label = `Semana ${rangeLabel}`;
      }
      const inRange = shifts.filter(s => s.work_date >= from2 && s.work_date <= to2);
      // Agregado por instructor
      const agg = {};
      inRange.forEach(s => {
        const k = s.instructor_id;
        if (!agg[k]) agg[k] = { hours: 0, cost: 0 };
        agg[k].hours += shiftHours(s);
        agg[k].cost += shiftCost(s, rateFor(k));
      });
      const rows = Object.keys(agg)
        .sort((a, b) => nameFor(a).localeCompare(nameFor(b)))
        .map(k => {
          const c = colorOf[k] || '#0f2f39';
          const rate = rateFor(k);
          return `<tr>
            <td><span class="ch-dot" style="background:${c}"></span>${esc(nameFor(k))}</td>
            <td>${fmtHours(agg[k].hours)}</td>
            <td>${rate != null ? formatCurrency(rate) + '/h' : '<span class="ch-norate">sin tarifa</span>'}</td>
            <td class="ch-total-cell">${formatCurrency(agg[k].cost)}</td>
          </tr>`;
        }).join('');
      const totalHours = inRange.reduce((a, s) => a + shiftHours(s), 0);
      const totalCost = inRange.reduce((a, s) => a + shiftCost(s, rateFor(s.instructor_id)), 0);

      if (!rows) {
        return `<p class="ch-period-label">${label}</p>
          <div class="admin-empty"><p>Sin horas anotadas en este periodo.</p></div>`;
      }
      return `<p class="ch-period-label">${label}</p>
        <div class="table-wrap"><table class="ch-summary-table">
          <thead><tr><th>Instructor</th><th>Horas</th><th>Tarifa</th><th>A pagar</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr>
            <td><strong>Total</strong></td>
            <td><strong>${fmtHours(totalHours)}</strong></td>
            <td></td>
            <td class="ch-total-cell"><strong>${formatCurrency(totalCost)}</strong></td>
          </tr></tfoot>
        </table></div>`;
    }
  }

  /* ---- Eventos ---- */
  function bindEvents() {
    container.querySelector('#ch-prev')?.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() - 7); render();
    });
    container.querySelector('#ch-next')?.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() + 7); render();
    });
    container.querySelector('#ch-today')?.addEventListener('click', () => {
      currentDate = new Date(); currentDate.setHours(0, 0, 0, 0); render();
    });
    container.querySelector('#ch-add')?.addEventListener('click', () => openShiftModal(null, null));
    container.querySelector('#ch-rates')?.addEventListener('click', openRatesModal);

    container.querySelectorAll('.ch-period-btn').forEach(b =>
      b.addEventListener('click', () => { summaryPeriod = b.dataset.period; render(); }));

    container.querySelector('#ch-day-picker')?.addEventListener('change', (e) => {
      if (e.target.value) { currentDate = new Date(e.target.value + 'T00:00:00'); render(); }
    });

    container.querySelectorAll('.ch-day-header').forEach(h =>
      h.addEventListener('click', () => openShiftModal(null, h.dataset.addDate)));

    container.querySelectorAll('.ch-shift').forEach(el =>
      el.addEventListener('click', () => {
        const s = shifts.find(x => x.id === el.dataset.id);
        if (s) openShiftModal(s, null);
      }));
  }

  /* ---- Modal alta/edición de horas ---- */
  function openShiftModal(shift, prefillDate) {
    if (!instructors.length) { showToast('No hay instructores. Crea encargados en Equipo.', 'error'); return; }
    const isNew = !shift;
    const s = shift || {};
    const insOptions = instructors.map(ins =>
      `<option value="${ins.id}" data-rate="${ins.hourly_rate ?? ''}" ${s.instructor_id === ins.id ? 'selected' : ''}>${esc(ins.full_name || 'Instructor')}</option>`
    ).join('');
    const defaultRate = s.hourly_rate != null ? s.hourly_rate
      : (isNew && instructors[0] ? (instructors[0].hourly_rate ?? '') : (rateFor(s.instructor_id) ?? ''));

    openModal(isNew ? 'Añadir horas' : 'Editar horas', `
      <form id="ch-form" class="ch-form">
        <div class="act-form-field">
          <label class="act-form-label">INSTRUCTOR</label>
          <select class="act-form-input" id="ch-f-instructor" required>${insOptions}</select>
        </div>
        <div class="ch-form-row">
          <div class="act-form-field">
            <label class="act-form-label">FECHA</label>
            <input type="date" class="act-form-input" id="ch-f-date" value="${s.work_date || prefillDate || getDateStr(new Date())}" required>
          </div>
          <div class="act-form-field">
            <label class="act-form-label">TARIFA €/H</label>
            <input type="number" min="0" step="0.5" class="act-form-input" id="ch-f-rate" value="${defaultRate}" placeholder="0" ${isAdmin() ? '' : 'readonly'}>
            ${isAdmin() ? '' : '<span class="ch-field-note">La tarifa la fija el admin</span>'}
          </div>
        </div>
        <div class="ch-form-row">
          <div class="act-form-field">
            <label class="act-form-label">ENTRADA</label>
            <input type="time" class="act-form-input" id="ch-f-start" value="${hm(s.start_time)}" required>
          </div>
          <div class="act-form-field">
            <label class="act-form-label">SALIDA</label>
            <input type="time" class="act-form-input" id="ch-f-end" value="${hm(s.end_time)}" required>
          </div>
        </div>
        <div class="act-form-field">
          <label class="act-form-label">NOTAS (opcional)</label>
          <input type="text" class="act-form-input" id="ch-f-notes" value="${esc(s.notes)}" placeholder="Ej. clase grupal, sustitución…">
        </div>
        <div class="ch-preview" id="ch-preview">—</div>
        <div class="ch-form-actions">
          ${!isNew ? `<button type="button" class="btn line" id="ch-del" style="margin-right:auto;color:#b91c1c;border-color:#fecaca">Eliminar</button>` : ''}
          <button type="button" class="btn line" id="ch-cancel">Cancelar</button>
          <button type="submit" class="btn red" id="ch-save">${isNew ? 'Añadir' : 'Guardar'}</button>
        </div>
      </form>`);

    const $ = (id) => document.getElementById(id);
    const updatePreview = () => {
      const tmp = { start_time: $('ch-f-start').value, end_time: $('ch-f-end').value, hourly_rate: $('ch-f-rate').value || null };
      const h = shiftHours(tmp);
      const prev = $('ch-preview');
      if (h <= 0) { prev.textContent = 'Indica entrada y salida válidas'; prev.classList.add('warn'); return; }
      prev.classList.remove('warn');
      prev.innerHTML = `<strong>${fmtHours(h)}</strong> · ${formatCurrency(shiftCost(tmp, 0))}`;
    };
    ['ch-f-start', 'ch-f-end', 'ch-f-rate'].forEach(id => {
      $(id).addEventListener('input', updatePreview);
      $(id).addEventListener('change', updatePreview);
    });
    // Al cambiar de instructor, la tarifa se sincroniza con la suya por defecto
    // (si quieres una tarifa puntual distinta, ajústala después de elegir instructor).
    $('ch-f-instructor').addEventListener('change', (e) => {
      const r = e.target.selectedOptions[0]?.dataset.rate;
      $('ch-f-rate').value = (r == null || r === '') ? '' : r;
      updatePreview();
    });
    updatePreview();

    $('ch-cancel').addEventListener('click', closeModal);
    $('ch-del')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar estas horas? No se puede deshacer.')) return;
      try { await deleteShift(s.id); closeModal(); showToast('Horas eliminadas', 'success'); await render(); }
      catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
    $('ch-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const instructor_id = $('ch-f-instructor').value;
      const work_date = $('ch-f-date').value;
      const start_time = $('ch-f-start').value;
      const end_time = $('ch-f-end').value;
      const rateVal = $('ch-f-rate').value;
      if (!instructor_id) { showToast('Elige un instructor', 'error'); return; }
      if (!work_date || !start_time || !end_time) { showToast('Faltan fecha u horas', 'error'); return; }
      if (parseHM(end_time) <= parseHM(start_time)) { showToast('La salida debe ser posterior a la entrada', 'error'); return; }
      const obj = {
        instructor_id, work_date, start_time, end_time,
        hourly_rate: rateVal === '' ? null : Number(rateVal),
        notes: $('ch-f-notes').value.trim() || null,
      };
      if (s.id) obj.id = s.id;
      const btn = $('ch-save'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await upsertShift(obj);
        closeModal();
        showToast(isNew ? 'Horas añadidas' : 'Horas guardadas', 'success');
        await render();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        btn.disabled = false; btn.textContent = isNew ? 'Añadir' : 'Guardar';
      }
    });
  }

  /* ---- Modal tarifas por instructor ---- */
  function openRatesModal() {
    if (!instructors.length) { showToast('No hay instructores', 'error'); return; }
    const rows = instructors.map(ins => `
      <div class="ch-rate-row">
        <span class="ch-dot" style="background:${colorOf[ins.id] || '#0f2f39'}"></span>
        <span class="ch-rate-name">${esc(ins.full_name || 'Instructor')}</span>
        <div class="ch-rate-input">
          <input type="number" min="0" step="0.5" class="act-form-input" data-id="${ins.id}" value="${ins.hourly_rate ?? ''}" placeholder="0">
          <span>€/h</span>
        </div>
      </div>`).join('');
    openModal('Tarifas por hora', `
      <p class="ch-rates-hint">Tarifa por defecto de cada instructor. Las horas que ya tengas anotadas conservan la tarifa con la que se guardaron.</p>
      <div class="ch-rates-list">${rows}</div>
      <div class="ch-form-actions">
        <button type="button" class="btn line" id="ch-rates-cancel">Cancelar</button>
        <button type="button" class="btn red" id="ch-rates-save">Guardar tarifas</button>
      </div>`);

    document.getElementById('ch-rates-cancel').addEventListener('click', closeModal);
    document.getElementById('ch-rates-save').addEventListener('click', async () => {
      const inputs = [...document.querySelectorAll('.ch-rate-input input[data-id]')];
      const btn = document.getElementById('ch-rates-save'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        for (const inp of inputs) {
          const id = inp.dataset.id;
          const newVal = inp.value === '' ? null : Number(inp.value);
          const oldVal = byId[id]?.hourly_rate ?? null;
          // Compara tratando null ('sin tarifa') y 0 como distintos
          const a = oldVal == null ? '' : String(Number(oldVal));
          const b = newVal == null ? '' : String(Number(newVal));
          if (a !== b) await updateInstructorRate(id, newVal);
        }
        closeModal();
        showToast('Tarifas guardadas', 'success');
        await render();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        btn.disabled = false; btn.textContent = 'Guardar tarifas';
      }
    });
  }

  await render();
}
