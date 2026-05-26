/* ============================================================
   Equipo Section — Gestión de cuentas admin/encargado
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { showToast } from '../modules/ui.js';
import { getProfile } from '../modules/auth.js';

const esc = (s) => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function fetchStaff() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, created_at')
    .in('role', ['admin', 'encargado'])
    .order('role', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function callCreateStaff({ email, password, full_name }) {
  const { data, error } = await supabase.functions.invoke('create-staff', {
    body: { email, password, full_name },
  });
  if (error) {
    // FunctionsHttpError contains the response body in the context
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) throw new Error(ctx.error);
    } catch (_) { /* fall through */ }
    throw new Error(error.message || 'No se pudo crear encargado');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function renderEquipo(container) {
  const myId = getProfile()?.id;
  let creating = false;

  async function render() {
    let staff;
    try {
      staff = await fetchStaff();
    } catch (err) {
      container.innerHTML = `<p style="color:#ef4444;padding:24px">Error: ${esc(err.message)}</p>`;
      return;
    }

    container.innerHTML = `
      <div class="cp-header">
        <span class="sc-count">${staff.length} ${staff.length === 1 ? 'cuenta' : 'cuentas'}</span>
        <button class="sc-new-btn" id="eq-new">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo encargado
        </button>
      </div>

      ${creating ? renderForm() : ''}

      <div class="cp-table" style="margin-top:16px">
        <div class="cp-table-head">
          <span style="flex:2">Nombre</span>
          <span style="flex:2">Email</span>
          <span style="flex:1">Rol</span>
          <span style="flex:1">Alta</span>
          <span style="flex:0 0 80px;text-align:right"></span>
        </div>
        ${staff.map(s => `
          <div class="cp-table-row" data-id="${s.id}">
            <span style="flex:2">${esc(s.full_name || '—')}${s.id === myId ? ' <small style="color:#64757d">(tú)</small>' : ''}</span>
            <span style="flex:2">${esc(s.email || '—')}</span>
            <span style="flex:1"><span class="admin-badge" data-status="${s.role === 'admin' ? 'active' : 'coming_soon'}">${s.role === 'admin' ? 'Admin' : 'Encargado'}</span></span>
            <span style="flex:1">${fmtDate(s.created_at)}</span>
            <span style="flex:0 0 80px;text-align:right">
              ${s.role === 'encargado' && s.id !== myId ? `
                <button class="cp-action-btn cp-action-danger" data-action="delete" data-id="${esc(s.id)}" title="Eliminar encargado">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
              ` : ''}
            </span>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelector('#eq-new')?.addEventListener('click', () => {
      creating = true;
      render();
    });

    container.querySelector('#eq-cancel')?.addEventListener('click', () => {
      creating = false;
      render();
    });

    container.querySelector('#eq-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const payload = {
        full_name: fd.get('full_name')?.toString().trim(),
        email: fd.get('email')?.toString().trim(),
        password: fd.get('password')?.toString(),
      };
      const btn = e.currentTarget.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Creando…';
      try {
        await callCreateStaff(payload);
        showToast('Encargado creado', 'success');
        creating = false;
        await render();
      } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Crear encargado';
      }
    });

    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const row = container.querySelector(`.cp-table-row[data-id="${id}"]`);
        const name = row?.querySelector('span')?.textContent?.trim() || 'este encargado';
        if (!confirm(`¿Eliminar ${name}? Esta acción no se puede deshacer.`)) return;
        try {
          const { error } = await supabase.rpc('delete_user', { p_user_id: id });
          if (error) throw error;
          showToast('Encargado eliminado', 'success');
          await render();
        } catch (err) {
          showToast(`Error: ${err.message}`, 'error');
        }
      });
    });
  }

  function renderForm() {
    return `
      <form id="eq-form" class="trip-form" style="max-width:520px;margin-top:24px;padding:20px;border:1px solid var(--line,#d7d0c2);border-radius:12px;background:#fff">
        <h3 style="margin:0 0 12px;font-family:'Space Grotesk',sans-serif">Nuevo encargado</h3>

        <label for="eq-name">Nombre completo</label>
        <input id="eq-name" name="full_name" required placeholder="Ej: María García" />

        <label for="eq-email">Email</label>
        <input id="eq-email" name="email" type="email" required placeholder="encargado@entreolasurf.com" />

        <label for="eq-password">Contraseña temporal (mín. 8 caracteres)</label>
        <input id="eq-password" name="password" type="text" required minlength="8" placeholder="EncargadoEO!2026" />
        <small style="color:#64757d;display:block;margin:-4px 0 12px">Compártela con el encargado por un canal privado. Podrá cambiarla más adelante.</small>

        <div style="display:flex;gap:8px">
          <button type="submit" class="btn red">Crear encargado</button>
          <button type="button" id="eq-cancel" class="btn" style="background:transparent;border:1px solid var(--line,#d7d0c2);color:#2d3d45">Cancelar</button>
        </div>
      </form>
    `;
  }

  await render();
}
