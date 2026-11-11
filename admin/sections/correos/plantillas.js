/* ============================================================
   Correos → Plantillas: diseños reutilizables para campañas
   (y, en la fase 2, para las automatizaciones).
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { showToast, formatDate } from '../../modules/ui.js';
import { esc, isSchemaMissing, MIGRATION_MSG, clone, blockEditor, previewFrame } from './common.js';

export async function renderPlantillas(container, { onUse } = {}) {
  async function list() {
    const { data: rows, error } = await supabase.from('email_templates')
      .select('id, name, subject, preheader, blocks, updated_at').order('name');
    if (error) {
      container.innerHTML = isSchemaMissing(error) ? MIGRATION_MSG : `<div class="admin-empty"><p>Error al cargar: ${esc(error.message)}</p></div>`;
      return;
    }
    container.innerHTML = `
      <div class="co-bar">
        <p class="co-lead">Diseños que puedes reutilizar en tus campañas. Los cambios aquí no afectan a campañas ya creadas.</p>
        <button class="btn red" data-new>+ Nueva plantilla</button>
      </div>
      ${!rows.length ? `<div class="admin-empty"><p>No hay plantillas.</p></div>` : `
      <div class="co-tpl-grid">${rows.map(t => `
        <article class="co-card co-tpl">
          <h3 class="co-card-title">${esc(t.name)}</h3>
          <p class="co-tpl-subject">${esc(t.subject || '(sin asunto)')}</p>
          <p class="co-hint">Editada el ${formatDate(t.updated_at)} · ${(t.blocks || []).length} bloques</p>
          <div class="co-actions">
            <button class="btn red co-sm" data-use="${t.id}">Usar en campaña</button>
            <button class="btn line co-sm" data-edit="${t.id}">Editar</button>
            <button class="btn line co-sm" data-dup="${t.id}">Duplicar</button>
            <button class="co-del" data-del="${t.id}" title="Borrar">&times;</button>
          </div>
        </article>`).join('')}</div>`}`;

    const byId = (id) => rows.find(r => r.id === id);
    container.querySelector('[data-new]').addEventListener('click', () => edit(null));
    container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => edit(byId(b.dataset.edit))));
    container.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => onUse && onUse(byId(b.dataset.use))));
    container.querySelectorAll('[data-dup]').forEach(b => b.addEventListener('click', async () => {
      const t = byId(b.dataset.dup);
      const { error: e } = await supabase.from('email_templates').insert({
        name: t.name + ' (copia)', subject: t.subject, preheader: t.preheader, blocks: t.blocks,
      });
      if (e) return showToast('Error: ' + e.message, 'error');
      showToast('Plantilla duplicada', 'success'); list();
    }));
    container.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta plantilla? Las campañas creadas con ella no se tocan.')) return;
      const { error: e } = await supabase.from('email_templates').delete().eq('id', b.dataset.del);
      if (e) return showToast('Error: ' + e.message, 'error');
      showToast('Plantilla eliminada', 'success'); list();
    }));
  }

  function edit(t) {
    const draft = { subject: t?.subject || '', preheader: t?.preheader || '', blocks: clone(t?.blocks || []) };
    container.innerHTML = `
      <div class="co-bar">
        <button class="btn line" data-back>← Plantillas</button>
        <button class="btn red" data-save>Guardar plantilla</button>
      </div>
      <div class="co-editor">
        <div class="co-editor-main">
          <section class="co-card">
            <label class="act-form-field"><span class="act-form-label">Nombre de la plantilla</span>
              <input class="act-form-input" data-name value="${esc(t?.name || '')}" placeholder="Ej.: Oferta de verano"></label>
          </section>
          <section class="co-card"><div data-editor></div></section>
        </div>
        <aside class="co-editor-side" data-preview></aside>
      </div>`;
    const preview = previewFrame(container.querySelector('[data-preview]'));
    blockEditor(container.querySelector('[data-editor]'), draft, () => preview.refresh(draft));
    preview.refresh(draft);

    container.querySelector('[data-back]').addEventListener('click', () => list());
    container.querySelector('[data-save]').addEventListener('click', async (e) => {
      const name = container.querySelector('[data-name]').value.trim();
      if (!name) return showToast('Ponle un nombre a la plantilla', 'error');
      e.currentTarget.disabled = true;
      const payload = { name, subject: draft.subject, preheader: draft.preheader || null, blocks: draft.blocks, updated_at: new Date().toISOString() };
      const { error } = t?.id
        ? await supabase.from('email_templates').update(payload).eq('id', t.id)
        : await supabase.from('email_templates').insert(payload);
      e.currentTarget.disabled = false;
      if (error) return showToast('Error al guardar: ' + error.message, 'error');
      showToast('Plantilla guardada', 'success'); list();
    });
  }

  await list();
}
