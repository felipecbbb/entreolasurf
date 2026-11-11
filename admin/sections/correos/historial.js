/* ============================================================
   Correos → Historial: qué se envió a quién, y las bajas.
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { showToast, formatDateTime } from '../../modules/ui.js';
import { esc, isSchemaMissing, MIGRATION_MSG, badge } from './common.js';

export async function renderHistorial(container) {
  let view = 'envios'; // envios | bajas

  async function paint() {
    container.innerHTML = `
      <div class="co-subtabs">
        <button class="co-subtab ${view === 'envios' ? 'is-active' : ''}" data-v="envios">Envíos</button>
        <button class="co-subtab ${view === 'bajas' ? 'is-active' : ''}" data-v="bajas">Bajas</button>
      </div>
      <div data-body><div class="admin-empty"><p>Cargando…</p></div></div>`;
    container.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { view = b.dataset.v; paint(); }));
    const body = container.querySelector('[data-body]');
    if (view === 'envios') await envios(body); else await bajas(body);
  }

  async function envios(body) {
    const { data: camps, error } = await supabase.from('email_campaigns')
      .select('id, name, status, recipients, sent_count, failed_count, sent_at')
      .neq('status', 'draft').order('sent_at', { ascending: false, nullsFirst: true });
    if (error) { body.innerHTML = isSchemaMissing(error) ? MIGRATION_MSG : `<div class="admin-empty"><p>${esc(error.message)}</p></div>`; return; }
    if (!camps.length) { body.innerHTML = `<div class="admin-empty"><p>Todavía no se ha enviado ninguna campaña.</p></div>`; return; }
    body.innerHTML = `<div class="admin-table-wrap"><table class="co-table">
      <thead><tr><th>Campaña</th><th>Estado</th><th>Destinatarios</th><th>Enviados</th><th>Fallidos</th><th>Fecha</th><th></th></tr></thead>
      <tbody>${camps.map(c => `<tr>
        <td><strong>${esc(c.name)}</strong></td><td>${badge(c.status)}</td>
        <td>${c.recipients}</td><td>${c.sent_count}</td><td>${c.failed_count || 0}</td>
        <td>${c.sent_at ? formatDateTime(c.sent_at) : '—'}</td>
        <td><button class="btn line co-sm" data-detail="${c.id}">Ver detalle</button></td>
      </tr>`).join('')}</tbody></table></div>
      <div data-detail-box></div>`;
    body.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', () =>
      detail(body.querySelector('[data-detail-box]'), camps.find(c => c.id === b.dataset.detail))));
  }

  async function detail(box, camp) {
    box.innerHTML = `<div class="admin-empty"><p>Cargando…</p></div>`;
    const { data, error } = await supabase.from('email_sends')
      .select('email, status, sent_at, error').eq('campaign_id', camp.id).order('email');
    if (error) { box.innerHTML = `<p class="co-err">${esc(error.message)}</p>`; return; }
    box.innerHTML = `<section class="co-card"><h3 class="co-card-title">${esc(camp.name)} · ${data.length} destinatarios</h3>
      <div class="admin-table-wrap"><table class="co-table">
        <thead><tr><th>Email</th><th>Estado</th><th>Enviado</th><th>Detalle</th></tr></thead>
        <tbody>${data.map(s => `<tr><td>${esc(s.email)}</td><td>${badge(s.status)}</td>
          <td>${s.sent_at ? formatDateTime(s.sent_at) : '—'}</td><td class="co-err">${esc(s.error || '')}</td></tr>`).join('')}</tbody>
      </table></div></section>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function bajas(body) {
    const { data, error } = await supabase.from('profiles')
      .select('id, full_name, last_name, email, email_unsubscribed_at, marketing_optout_at_signup')
      .not('email_unsubscribed_at', 'is', null).order('email_unsubscribed_at', { ascending: false });
    if (error) { body.innerHTML = isSchemaMissing(error) ? MIGRATION_MSG : `<div class="admin-empty"><p>${esc(error.message)}</p></div>`; return; }
    body.innerHTML = !data.length ? `<div class="admin-empty"><p>Nadie se ha dado de baja.</p></div>` : `
      <p class="co-hint">Estos clientes no reciben campañas ni automatizaciones. Siguen recibiendo los correos de sus reservas y compras.
      Reactiva solo a quien te lo pida expresamente.</p>
      <div class="admin-table-wrap"><table class="co-table">
        <thead><tr><th>Cliente</th><th>Email</th><th>Baja</th><th>Origen</th><th></th></tr></thead>
        <tbody>${data.map(p => `<tr>
          <td>${esc([p.full_name, p.last_name].filter(Boolean).join(' ') || '—')}</td><td>${esc(p.email)}</td>
          <td>${formatDateTime(p.email_unsubscribed_at)}</td>
          <td>${p.marketing_optout_at_signup ? 'Al registrarse' : 'Enlace del correo'}</td>
          <td><button class="btn line co-sm" data-re="${p.id}">Reactivar</button></td>
        </tr>`).join('')}</tbody></table></div>`;
    body.querySelectorAll('[data-re]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Reactivar los correos para este cliente? Hazlo solo si te lo ha pedido.')) return;
      const { error: e } = await supabase.from('profiles')
        .update({ email_unsubscribed_at: null, marketing_optout_at_signup: false }).eq('id', b.dataset.re);
      if (e) return showToast('Error: ' + e.message, 'error');
      showToast('Cliente reactivado', 'success'); bajas(body);
    }));
  }

  await paint();
}
