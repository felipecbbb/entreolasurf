/* ============================================================
   Ficha de Bono ÚNICA (reserva de clases)
   ============================================================
   La MISMA ficha se abra desde donde se abra (reserva-clases, clientes, calendario).
   Lee/escribe TODO vía la capa de dominio (/lib/domain) para que números y acciones
   sean idénticos en todos los paneles. Sustituye las fichas de bono divergentes
   (antes: reserva-clases solo-lectura, clientes con acciones, calendario otra).

   Uso:  await openBonoFicha(bonoId, { onChange })
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { openModal, closeModal, showToast, formatDate, formatCurrency, statusBadge } from '../modules/ui.js';
import { TYPE_LABELS } from '../modules/constants.js';
import { createPayment, deletePayment, fetchPayments } from '../modules/api.js';
import { openPaymentEditModal } from '../modules/payment-edit.js';
import { bonoExpected, getPackPrice, round2 } from '/lib/domain/pricing.js';
import { recalcBonoPaid } from '/lib/domain/payments.js';
import { extendBono, bonoAvailable, defaultBonoExpiry } from '/lib/domain/bonos.js';

const METHODS = ['efectivo', 'tarjeta', 'transferencia', 'voucher', 'saldo'];

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadBono(bonoId) {
  const { data: bono } = await supabase
    .from('bonos').select('*, profiles:user_id(id, full_name, last_name, phone, email)')
    .eq('id', bonoId).single();
  if (!bono) return null;
  // Inscripciones del bono (con clase y familiar) + pagos del bono
  const { data: enr } = await supabase
    .from('class_enrollments')
    .select('*, surf_classes:class_id(id, type, title, date, time_start, time_end), family_members:family_member_id(full_name, last_name)')
    .eq('bono_id', bonoId)
    .order('created_at', { ascending: false });
  const payments = await fetchPayments('bono', bonoId);
  return { bono, enrollments: enr || [], payments: (payments || []).slice().sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)) };
}

function memberName(e) {
  const fm = e.family_members;
  if (fm) return (fm.full_name || '') + (fm.last_name ? ' ' + fm.last_name : '');
  return 'Titular';
}

export async function openBonoFicha(bonoId, { onChange } = {}) {
  const data = await loadBono(bonoId);
  if (!data) { showToast('Bono no encontrado', 'error'); return; }
  const { bono, enrollments, payments } = data;

  const typeLbl = TYPE_LABELS[bono.class_type] || bono.class_type;
  const expected = bonoExpected(bono);
  // Pagado = SUM(payments) o total_paid (el mayor), igual que los paneles de pendientes (api.js).
  const paidSum = round2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
  const paid = Math.max(paidSum, round2(Number(bono.total_paid || 0)));
  const pending = Math.max(0, round2(expected - paid));
  const fullyPaid = pending <= 0;
  const remaining = bonoAvailable(bono);
  const pct = bono.total_credits > 0 ? Math.round((bono.used_credits / bono.total_credits) * 100) : 0;
  const cli = bono.profiles || {};
  const cliName = (cli.full_name || 'Cliente') + (cli.last_name ? ' ' + cli.last_name : '');
  const canPay = !fullyPaid && (bono.status === 'active' || bono.status === 'exhausted');

  // Desglose de reserva conjunta (qué persona usó cuántas clases)
  const byMember = new Map();
  for (const e of enrollments.filter(e => e.status !== 'cancelled')) {
    const k = e.family_member_id || 'titular';
    const cur = byMember.get(k) || { name: memberName(e), n: 0 };
    cur.n++; byMember.set(k, cur);
  }
  const breakdown = [...byMember.values()];
  const hasFamily = breakdown.some(m => m.name !== 'Titular');

  const enrollHtml = enrollments.length ? enrollments.map(e => {
    const c = e.surf_classes || {};
    // Estado = asistencia si está registrada; si no, estado de la inscripción.
    const estado = e.status === 'cancelled' ? statusBadge('cancelled')
      : e.attendance === true ? '<span style="color:#16a34a;font-weight:600">Asistió</span>'
      : e.attendance === false ? '<span style="color:#6b7280">No asistió</span>'
      : statusBadge(e.status || 'confirmed');
    return `<tr>
      <td>${formatDate(c.date)}</td>
      <td>${c.time_start ? c.time_start.slice(0, 5) : '—'}</td>
      <td>${esc(memberName(e))}</td>
      <td>${esc(c.title || TYPE_LABELS[c.type] || '')}</td>
      <td>${estado}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" style="color:var(--color-muted);padding:10px">Aún no se han usado créditos</td></tr>';

  const payHtml = payments.length ? payments.map(p => `<tr>
      <td>${formatDate(p.payment_date)}</td>
      <td>+${formatCurrency(p.amount)}</td>
      <td>${esc(p.payment_method || '')}</td>
      <td><span class="status-badge ${p.channel === 'web' ? 'active' : ''}">${p.channel === 'web' ? 'Web' : 'Manual'}</span></td>
      <td style="text-align:right;white-space:nowrap">${p.channel === 'web' ? '' : `
        <button class="bf-pay-edit" data-id="${p.id}" title="Editar" style="background:none;border:none;cursor:pointer;color:#0ea5e9">✎</button>
        <button class="bf-pay-del" data-id="${p.id}" title="Eliminar" style="background:none;border:none;cursor:pointer;color:#dc2626">🗑</button>`}</td>
    </tr>`).join('') : '<tr><td colspan="5" style="color:var(--color-muted);padding:10px">Sin pagos registrados</td></tr>';

  openModal(`Reserva de ${typeLbl}`, `
    <div class="bf" style="min-width:min(560px,92vw)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:700;color:var(--color-navy,#0f2f39)">${esc(cliName)}</div>
          <div style="font-size:.8rem;color:var(--color-muted)">${esc(cli.phone || '')}${cli.email ? ' · ' + esc(cli.email) : ''}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${statusBadge(bono.status)}
          ${fullyPaid ? '<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:4px;background:#dcfce7;color:#166534">PAGADO</span>'
            : `<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:4px;background:#fef3c7;color:#92400e">DEBE ${formatCurrency(pending)}</span>`}
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-top:14px">
        <span>${bono.used_credits} / ${bono.total_credits} clases usadas</span>
        <span style="color:var(--color-muted)">${remaining} restantes · caduca ${formatDate(bono.expires_at)}</span>
      </div>
      <div style="height:6px;background:#eef0f2;border-radius:99px;overflow:hidden;margin:6px 0 14px">
        <div style="height:100%;width:${pct}%;background:${fullyPaid ? '#22c55e' : '#f59e0b'}"></div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <span style="font-size:.82rem">Pagado ${formatCurrency(paid)} de</span>
        <span class="bf-total-show">
          <strong>${formatCurrency(expected)}</strong>
          <button class="bf-total-edit" title="Editar total" style="background:none;border:none;color:#0ea5e9;cursor:pointer">✎</button>
        </span>
        <span class="bf-total-edit-box" hidden>
          <input type="number" step="0.01" min="0" class="bf-total-input" value="${expected.toFixed(2)}" style="width:90px;padding:3px 6px;border:1px solid #0ea5e9;border-radius:6px" />
          <button class="bf-total-save" style="background:none;border:none;color:#16a34a;cursor:pointer;font-weight:700">✓</button>
          <button class="bf-total-cancel" style="background:none;border:none;color:#dc2626;cursor:pointer">✕</button>
        </span>
        ${bono.order_id != null ? '<span style="font-size:.66rem;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:2px 6px">comprado online</span>' : ''}
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 16px">
        ${canPay ? `<button class="btn bf-add-pay" style="background:#22c55e;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:.82rem;font-weight:600;cursor:pointer">Añadir pago</button>` : ''}
        <button class="btn line bf-extend" style="padding:7px 14px;font-size:.82rem">+ Ampliar</button>
      </div>

      ${hasFamily ? `<div style="background:#f8fafc;border:1px solid var(--color-line,#e5e7eb);border-radius:8px;padding:10px 12px;margin-bottom:14px">
        <div style="font-size:.72rem;font-weight:600;color:var(--color-navy);margin-bottom:6px">Reserva conjunta · Responsable: ${esc(cliName)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${breakdown.map(m => `<span style="font-size:.72rem;padding:3px 9px;border-radius:99px;background:#e0f2fe;color:#075985;font-weight:600">${esc(m.name)}: ${m.n} clase${m.n === 1 ? '' : 's'}</span>`).join('')}
        </div>
      </div>` : ''}

      <h4 style="font-size:.8rem;margin:6px 0 4px;text-transform:uppercase;color:var(--color-muted)">Histórico de clases (${enrollments.length})</h4>
      <div class="table-wrap"><table><thead><tr><th>Día</th><th>Hora</th><th>Asistente</th><th>Clase</th><th>Estado</th></tr></thead><tbody>${enrollHtml}</tbody></table></div>

      <h4 style="font-size:.8rem;margin:16px 0 4px;text-transform:uppercase;color:var(--color-muted)">Pagos (${payments.length})</h4>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Importe</th><th>Método</th><th>Origen</th><th></th></tr></thead><tbody>${payHtml}</tbody></table></div>
    </div>
  `);

  const root = document.getElementById('admin-modal');
  const reload = async () => { closeModal(); if (onChange) await onChange(); await openBonoFicha(bonoId, { onChange }); };

  // Editar total in-place
  root.querySelector('.bf-total-edit')?.addEventListener('click', () => {
    root.querySelector('.bf-total-show').hidden = true;
    root.querySelector('.bf-total-edit-box').hidden = false;
    root.querySelector('.bf-total-input')?.focus();
  });
  root.querySelector('.bf-total-cancel')?.addEventListener('click', () => {
    root.querySelector('.bf-total-edit-box').hidden = true;
    root.querySelector('.bf-total-show').hidden = false;
  });
  root.querySelector('.bf-total-save')?.addEventListener('click', async () => {
    const v = parseFloat(root.querySelector('.bf-total-input').value);
    if (isNaN(v) || v < 0) { showToast('Total inválido', 'error'); return; }
    try { await extendBono(bonoId, { newCustomTotal: v }); showToast('Total actualizado', 'success'); await reload(); }
    catch (err) { showToast('Error: ' + err.message, 'error'); }
  });

  // Añadir pago
  root.querySelector('.bf-add-pay')?.addEventListener('click', async () => {
    const amount = parseFloat(prompt(`Importe a cobrar (€). Pendiente: ${pending.toFixed(2)}`, pending > 0 ? pending.toFixed(2) : ''));
    if (!amount || amount <= 0) return;
    const method = (prompt(`Método (${METHODS.join(' / ')})`, 'efectivo') || '').trim().toLowerCase();
    if (!METHODS.includes(method)) { showToast('Método no válido', 'error'); return; }
    try {
      await createPayment({ reservation_type: 'bono', reference_id: bonoId, amount, payment_method: method, concept: `Pago bono ${typeLbl}` });
      await recalcBonoPaid(bonoId);
      showToast('Pago registrado', 'success');
      await reload();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });

  // Ampliar
  root.querySelector('.bf-extend')?.addEventListener('click', async () => {
    const extra = parseInt(prompt('¿Cuántas clases añadir?', '1'), 10);
    if (!extra || extra <= 0) return;
    const newTotal = (bono.total_credits || 0) + extra;
    const suggested = Math.max(0, round2(getPackPrice(bono.class_type, newTotal) - expected));
    const charge = parseFloat(prompt(`Importe a cobrar por la ampliación (€). Sugerido: ${suggested.toFixed(2)}`, suggested.toFixed(2)));
    if (charge == null || isNaN(charge) || charge < 0) return;
    // Validar el método ANTES de tocar el bono: si es inválido, no ampliar (evita
    // descuadre con cobro perdido en silencio).
    let method = null;
    if (charge > 0) {
      method = (prompt(`Método del cobro (${METHODS.join(' / ')})`, 'efectivo') || '').trim().toLowerCase();
      if (!METHODS.includes(method)) { showToast('Método no válido — no se amplió', 'error'); return; }
    }
    try {
      const newCustomTotal = bono.custom_total != null ? round2(Number(bono.custom_total) + charge) : null;
      await extendBono(bonoId, { newTotalCredits: newTotal, newCustomTotal, status: 'active', expires_at: defaultBonoExpiry() });
      if (charge > 0 && method) {
        await createPayment({ reservation_type: 'bono', reference_id: bonoId, amount: charge, payment_method: method, concept: `Ampliación bono ${typeLbl} (+${extra})` });
      }
      await recalcBonoPaid(bonoId);
      showToast(`Bono ampliado +${extra} clases`, 'success');
      await reload();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });

  // Editar / borrar pagos (manuales)
  root.querySelectorAll('.bf-pay-edit').forEach(b => b.addEventListener('click', () => {
    const p = payments.find(x => x.id === b.dataset.id);
    if (p) openPaymentEditModal(p, { onSaved: async () => { await recalcBonoPaid(bonoId); await reload(); } });
  }));
  root.querySelectorAll('.bf-pay-del').forEach(b => b.addEventListener('click', async () => {
    const p = payments.find(x => x.id === b.dataset.id);
    if (!p || !confirm(`¿Eliminar el pago de ${formatCurrency(p.amount)}?`)) return;
    try { await deletePayment(p.id); await recalcBonoPaid(bonoId); showToast('Pago eliminado', 'success'); await reload(); }
    catch (err) { showToast('Error: ' + err.message, 'error'); }
  }));
}
