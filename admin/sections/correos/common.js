/* ============================================================
   Correos — piezas comunes de las pestañas
   · api(): llamadas a la Edge Function email-campaign (solo admin)
   · blockEditor(): editor de bloques (título, texto, imagen, botón, separador)
   · segmentBuilder(): filtros de destinatarios con recuento en directo
   · previewFrame(): vista previa real (el HTML lo genera el servidor)
   Compatible con el Safari antiguo del iPad: sin requestSubmit, randomUUID
   ni structuredClone.
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { fetchProfiles, matchProfile } from '../../modules/api.js';

export const esc = (s) => s == null ? '' : String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function isSchemaMissing(error) {
  if (!error) return false;
  if (['42P01', '42703', 'PGRST205', 'PGRST204', '42883'].includes(error.code || '')) return true;
  return /does not exist|schema cache|could not find/i.test(error.message || '');
}

export const MIGRATION_MSG = `<div class="admin-empty"><p><strong>Falta aplicar la migración de correos.</strong><br>
  Ejecuta <code>supabase/migration-correos.sql</code> en el SQL Editor de Supabase y recarga la página.</p></div>`;

export const clone = (x) => JSON.parse(JSON.stringify(x));

export function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* Llama a email-campaign. Lanza Error con el mensaje del servidor. */
export async function api(action, body = {}) {
  const { data, error } = await supabase.functions.invoke('email-campaign', { body: { action, ...body } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const VARIABLES = [
  ['{nombre}', 'Nombre'],
  ['{nombre_completo}', 'Nombre y apellidos'],
  ['{email}', 'Email'],
  ['{clases_restantes}', 'Clases que le quedan en el bono'],
  ['{tipo_bono}', 'Tipo de bono'],
  ['{caducidad_bono}', 'Fecha de caducidad del bono'],
];

export const STATUS = {
  draft: ['Borrador', '#f1f5f9', '#475569'],
  scheduled: ['Programada', '#e0f2fe', '#0369a1'],
  sending: ['Enviando…', '#fef3c7', '#92400e'],
  sent: ['Enviada', '#dcfce7', '#15803d'],
  failed: ['Fallida', '#fee2e2', '#b91c1c'],
  queued: ['En cola', '#f1f5f9', '#475569'],
  delivered: ['Entregado', '#dcfce7', '#15803d'],
  opened: ['Abierto', '#dbeafe', '#1d4ed8'],
  clicked: ['Clic', '#ede9fe', '#6d28d9'],
  bounced: ['Rebotado', '#fee2e2', '#b91c1c'],
};
export const badge = (st) => {
  const [txt, bg, fg] = STATUS[st] || [st, '#f1f5f9', '#475569'];
  return `<span class="admin-badge" style="--badge-bg:${bg};--badge-color:${fg}">${esc(txt)}</span>`;
};

/* ---------- Vista previa ---------- */
export function previewFrame(el) {
  el.innerHTML = `<div class="co-preview">
    <div class="co-preview-subject" data-subject></div>
    <iframe class="co-preview-frame" title="Vista previa del correo"></iframe>
    <div class="co-preview-state" data-state>Escribe algo para ver la vista previa…</div>
  </div>`;
  const frame = el.querySelector('iframe');
  const subj = el.querySelector('[data-subject]');
  const state = el.querySelector('[data-state]');
  let seq = 0;
  const refresh = debounce(async (draft) => {
    const my = ++seq;
    state.textContent = 'Actualizando…';
    state.hidden = false;
    try {
      const r = await api('preview', { blocks: draft.blocks, subject: draft.subject, preheader: draft.preheader });
      if (my !== seq) return;
      subj.innerHTML = `<span>Asunto:</span> ${esc(r.subject || '(sin asunto)')}`;
      frame.srcdoc = r.html;
      state.hidden = true;
    } catch (e) {
      if (my === seq) state.textContent = 'No se pudo generar la vista previa: ' + e.message;
    }
  }, 700);
  return { refresh };
}

/* ---------- Editor de bloques ---------- */
const BLOCK_TYPES = {
  heading: 'Título',
  text: 'Texto',
  image: 'Imagen',
  button: 'Botón',
  divider: 'Separador',
};
const NEW_BLOCK = {
  heading: () => ({ type: 'heading', text: '' }),
  text: () => ({ type: 'text', text: '' }),
  image: () => ({ type: 'image', url: '', alt: '' }),
  button: () => ({ type: 'button', text: 'RESERVAR', url: 'https://entreolasurf.com/mi-cuenta/' }),
  divider: () => ({ type: 'divider' }),
};

/* draft = { subject, preheader, blocks }; onChange se llama en cada cambio. */
export function blockEditor(el, draft, onChange) {
  el.innerHTML = `
    <label class="act-form-field"><span class="act-form-label">Asunto</span>
      <input class="act-form-input" data-f="subject" value="${esc(draft.subject)}" placeholder="Novedades en Entre Olas, {nombre}"></label>
    <label class="act-form-field"><span class="act-form-label">Texto de vista previa <small>(lo que se ve junto al asunto en la bandeja)</small></span>
      <input class="act-form-input" data-f="preheader" value="${esc(draft.preheader || '')}" placeholder="Opcional"></label>
    <div class="co-blocks" data-blocks></div>
    <div class="co-add">
      <span>Añadir:</span>
      ${Object.entries(BLOCK_TYPES).map(([k, v]) => `<button type="button" class="btn line co-add-btn" data-add="${k}">+ ${v}</button>`).join('')}
    </div>
    <details class="co-vars"><summary>Variables para personalizar</summary>
      <p>Escríbelas tal cual en el asunto o en cualquier texto; se cambian por los datos de cada cliente.</p>
      <ul>${VARIABLES.map(([k, v]) => `<li><code>${k}</code> ${esc(v)}</li>`).join('')}</ul>
      <p>En los textos: <code>**negrita**</code> y enlaces con <code>[texto](https://…)</code>.</p>
    </details>`;

  el.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('input', () => {
    draft[inp.dataset.f] = inp.value; onChange();
  }));
  el.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
    draft.blocks.push(NEW_BLOCK[b.dataset.add]()); paintBlocks(); onChange();
  }));

  const list = el.querySelector('[data-blocks]');
  function paintBlocks() {
    list.innerHTML = draft.blocks.length ? draft.blocks.map((b, i) => `
      <div class="co-block" data-i="${i}">
        <div class="co-block-head">
          <strong>${BLOCK_TYPES[b.type] || b.type}</strong>
          <span class="co-block-tools">
            <button type="button" data-mv="-1" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
            <button type="button" data-mv="1" ${i === draft.blocks.length - 1 ? 'disabled' : ''} title="Bajar">↓</button>
            <button type="button" data-rm title="Quitar">&times;</button>
          </span>
        </div>
        ${b.type === 'heading' ? `<input class="act-form-input" data-k="text" value="${esc(b.text)}" placeholder="¡Hola, {nombre}!">` : ''}
        ${b.type === 'text' ? `<textarea class="act-form-input" rows="4" data-k="text" placeholder="Escribe el texto…">${esc(b.text)}</textarea>` : ''}
        ${b.type === 'image' ? `<input class="act-form-input" data-k="url" value="${esc(b.url)}" placeholder="https://… (URL de la imagen)">
                                <input class="act-form-input" data-k="alt" value="${esc(b.alt || '')}" placeholder="Descripción (opcional)">` : ''}
        ${b.type === 'button' ? `<div class="co-row"><input class="act-form-input" data-k="text" value="${esc(b.text)}" placeholder="Texto del botón">
                                 <input class="act-form-input" data-k="url" value="${esc(b.url)}" placeholder="https://…"></div>` : ''}
      </div>`).join('') : `<p class="co-hint">El correo está vacío: añade un título y un texto.</p>`;

    list.querySelectorAll('.co-block').forEach(row => {
      const i = Number(row.dataset.i);
      row.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('input', () => {
        draft.blocks[i][inp.dataset.k] = inp.value; onChange();
      }));
      row.querySelector('[data-rm]').addEventListener('click', () => {
        draft.blocks.splice(i, 1); paintBlocks(); onChange();
      });
      row.querySelectorAll('[data-mv]').forEach(btn => btn.addEventListener('click', () => {
        const j = i + Number(btn.dataset.mv);
        const tmp = draft.blocks[i]; draft.blocks[i] = draft.blocks[j]; draft.blocks[j] = tmp;
        paintBlocks(); onChange();
      }));
    });
  }
  paintBlocks();
}

