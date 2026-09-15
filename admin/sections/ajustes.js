/* ============================================================
   Ajustes — opciones del sitio público
   ------------------------------------------------------------
   Fila única en `site_settings` (id = 1), como payroll_config.
   Solo admin (la RLS usa is_strict_admin, y la ruta es admin-only).
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { showToast } from '../modules/ui.js';

const esc = (s) => s == null ? '' : String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function isSchemaMissing(error) {
  if (!error) return false;
  const code = error.code || '';
  if (['42P01', '42703', 'PGRST205', 'PGRST204'].includes(code)) return true;
  return /does not exist|schema cache|could not find/i.test(error.message || '');
}

export async function renderAjustes(container) {
  container.innerHTML = '<div class="admin-empty"><p>Cargando…</p></div>';

  let settings;
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    settings = data || { waitlist_enabled: true, waitlist_title: '', waitlist_text: '' };
  } catch (err) {
    container.innerHTML = isSchemaMissing(err)
      ? `<div class="admin-empty"><p><strong>Falta aplicar la migración de ajustes.</strong><br>Ejecuta <code>supabase/migration-lista-espera.sql</code> en el SQL Editor de Supabase y recarga la página.</p></div>`
      : `<div class="admin-empty"><p>Error al cargar: ${esc(err.message)}</p></div>`;
    return;
  }

  const on = settings.waitlist_enabled !== false;

  container.innerHTML = `
    <div class="aj-wrap">
      <section class="aj-card">
        <div class="aj-card-head">
          <div>
            <h3 class="aj-card-title">Lista de espera de clases</h3>
            <p class="aj-card-lead">
              Cuando no hay ninguna clase publicada, al cliente le aparece un cuadro
              para dejar sus datos y que le avisemos de las próximas fechas.
              Los que se apuntan salen en <strong>Lista de espera</strong>.
            </p>
          </div>
          <label class="aj-switch" title="${on ? 'Activada' : 'Desactivada'}">
            <input type="checkbox" id="aj-waitlist" ${on ? 'checked' : ''}>
            <span class="aj-switch-track"><span class="aj-switch-thumb"></span></span>
          </label>
        </div>

        <div class="aj-fields" id="aj-waitlist-fields" ${on ? '' : 'hidden'}>
          <label class="aj-field">
            <span class="aj-label">Título del cuadro</span>
            <input type="text" class="act-form-input" id="aj-wl-title"
                   value="${esc(settings.waitlist_title || '')}"
                   placeholder="No hay clases disponibles ahora mismo">
          </label>
          <label class="aj-field">
            <span class="aj-label">Texto</span>
            <textarea class="act-form-input" id="aj-wl-text" rows="2"
                      placeholder="Déjanos tus datos y te avisamos en cuanto publiquemos nuevas fechas.">${esc(settings.waitlist_text || '')}</textarea>
          </label>
          <p class="aj-hint">Si los dejas vacíos se usan los textos por defecto.</p>
        </div>

        <div class="aj-actions">
          <span class="aj-state" id="aj-state">${on ? 'Activada' : 'Desactivada'}</span>
          <button class="btn red" id="aj-save">Guardar</button>
        </div>
      </section>
    </div>
  `;

  const chk = container.querySelector('#aj-waitlist');
  const fields = container.querySelector('#aj-waitlist-fields');
  const state = container.querySelector('#aj-state');

  chk.addEventListener('change', () => {
    fields.hidden = !chk.checked;
    state.textContent = chk.checked ? 'Activada' : 'Desactivada';
  });

  container.querySelector('#aj-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Guardando…';
    try {
      const { error } = await supabase.from('site_settings').upsert({
        id: 1,
        waitlist_enabled: chk.checked,
        waitlist_title: container.querySelector('#aj-wl-title').value.trim() || null,
        waitlist_text: container.querySelector('#aj-wl-text').value.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;
      showToast('Ajustes guardados', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });
}
