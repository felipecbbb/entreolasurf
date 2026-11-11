/* ============================================================
   Correos → Campañas: lista, editor y envío masivo
   El envío lo hace la Edge Function (cola en email_sends). El panel la
   llama en bucle con 'process' y enseña el progreso; si se cierra la
   pestaña, la cola queda a medias y se retoma con «Continuar envío».
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { showToast, formatDateTime } from '../../modules/ui.js';
import { getProfile } from '../../modules/auth.js';
import { esc, isSchemaMissing, MIGRATION_MSG, clone, api, badge, blockEditor, segmentBuilder, previewFrame } from './common.js';

export async function renderCampanas(container, opts = {}) {
  let rows = [];

  async function load() {
    const { data, error } = await supabase.from('email_campaigns')
      .select('id, name, status, recipients, sent_count, failed_count, sent_at, created_at, updated_at, last_error')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function list() {
    try { rows = await load(); }
    catch (e) {
      container.innerHTML = isSchemaMissing(e) ? MIGRATION_MSG : `<div class="admin-empty"><p>Error al cargar: ${esc(e.message)}</p></div>`;
      return;
    }
    container.innerHTML = `
      <div class="co-bar">
        <p class="co-lead">Correos masivos a tus clientes. Cada correo lleva su enlace de baja y nunca se envía a quien se haya dado de baja.</p>
        <button class="btn red" data-new>+ Nueva campaña</button>
      </div>
      ${!rows.length ? `<div class="admin-empty"><p>Todavía no has creado ninguna campaña.</p></div>` : `
      <div class="admin-table-wrap"><table class="co-table">
        <thead><tr><th>Campaña</th><th>Estado</th><th>Destinatarios</th><th>Enviados</th><th>Fecha</th><th></th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td><strong>${esc(r.name)}</strong>${r.last_error ? `<div class="co-err">${esc(r.last_error)}</div>` : ''}</td>
            <td>${badge(r.status)}</td>
            <td>${r.recipients || '—'}</td>
            <td>${r.status === 'draft' ? '—' : `${r.sent_count}${r.failed_count ? ` <span class="co-err">(${r.failed_count} fallidos)</span>` : ''}`}</td>
            <td>${formatDateTime(r.sent_at || r.updated_at || r.created_at)}</td>
            <td class="co-actions">
              ${r.status === 'draft' ? `<button class="btn line co-sm" data-edit="${r.id}">Editar</button>` : ''}
              ${r.status === 'sending' ? `<button class="btn line co-sm" data-resume="${r.id}">Continuar envío</button>` : ''}
              <button class="btn line co-sm" data-dup="${r.id}">Duplicar</button>
              ${r.status === 'draft' ? `<button class="co-del" data-del="${r.id}" title="Borrar">&times;</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table></div>`}`;

    container.querySelector('[data-new]').addEventListener('click', () => edit(null));
    container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => edit(b.dataset.edit)));
    container.querySelectorAll('[data-dup]').forEach(b => b.addEventListener('click', () => edit(b.dataset.dup, { duplicate: true })));
    container.querySelectorAll('[data-resume]').forEach(b => b.addEventListener('click', () => runSend(b.dataset.resume, null)));
    container.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Borrar este borrador?')) return;
      const { error } = await supabase.from('email_campaigns').delete().eq('id', b.dataset.del).eq('status', 'draft');
      if (error) return showToast('Error: ' + error.message, 'error');
      showToast('Borrador eliminado', 'success'); list();
    }));
  }

  /* ---------- Editor ---------- */
  async function edit(id, { duplicate = false, fromTemplate = null } = {}) {
    let c = { name: '', subject: '', preheader: '', blocks: [], segment: {}, template_id: null };
    if (id) {
      const { data, error } = await supabase.from('email_campaigns').select('*').eq('id', id).single();
      if (error) return showToast('Error: ' + error.message, 'error');
      c = data;
      if (duplicate) c = { ...clone(c), id: undefined, name: c.name + ' (copia)', status: 'draft' };
    } else if (fromTemplate) {
      c = { ...c, name: fromTemplate.name, subject: fromTemplate.subject, preheader: fromTemplate.preheader || '',
            blocks: clone(fromTemplate.blocks || []), template_id: fromTemplate.id };
    }
    const draft = { subject: c.subject || '', preheader: c.preheader || '', blocks: clone(c.blocks || []) };
    const segment = clone(c.segment || {});
    let campaignId = duplicate ? null : (c.id || null);
    let count = null;

    const { data: templates } = await supabase.from('email_templates').select('id, name, subject, preheader, blocks').order('name');

    container.innerHTML = `
      <div class="co-bar">
        <button class="btn line" data-back>← Campañas</button>
        <div class="co-bar-right">
          <button class="btn line" data-save>Guardar borrador</button>
          <button class="btn red" data-send>Enviar…</button>
        </div>
      </div>
      <div class="co-editor">
        <div class="co-editor-main">
          <section class="co-card">
            <label class="act-form-field"><span class="act-form-label">Nombre interno de la campaña</span>
              <input class="act-form-input" data-name value="${esc(c.name)}" placeholder="Ej.: Apertura temporada 2027"></label>
            ${!campaignId && (templates || []).length ? `
              <label class="act-form-field"><span class="act-form-label">Empezar desde una plantilla</span>
                <select class="act-form-input" data-tpl><option value="">— En blanco / la actual —</option>
                  ${templates.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>` : ''}
          </section>
          <section class="co-card"><h3 class="co-card-title">1. Destinatarios</h3><div data-seg></div></section>
          <section class="co-card"><h3 class="co-card-title">2. Contenido</h3><div data-editor></div></section>
          <section class="co-card"><h3 class="co-card-title">3. Prueba</h3>
            <div class="co-row">
              <input type="email" class="act-form-input" data-test-to value="${esc(getProfile()?.email || '')}" placeholder="tu@correo.com">
              <button class="btn line" data-test>Enviarme una prueba</button>
            </div>
            <p class="co-hint">La prueba usa datos de ejemplo (Lucía, 3 clases…) y lleva «[PRUEBA]» en el asunto.</p>
          </section>
        </div>
        <aside class="co-editor-side" data-preview></aside>
      </div>`;

    const preview = previewFrame(container.querySelector('[data-preview]'));
    const changed = () => preview.refresh(draft);
    const mountEditor = () => blockEditor(container.querySelector('[data-editor]'), draft, changed);
    mountEditor();
    segmentBuilder(container.querySelector('[data-seg]'), segment, (n) => { count = n; });
    changed();

    const tplSel = container.querySelector('[data-tpl]');
    if (tplSel) tplSel.addEventListener('change', () => {
      const t = (templates || []).find(x => x.id === tplSel.value);
      if (!t) return;
      if (draft.blocks.length && !confirm('¿Sustituir el contenido actual por el de la plantilla?')) { tplSel.value = ''; return; }
      draft.subject = t.subject; draft.preheader = t.preheader || ''; draft.blocks = clone(t.blocks || []);
      c.template_id = t.id;
      const nameInp = container.querySelector('[data-name]');
      if (!nameInp.value) nameInp.value = t.name;
      mountEditor(); changed();
    });

    async function save() {
      const name = container.querySelector('[data-name]').value.trim();
      if (!name) { showToast('Ponle un nombre a la campaña', 'error'); return null; }
      const payload = {
        name, subject: draft.subject, preheader: draft.preheader || null, blocks: draft.blocks,
        segment, template_id: c.template_id || null, updated_at: new Date().toISOString(),
      };
      if (campaignId) {
        const { error } = await supabase.from('email_campaigns').update(payload).eq('id', campaignId).eq('status', 'draft');
        if (error) { showToast('Error al guardar: ' + error.message, 'error'); return null; }
      } else {
        const { data, error } = await supabase.from('email_campaigns')
          .insert({ ...payload, created_by: getProfile()?.id || null }).select('id').single();
        if (error) { showToast('Error al guardar: ' + error.message, 'error'); return null; }
        campaignId = data.id;
      }
      return campaignId;
    }

    container.querySelector('[data-back]').addEventListener('click', () => list());
    container.querySelector('[data-save]').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      if (await save()) showToast('Borrador guardado', 'success');
      e.currentTarget.disabled = false;
    });
    container.querySelector('[data-test]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const to = container.querySelector('[data-test-to]').value.trim();
      if (!draft.subject.trim() || !draft.blocks.length) return showToast('Escribe el asunto y el contenido', 'error');
      btn.disabled = true; btn.textContent = 'Enviando…';
      try { await api('test', { ...draft, to }); showToast('Prueba enviada a ' + to, 'success'); }
      catch (err) { showToast('No se pudo enviar: ' + err.message, 'error'); }
      btn.disabled = false; btn.textContent = 'Enviarme una prueba';
    });
    container.querySelector('[data-send]').addEventListener('click', async () => {
      if (!draft.subject.trim() || !draft.blocks.length) return showToast('Escribe el asunto y el contenido', 'error');
      if (!count) return showToast(count === 0 ? 'No hay destinatarios con esos filtros' : 'Espera a que se calculen los destinatarios', 'error');
      const id = await save();
      if (!id) return;
      if (!confirm(`Vas a enviar «${draft.subject}» a ${count} cliente${count === 1 ? '' : 's'}.\n\nNo se puede deshacer. ¿Enviar ahora?`)) return;
      runSend(id, count);
    });
  }

  /* ---------- Envío con progreso ---------- */
  async function runSend(id, total) {
    container.innerHTML = `<div class="co-card co-sending">
      <h3 class="co-card-title">Enviando campaña…</h3>
      <div class="co-progress"><div class="co-progress-bar" data-bar></div></div>
      <p data-txt>Preparando la cola de envío…</p>
      <p class="co-hint">No cierres esta pestaña hasta que termine. Si se corta, podrás continuar desde la lista.</p>
    </div>`;
    const bar = container.querySelector('[data-bar]');
    const txt = container.querySelector('[data-txt]');
    let r;
    try {
      r = await api('send', { campaign_id: id });
      let guard = 0;
      while (r.status === 'sending' && r.remaining > 0 && guard++ < 50) {
        const done = r.sent_total + r.failed_total;
        const all = total || (done + r.remaining);
        bar.style.width = Math.round(100 * done / all) + '%';
        txt.textContent = `${r.sent_total} enviados${r.failed_total ? `, ${r.failed_total} fallidos` : ''} · quedan ${r.remaining}`;
        r = await api('process', { campaign_id: id });
      }
      bar.style.width = '100%';
      await supabase.from('email_campaigns').update({ last_error: null }).eq('id', id);
      showToast(`Campaña enviada: ${r.sent_total} correos${r.failed_total ? `, ${r.failed_total} fallidos` : ''}`, r.failed_total ? 'info' : 'success');
    } catch (e) {
      showToast('El envío se ha detenido: ' + e.message, 'error');
      await supabase.from('email_campaigns').update({ last_error: String(e.message).slice(0, 300) }).eq('id', id);
    }
    list();
  }

  if (opts.fromTemplate) await edit(null, { fromTemplate: opts.fromTemplate });
  else await list();
}
