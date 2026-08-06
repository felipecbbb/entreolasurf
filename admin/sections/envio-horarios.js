/* ============================================================
   Envío de horarios — pestaña dentro de Control Horario
   ------------------------------------------------------------
   · Se elige un rango de fechas. Por cada día del rango se van añadiendo
     empleados con su franja horaria (ambos desplegables).
   · El panel compone el mensaje, lo guarda como envío y abre WhatsApp para
     que el usuario elija el grupo de trabajadores.
   Acceso: admin + cuentas con profiles.can_send_schedules (hoy, Nico).
   ============================================================ */
import { openModal, closeModal, showToast, formatDateTime } from '../modules/ui.js';
import { getProfile } from '../modules/auth.js';
import { supabase } from '/lib/supabase.js';

const esc = (s) => s == null ? '' : String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function getDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDateStr(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function eachDay(from, to) {
  const out = [];
  const a = parseDateStr(from), b = parseDateStr(to);
  if (b < a) return out;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) out.push(getDateStr(d));
  return out;
}
function longLabel(ds) {
  const d = parseDateStr(ds);
  return `${DAY_LONG[d.getDay()]} ${d.getDate()} de ${MONTH_LONG[d.getMonth()]}`;
}

function isSchemaMissing(error) {
  if (!error) return false;
  if (['42P01', '42703', 'PGRST205', 'PGRST204'].includes(error.code || '')) return true;
  return /does not exist|schema cache|could not find/i.test(error.message || '');
}

/* ---- API ---- */
async function fetchMonitors() {
  const { data, error } = await supabase.from('monitors')
    .select('id, name, active').eq('active', true)
    .order('sort_order', { ascending: true }).order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}
async function fetchShiftTemplates() {
  const { data, error } = await supabase.from('work_shift_templates')
    .select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}
async function fetchSends() {
  const { data, error } = await supabase.from('schedule_sends')
    .select('*').order('sent_at', { ascending: false }).limit(20);
  if (error) throw error;
  return data || [];
}
// Guarda el envío + su detalle. Si el detalle falla, borramos la cabecera para
// no dejar un envío vacío en el histórico.
async function saveSend({ from, to, message, rows }) {
  const { data, error } = await supabase.from('schedule_sends').insert({
    date_from: from, date_to: to, message, sent_by: getProfile()?.id || null,
  }).select('id').single();
  if (error) throw error;
  const items = rows.map(r => ({
    send_id: data.id, monitor_id: r.monitor_id, monitor_name: r.name,
    work_date: r.date, shift_label: r.shift,
  }));
  const { error: e2 } = await supabase.from('schedule_send_items').insert(items);
  if (e2) {
    await supabase.from('schedule_sends').delete().eq('id', data.id);
    throw e2;
  }
  return data.id;
}