/* ---------- Destinatarios ---------- */
const ACT_TYPES = [['grupal', 'Surf en grupo'], ['individual', 'Surf individual'], ['paddle', 'Paddle surf'], ['yoga', 'Yoga'], ['surfskate', 'Surfskate']];

/* segment se modifica en sitio. onCount(n) tras cada recuento. */
export function segmentBuilder(el, segment, onCount) {
  const manual = Array.isArray(segment.ids);
  el.innerHTML = `
    <div class="co-seg-mode">
      <label><input type="radio" name="co-mode" value="filtros" ${manual ? '' : 'checked'}> Por filtros</label>
      <label><input type="radio" name="co-mode" value="manual" ${manual ? 'checked' : ''}> Elegir clientes a mano</label>
    </div>
    <div data-filtros ${manual ? 'hidden' : ''}>
      <p class="co-hint">Sin ningún filtro se envía a <strong>todos los clientes</strong> (nunca a quien se haya dado de baja). Si marcas varios, se tienen que cumplir todos.</p>
      <div class="co-seg-grid">
        <label class="co-check"><input type="checkbox" data-b="bono_activo" ${segment.bono_activo ? 'checked' : ''}> Con bono activo y clases sin usar</label>
        <label class="co-check"><input type="checkbox" data-b="camp" ${segment.camp ? 'checked' : ''}> Ha reservado algún Surf Camp</label>
        <label class="co-check"><input type="checkbox" data-b="tienda" ${segment.tienda ? 'checked' : ''}> Ha comprado en la tienda</label>
      </div>
      <div class="co-seg-line"><span class="act-form-label">Ha hecho alguna de estas actividades</span>
        <div class="co-chips">${ACT_TYPES.map(([k, v]) => `<label class="co-chip"><input type="checkbox" data-t="${k}" ${(segment.class_types || []).includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div>
      </div>
      <div class="co-row">
        <label class="act-form-field"><span class="act-form-label">Sin actividad desde hace (meses)</span>
          <input type="number" min="1" class="act-form-input" data-n="inactive_months" value="${esc(segment.inactive_months || '')}" placeholder="—"></label>
        <label class="act-form-field"><span class="act-form-label">Alta desde</span>
          <input type="date" class="act-form-input" data-d="signup_from" value="${esc(segment.signup_from || '')}"></label>
        <label class="act-form-field"><span class="act-form-label">Alta hasta</span>
          <input type="date" class="act-form-input" data-d="signup_to" value="${esc(segment.signup_to || '')}"></label>
      </div>
    </div>
    <div data-manual ${manual ? '' : 'hidden'}>
      <input type="search" class="act-form-input" data-search placeholder="Buscar cliente por nombre, email o teléfono…">
      <div class="co-suggest" data-suggest></div>
      <div class="co-chips" data-picked></div>
    </div>
    <div class="co-count" data-count>Calculando destinatarios…</div>`;

  const countEl = el.querySelector('[data-count]');
  let names = {}; // id → nombre, para los chips de selección manual
  let seq = 0;

  const recount = debounce(async () => {
    const my = ++seq;
    countEl.textContent = 'Calculando destinatarios…';
    try {
      const r = await api('count', { segment });
      if (my !== seq) return;
      countEl.innerHTML = `<strong>${r.count}</strong> destinatario${r.count === 1 ? '' : 's'}
        ${r.count ? `<details><summary>Ver lista</summary><ul>${r.sample.map(p =>
          `<li>${esc([p.full_name, p.last_name].filter(Boolean).join(' ') || '—')} · ${esc(p.email)}</li>`).join('')}
          ${r.count > r.sample.length ? `<li>… y ${r.count - r.sample.length} más</li>` : ''}</ul></details>` : ''}`;
      onCount && onCount(r.count);
    } catch (e) {
      if (my === seq) countEl.textContent = 'No se pudo calcular: ' + e.message;
      onCount && onCount(null);
    }
  }, 500);

  el.querySelectorAll('input[name="co-mode"]').forEach(r => r.addEventListener('change', () => {
    const isManual = r.value === 'manual' && r.checked;
    el.querySelector('[data-filtros]').hidden = isManual;
    el.querySelector('[data-manual]').hidden = !isManual;
    Object.keys(segment).forEach(k => delete segment[k]);
    if (isManual) segment.ids = [];
    paintPicked(); recount();
  }));
  el.querySelectorAll('[data-b]').forEach(c => c.addEventListener('change', () => {
    if (c.checked) segment[c.dataset.b] = true; else delete segment[c.dataset.b];
    recount();
  }));
  el.querySelectorAll('[data-t]').forEach(c => c.addEventListener('change', () => {
    const set = new Set(segment.class_types || []);
    if (c.checked) set.add(c.dataset.t); else set.delete(c.dataset.t);
    if (set.size) segment.class_types = Array.from(set); else delete segment.class_types;
    recount();
  }));
  el.querySelectorAll('[data-n]').forEach(inp => inp.addEventListener('input', () => {
    const n = parseInt(inp.value, 10);
    if (n > 0) segment[inp.dataset.n] = n; else delete segment[inp.dataset.n];
    recount();
  }));
  el.querySelectorAll('[data-d]').forEach(inp => inp.addEventListener('change', () => {
    if (inp.value) segment[inp.dataset.d] = inp.value; else delete segment[inp.dataset.d];
    recount();
  }));

  // Selección manual: búsqueda en memoria con el mismo criterio que Clientes
  const search = el.querySelector('[data-search]');
  const sug = el.querySelector('[data-suggest]');
  const picked = el.querySelector('[data-picked]');
  let profiles = null;
  const nameOf = (p) => [p.full_name, p.last_name].filter(Boolean).join(' ') || p.email || '—';

  function paintPicked() {
    const ids = segment.ids || [];
    picked.innerHTML = ids.map(id => `<span class="co-chip is-on">${esc(names[id] || 'Cliente')}
      <button type="button" data-unpick="${id}" title="Quitar">&times;</button></span>`).join('');
    picked.querySelectorAll('[data-unpick]').forEach(b => b.addEventListener('click', () => {
      segment.ids = segment.ids.filter(x => x !== b.dataset.unpick); paintPicked(); recount();
    }));
  }
  search.addEventListener('input', async () => {
    const term = search.value.trim();
    if (term.length < 2) { sug.innerHTML = ''; return; }
    if (!profiles) {
      try { profiles = (await fetchProfiles()).filter(p => (p.role || 'client') === 'client'); }
      catch (e) { sug.textContent = 'Error al cargar clientes: ' + e.message; return; }
      profiles.forEach(p => { names[p.id] = nameOf(p); });
    }
    const hits = profiles.filter(p => matchProfile(p, term) && !(segment.ids || []).includes(p.id)).slice(0, 8);
    sug.innerHTML = hits.map(p => `<button type="button" data-pick="${p.id}">${esc(nameOf(p))} <small>${esc(p.email || '')}</small></button>`).join('')
      || '<span class="co-hint">Sin resultados</span>';
    sug.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      segment.ids = (segment.ids || []).concat(b.dataset.pick);
      search.value = ''; sug.innerHTML = ''; paintPicked(); recount();
    }));
  });

  // Nombres de una selección manual ya guardada
  if (manual && segment.ids.length) {
    fetchProfiles().then(ps => { ps.forEach(p => { names[p.id] = nameOf(p); }); paintPicked(); }).catch(() => {});
  }
  paintPicked();
  recount();
  return { recount };
}
