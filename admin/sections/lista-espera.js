/* ============================================================
   Lista de espera — gente que pidió aviso de próximas clases
   ------------------------------------------------------------
   Se apuntan desde la web (lib/waitlist.js) cuando no hay ninguna
   clase publicada. Aquí se consultan, se marcan como avisados, se
   les escribe por WhatsApp y se exportan.
   Acceso: admin + encargado con la sección 'lista-espera'.
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { showToast, formatDate } from '../modules/ui.js';
import { TYPE_LABELS } from '/lib/utils.js';

const esc = (s) => s == null ? '' : String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function isSchemaMissing(error) {
  if (!error) return false;
  const code = error.code || '';
  if (['42P01', '42703', 'PGRST205', 'PGRST204'].includes(code)) return true;
  return /does not exist|schema cache|could not find/i.test(error.message || '');
}

const tipoLabel = (t) => !t ? 'Cualquiera' : (TYPE_LABELS[t] || t);
const waLink = (phone) => {
  const clean = String(phone || '').replace(/[^0-9+]/g, '');
  if (!clean) return null;
  return `https://wa.me/${clean.replace(/^\+/, '')}`;
};

export async function renderListaEspera(container) {
  let rows = [];
  let filtro = 'pendientes';   // pendientes | todos | avisados
  let busca = '';

  async function load() {
    const { data, error } = await supabase
      .from('class_waitlist')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  // Recarga de la BD y repinta. Para filtrar/buscar se usa paint(), que no
  // vuelve a consultar: la lista ya está en memoria.
  async function render() {
    try {
      rows = await load();
    } catch (err) {
      container.innerHTML = isSchemaMissing(err)
        ? `<div class="admin-empty"><p><strong>Falta aplicar la migración de lista de espera.</strong><br>Ejecuta <code>supabase/migration-lista-espera.sql</code> en el SQL Editor de Supabase y recarga la página.</p></div>`
        : `<div class="admin-empty"><p>Error al cargar: ${esc(err.message)}</p></div>`;
      return;
    }
    paint();
  }

  function paint() {
    const term = busca.trim().toLowerCase();
    let vista = rows.filter(r => {
      if (filtro === 'pendientes' && r.notified_at) return false;
      if (filtro === 'avisados' && !r.notified_at) return false;
      if (!term) return true;
      return [r.name, r.email, r.phone].some(v => String(v || '').toLowerCase().includes(term));
    });

    const pendientes = rows.filter(r => !r.notified_at).length;
    const conWhatsapp = rows.filter(r => r.wants_whatsapp).length;

    container.innerHTML = `
      <div class="le-bar">
        <div class="le-stats">
          <span class="le-stat"><strong>${rows.length}</strong> apuntados</span>
          <span class="le-stat"><strong>${pendientes}</strong> sin avisar</span>
          <span class="le-stat"><strong>${conWhatsapp}</strong> quieren WhatsApp</span>
        </div>
        <div class="le-tools">
          <input type="search" id="le-search" class="act-form-input" placeholder="Buscar nombre, email o teléfono…" value="${esc(busca)}">
          <select id="le-filter" class="act-form-input">
            <option value="pendientes" ${filtro === 'pendientes' ? 'selected' : ''}>Sin avisar</option>
            <option value="avisados" ${filtro === 'avisados' ? 'selected' : ''}>Ya avisados</option>
            <option value="todos" ${filtro === 'todos' ? 'selected' : ''}>Todos</option>
          </select>
          <button class="btn line" id="le-export">Exportar CSV</button>
        </div>
      </div>

      ${!vista.length ? `
        <div class="admin-empty"><p>${rows.length ? 'Nadie en este filtro.' : 'Todavía no se ha apuntado nadie.'}</p></div>
      ` : `
        <div class="admin-table-wrap">
          <table class="admin-table le-table">
            <thead>
              <tr>
                <th>Nombre</th><th>Contacto</th><th>Le interesa</th>
                <th>WhatsApp</th><th>Se apuntó</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${vista.map(r => {
                const wa = waLink(r.phone);
                return `
                <tr class="${r.notified_at ? 'le-row-done' : ''}">
                  <td><strong>${esc(r.name)}</strong></td>
                  <td class="le-contact">
                    <a href="mailto:${esc(r.email)}">${esc(r.email)}</a>
                    ${r.phone ? `<span class="le-phone">${esc(r.phone)}</span>` : ''}
                  </td>
                  <td>${esc(tipoLabel(r.class_type))}</td>
                  <td>${r.wants_whatsapp ? '<span class="le-yes">Sí</span>' : '<span class="le-no">No</span>'}</td>
                  <td>${formatDate(r.created_at)}</td>
                  <td>${r.notified_at
                    ? `<span class="admin-badge" style="--badge-bg:#dcfce7;--badge-color:#15803d">Avisado</span>`
                    : `<span class="admin-badge" style="--badge-bg:#fef3c7;--badge-color:#92400e">Pendiente</span>`}</td>
                  <td class="le-actions">
                    ${wa && r.wants_whatsapp ? `<a class="btn line le-btn" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
                    <button class="btn line le-btn" data-toggle="${r.id}">${r.notified_at ? 'Marcar pendiente' : 'Marcar avisado'}</button>
                    <button class="le-del" data-del="${r.id}" title="Eliminar">&times;</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    const search = container.querySelector('#le-search');
    if (search) {
      search.addEventListener('input', () => {
        busca = search.value;
        paint();
        const el = container.querySelector('#le-search');
        el?.focus();
        el?.setSelectionRange(el.value.length, el.value.length);
      });
    }
    container.querySelector('#le-filter')?.addEventListener('change', (e) => {
      filtro = e.target.value; paint();
    });

    container.querySelector('#le-export')?.addEventListener('click', () => exportCsv(vista));

    container.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.toggle;
        const row = rows.find(r => r.id === id);
        try {
          const { error } = await supabase.from('class_waitlist')
            .update({ notified_at: row?.notified_at ? null : new Date().toISOString() })
            .eq('id', id);
          if (error) throw error;
          render();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      });
    });

    container.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar a esta persona de la lista de espera?')) return;
        try {
          const { error } = await supabase.from('class_waitlist').delete().eq('id', btn.dataset.del);
          if (error) throw error;
          showToast('Eliminado', 'success');
          render();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      });
    });
  }

  function exportCsv(list) {
    if (!list.length) { showToast('No hay nada que exportar', 'error'); return; }
    const head = ['Nombre', 'Email', 'Teléfono', 'Le interesa', 'Quiere WhatsApp', 'Se apuntó', 'Avisado'];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(cell).join(',')].concat(list.map(r => [
      r.name, r.email, r.phone || '', tipoLabel(r.class_type),
      r.wants_whatsapp ? 'Sí' : 'No', r.created_at, r.notified_at || '',
    ].map(cell).join(',')));
    // BOM para que Excel respete las tildes
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lista-espera-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  await render();
}