/* ============================================================ */
export async function renderEnvioHorarios(container) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

  let from = getDateStr(tomorrow), to = getDateStr(tomorrow);
  let monitors = [], templates = [];
  // { 'YYYY-MM-DD': [{ monitor_id, name, shift }] }
  let assign = {};

  function buildMessage() {
    const days = eachDay(from, to).filter(d => (assign[d] || []).length);
    if (!days.length) return '';
    const head = from === to
      ? `*HORARIO · ${longLabel(from)}*`
      : `*HORARIOS · ${longLabel(from)} → ${longLabel(to)}*`;
    const body = days.map(d => {
      const lines = assign[d].map(a => `• ${a.name}: ${a.shift}`).join('\n');
      return from === to ? lines : `\n*${longLabel(d)}*\n${lines}`;
    }).join('\n');
    return `${head}\n${body}`;
  }

  function flatRows() {
    return eachDay(from, to).flatMap(d => (assign[d] || []).map(a => ({ ...a, date: d })));
  }

  async function load() {
    try {
      [monitors, templates] = await Promise.all([fetchMonitors(), fetchShiftTemplates()]);
      return true;
    } catch (err) {
      container.innerHTML = isSchemaMissing(err)
        ? `<div class="admin-empty"><p><strong>Falta aplicar la migración de envío de horarios.</strong><br>Ejecuta <code>supabase/migration-envio-horarios.sql</code> en el SQL Editor de Supabase y recarga la página.</p></div>`
        : `<div class="admin-empty"><p>Error al cargar: ${esc(err.message)}</p></div>`;
      return false;
    }
  }

  function render() {
    const days = eachDay(from, to);
    const activeTpl = templates.filter(t => t.active);
    const msg = buildMessage();
    const total = flatRows().length;

    const rangoInvalido = days.length === 0;

    const dayBlocks = days.map(d => {
      const rows = assign[d] || [];
      const usados = new Set(rows.map(r => r.monitor_id));
      const libres = monitors.filter(m => !usados.has(m.id));
      return `
        <div class="sh-day" data-date="${d}">
          <div class="sh-day-head">
            <h3>${longLabel(d)}</h3>
            <span class="sh-day-count">${rows.length ? `${rows.length} asignado${rows.length > 1 ? 's' : ''}` : 'sin asignar'}</span>
          </div>
          ${rows.length ? `<ul class="sh-list">${rows.map((r, i) => `
            <li class="sh-item">
              <span class="sh-item-name">${esc(r.name)}</span>
              <span class="sh-item-shift">${esc(r.shift)}</span>
              <button class="sh-del" data-date="${d}" data-i="${i}" title="Quitar">×</button>
            </li>`).join('')}</ul>` : ''}
          ${libres.length ? `
          <div class="sh-add">
            <select class="sh-mon" data-date="${d}">
              ${libres.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
            </select>
            <select class="sh-tpl" data-date="${d}">
              ${activeTpl.map(t => `<option value="${esc(t.label)}">${esc(t.label)}</option>`).join('')}
            </select>
            <button class="btn line sh-add-btn" data-date="${d}">Añadir</button>
          </div>` : `<p class="sh-all-done">Todos los monitores tienen horario este día.</p>`}
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="sh-page">
        <div class="ch-topbar sh-topbar">
          <div class="sh-range">
            <label class="sh-field"><span>Desde</span><input type="date" id="sh-from" value="${from}"></label>
            <label class="sh-field"><span>Hasta</span><input type="date" id="sh-to" value="${to}"></label>
          </div>
          <div class="ch-actions">
            <button class="btn line" id="sh-templates">Franjas horarias</button>
            <button class="btn line" id="sh-history">Ver enviados</button>
          </div>
        </div>

        ${rangoInvalido
          ? `<div class="admin-empty"><p>El "hasta" es anterior al "desde". Corrige el rango.</p></div>`
          : (!activeTpl.length
            ? `<div class="admin-empty"><p>No hay franjas horarias. Pulsa "Franjas horarias" para crearlas.</p></div>`
            : (!monitors.length
              ? `<div class="admin-empty"><p>No hay monitores activos. Añádelos en la pestaña "Rejilla de horas".</p></div>`
              : `<div class="sh-days">${dayBlocks}</div>`))}

        ${total ? `
        <div class="sh-preview">
          <div class="sh-preview-head">Vista previa del mensaje</div>
          <pre class="sh-preview-body">${esc(msg)}</pre>
        </div>` : ''}

        <div class="sh-send-bar">
          <span class="sh-send-info">${total ? `${total} horario${total > 1 ? 's' : ''} en ${eachDay(from, to).filter(d => (assign[d] || []).length).length} día(s)` : 'Añade al menos un horario para poder enviar'}</span>
          <a class="btn red sh-send ${total ? '' : 'is-disabled'}" id="sh-send"
             href="${total ? `https://wa.me/?text=${encodeURIComponent(msg)}` : '#'}"
             target="_blank" rel="noopener">Enviar horario por WhatsApp</a>
        </div>
        <p class="sh-hint">WhatsApp se abre con el mensaje escrito: ahí eliges el grupo de trabajadores y le das a enviar. El envío queda registrado en "Ver enviados".</p>
      </div>`;

    bind();
  }

  function bind() {
    container.querySelector('#sh-from')?.addEventListener('change', e => {
      from = e.target.value || from;
      // Si el rango se estrecha, los días fuera dejan de contar (pero no se
      // borran: si vuelve a ampliarlo, sus asignaciones siguen ahí).
      if (parseDateStr(to) < parseDateStr(from)) to = from;
      render();
    });
    container.querySelector('#sh-to')?.addEventListener('change', e => {
      to = e.target.value || to; render();
    });

    container.querySelectorAll('.sh-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.date;
        const mSel = container.querySelector(`.sh-mon[data-date="${d}"]`);
        const tSel = container.querySelector(`.sh-tpl[data-date="${d}"]`);
        if (!mSel || !tSel || !mSel.value) return;
        const mon = monitors.find(m => m.id === mSel.value);
        if (!mon) return;
        (assign[d] ||= []).push({ monitor_id: mon.id, name: mon.name, shift: tSel.value });
        render();
      });
    });

    container.querySelectorAll('.sh-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.date;
        assign[d].splice(Number(btn.dataset.i), 1);
        if (!assign[d].length) delete assign[d];
        render();
      });
    });

    container.querySelector('#sh-templates')?.addEventListener('click', openTemplatesModal);
    container.querySelector('#sh-history')?.addEventListener('click', openHistoryModal);

    // El enlace navega solo (nada de window.open tras un await: lo bloquearía
    // el navegador). El registro se guarda en paralelo.
    container.querySelector('#sh-send')?.addEventListener('click', async (e) => {
      const rows = flatRows();
      if (!rows.length) { e.preventDefault(); return; }
      try {
        await saveSend({ from, to, message: buildMessage(), rows });
        showToast('Horario registrado. Elige el grupo en WhatsApp.', 'success');
      } catch (err) {
        showToast('WhatsApp se abrió, pero no se pudo registrar el envío: ' + err.message, 'error');
      }
    });
  }

  /* ---- Modal: franjas horarias ---- */
  function openTemplatesModal() {
    const rows = templates.map(t => `
      <div class="mon-row" data-id="${t.id}">
        <input type="text" class="act-form-input sh-t-label" value="${esc(t.label)}" placeholder="09:00 - 14:00" style="flex:2">
        <label style="display:flex;align-items:center;gap:4px;font-size:.8rem"><input type="checkbox" class="sh-t-active" ${t.active ? 'checked' : ''}>Activa</label>
        <button type="button" class="cp-action-btn sh-t-del" data-id="${t.id}" title="Eliminar">×</button>
      </div>`).join('');
    openModal('Franjas horarias', `
      <p class="ch-rates-hint">Las opciones del desplegable de horario. Puede ser una franja ("09:00 - 14:00") o una etiqueta ("Mañana carpa", "Libre").</p>
      <div class="mon-rows-list">${rows || '<p class="dash-empty">Todavía no hay ninguna.</p>'}</div>
      <div class="mon-row" style="margin-top:8px;border-top:1px dashed #e2e8f0;padding-top:10px">
        <input type="text" class="act-form-input" id="sh-t-new" placeholder="Nueva franja…" style="flex:2">
        <button type="button" class="btn line" id="sh-t-add">Añadir</button>
      </div>
      <div class="ch-form-actions">
        <button type="button" class="btn line" id="sh-t-cancel">Cerrar</button>
        <button type="button" class="btn red" id="sh-t-save">Guardar cambios</button>
      </div>`);

    document.getElementById('sh-t-add').addEventListener('click', async () => {
      const label = document.getElementById('sh-t-new').value.trim();
      if (!label) { showToast('Escribe la franja', 'error'); return; }
      try {
        await supabase.from('work_shift_templates').insert({ label, sort_order: templates.length });
        templates = await fetchShiftTemplates();
        showToast('Franja añadida', 'success'); closeModal(); render(); openTemplatesModal();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
    document.querySelectorAll('.sh-t-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta franja?')) return;
        try {
          await supabase.from('work_shift_templates').delete().eq('id', btn.dataset.id);
          templates = await fetchShiftTemplates();
          showToast('Franja eliminada', 'success'); closeModal(); render(); openTemplatesModal();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      });
    });
    document.getElementById('sh-t-cancel').addEventListener('click', closeModal);
    document.getElementById('sh-t-save').addEventListener('click', async () => {
      const btn = document.getElementById('sh-t-save'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        for (const row of document.querySelectorAll('.mon-row[data-id]')) {
          await supabase.from('work_shift_templates').update({
            label: row.querySelector('.sh-t-label').value.trim(),
            active: row.querySelector('.sh-t-active').checked,
          }).eq('id', row.dataset.id);
        }
        templates = await fetchShiftTemplates();
        showToast('Franjas guardadas', 'success'); closeModal(); render();
      } catch (err) { showToast('Error: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    });
  }

  /* ---- Modal: histórico de envíos ---- */
  async function openHistoryModal() {
    openModal('Horarios enviados', '<p class="dash-empty">Cargando…</p>');
    let sends = [];
    try { sends = await fetchSends(); }
    catch (err) {
      document.getElementById('modal-body').innerHTML = `<p class="dash-empty">Error: ${esc(err.message)}</p>`;
      return;
    }
    document.getElementById('modal-body').innerHTML = sends.length ? `
      <div class="sh-history">
        ${sends.map(s => `
          <details class="sh-hist-item">
            <summary>
              <strong>${s.date_from === s.date_to ? longLabel(s.date_from) : `${longLabel(s.date_from)} → ${longLabel(s.date_to)}`}</strong>
              <span class="sh-hist-when">${formatDateTime(s.sent_at)}</span>
            </summary>
            <pre class="sh-preview-body">${esc(s.message)}</pre>
          </details>`).join('')}
      </div>` : '<p class="dash-empty">Todavía no has enviado ningún horario.</p>';
  }

  if (await load()) render();
}
