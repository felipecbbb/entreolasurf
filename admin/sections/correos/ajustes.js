/* ============================================================
   Correos → Ajustes: remitente, respuestas y pie legal.
   Fila única de site_settings (id = 1).
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { showToast } from '../../modules/ui.js';
import { esc, isSchemaMissing, MIGRATION_MSG } from './common.js';

export async function renderAjustesCorreo(container) {
  const { data: s, error } = await supabase.from('site_settings')
    .select('email_sender_name, email_sender_address, email_reply_to, email_footer').eq('id', 1).maybeSingle();
  if (error) {
    container.innerHTML = isSchemaMissing(error) ? MIGRATION_MSG : `<div class="admin-empty"><p>${esc(error.message)}</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="aj-wrap">
      <section class="aj-card">
        <h3 class="aj-card-title">Remitente</h3>
        <p class="aj-card-lead">Así te ven tus clientes en su bandeja. El correo del remitente tiene que ser del dominio
          <strong>entreolasurf.com</strong> y estar validado en Brevo; si no, los envíos fallan o van a spam.</p>
        <div class="aj-fields">
          <label class="aj-field"><span class="aj-label">Nombre</span>
            <input class="act-form-input" data-k="email_sender_name" value="${esc(s?.email_sender_name || '')}" placeholder="Entre Olas Surf"></label>
          <label class="aj-field"><span class="aj-label">Correo del remitente</span>
            <input type="email" class="act-form-input" data-k="email_sender_address" value="${esc(s?.email_sender_address || '')}" placeholder="hola@entreolasurf.com"></label>
          <label class="aj-field"><span class="aj-label">Las respuestas llegan a</span>
            <input type="email" class="act-form-input" data-k="email_reply_to" value="${esc(s?.email_reply_to || '')}" placeholder="entreolasurf@gmail.com"></label>
          <label class="aj-field"><span class="aj-label">Texto del pie</span>
            <textarea class="act-form-input" rows="2" data-k="email_footer">${esc(s?.email_footer || '')}</textarea></label>
          <p class="aj-hint">Debajo del pie se añade siempre el enlace «Darme de baja de estos correos». Es obligatorio por ley y no se puede quitar.</p>
        </div>
        <div class="aj-actions"><span></span><button class="btn red" data-save>Guardar</button></div>
      </section>
    </div>`;

  container.querySelector('[data-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const upd = { updated_at: new Date().toISOString() };
    container.querySelectorAll('[data-k]').forEach(i => { upd[i.dataset.k] = i.value.trim() || null; });
    const addr = upd.email_sender_address;
    if (addr && !/@entreolasurf\.com$/i.test(addr) && !confirm('El remitente no es del dominio entreolasurf.com. Es probable que Brevo lo rechace o que vaya a spam. ¿Guardar igualmente?')) return;
    btn.disabled = true;
    const { error: ue } = await supabase.from('site_settings').update(upd).eq('id', 1);
    btn.disabled = false;
    if (ue) return showToast('Error al guardar: ' + ue.message, 'error');
    showToast('Ajustes de correo guardados', 'success');
  });
}
