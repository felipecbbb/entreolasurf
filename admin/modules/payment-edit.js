/* ============================================================
   Modal de edición de pago — reutilizable
   ============================================================ */
import { updatePayment } from './api.js';
import { showToast } from './ui.js';

const esc = (s) => s == null ? '' : String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const METHODS_BY_CHANNEL = {
  in_person: [
    { v: 'efectivo',      l: 'Efectivo' },
    { v: 'tarjeta',       l: 'Tarjeta (TPV en playa)' },
    { v: 'transferencia', l: 'Transferencia' },
    { v: 'voucher',       l: 'Voucher' },
    { v: 'saldo',         l: 'Saldo a favor' },
  ],
  web: [
    { v: 'online',        l: 'Online (Stripe)' },
    { v: 'transferencia', l: 'Transferencia' },
  ],
};

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function openPaymentEditModal(payment, { onSaved } = {}) {
  const channel = payment.channel || 'in_person';
  const methods = METHODS_BY_CHANNEL[channel] || METHODS_BY_CHANNEL.in_person;
  // Si el método actual no está en la lista del canal, añadirlo al principio
  if (!methods.find(m => m.v === payment.payment_method)) {
    methods.unshift({ v: payment.payment_method, l: payment.payment_method });
  }

  const modal = document.createElement('div');
  modal.id = 'payment-edit-modal';
  modal.innerHTML = `
    <style>
      #payment-edit-modal {
        position:fixed;inset:0;z-index:10010;background:rgba(15,47,57,.55);
        display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);
      }
      .pe-dialog {
        background:#fffdf7;width:min(420px,calc(100% - 32px));max-height:90vh;overflow-y:auto;
        border-radius:14px;box-shadow:0 24px 64px rgba(15,47,57,.25);
        animation:peIn .2s cubic-bezier(.22,1,.36,1);
      }
      @keyframes peIn { from { transform:scale(.96);opacity:0 } to { transform:scale(1);opacity:1 } }
      .pe-head {
        display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #e5e7eb;
      }
      .pe-head h3 { margin:0;font-family:'Space Grotesk',sans-serif;color:#0f2f39;font-size:1.05rem; }
      .pe-close {
        width:30px;height:30px;border-radius:50%;border:0;background:#f3f4f6;cursor:pointer;
        font-size:1.1rem;color:#6b7280;display:flex;align-items:center;justify-content:center;
      }
      .pe-body { padding:18px 22px 22px;display:flex;flex-direction:column;gap:12px; }
      .pe-body label { font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280; }
      .pe-body input, .pe-body select, .pe-body textarea {
        background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px;
        font-family:'Space Grotesk',sans-serif;font-size:.92rem;color:#0f2f39;width:100%;
      }
      .pe-body input:disabled { background:#f9fafb;color:#6b7280; }
      .pe-row { display:flex;flex-direction:column;gap:4px; }
      .pe-save {
        margin-top:6px;background:#0f2f39;color:#fff;border:0;border-radius:999px;
        padding:12px 22px;font-family:'Space Grotesk',sans-serif;font-weight:700;
        font-size:.92rem;cursor:pointer;width:100%;
      }
      .pe-save:hover { background:#0a1f25; }
      .pe-save:disabled { opacity:.6;cursor:not-allowed; }
      .pe-info { font-size:.78rem;color:#6b7280;background:#f9fafb;padding:9px 11px;border-radius:8px;border:1px solid #e5e7eb; }
      .pe-info strong { color:#0f2f39; }
    </style>
    <div class="pe-dialog">
      <div class="pe-head">
        <h3>Editar pago · ${formatAmount(payment.amount)}</h3>
        <button type="button" class="pe-close" aria-label="Cerrar">&times;</button>
      </div>
      <form class="pe-body">
        <div class="pe-info">
          <div><strong>Canal:</strong> ${channel === 'web' ? 'Web (Stripe)' : 'Presencial (playa)'}</div>
          <div><strong>Importe:</strong> ${formatAmount(payment.amount)} <em style="color:#6b7280">(no editable)</em></div>
        </div>

        <div class="pe-row">
          <label>Método de pago</label>
          <select id="pe-method">
            ${methods.map(m => `<option value="${esc(m.v)}" ${m.v === payment.payment_method ? 'selected' : ''}>${esc(m.l)}</option>`).join('')}
          </select>
        </div>

        <div class="pe-row">
          <label>Fecha y hora</label>
          <input type="datetime-local" id="pe-date" value="${toDatetimeLocalValue(payment.payment_date)}" />
        </div>

        <div class="pe-row">
          <label>Concepto (opcional)</label>
          <input type="text" id="pe-concept" value="${esc(payment.concept || '')}" placeholder="Ej: Resto surf camp pagado en mano" />
        </div>

        <button type="submit" class="pe-save">Guardar cambios</button>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.pe-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  modal.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = modal.querySelector('.pe-save');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const method = modal.querySelector('#pe-method').value;
      const dateLocal = modal.querySelector('#pe-date').value;
      const concept = modal.querySelector('#pe-concept').value.trim();
      const payment_date = dateLocal ? new Date(dateLocal).toISOString() : undefined;

      await updatePayment(payment.id, {
        payment_method: method,
        payment_date,
        concept: concept || null,
      });
      showToast('Pago actualizado', 'success');
      close();
      if (onSaved) await onSaved();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = 'Guardar cambios';
    }
  });
}

function formatAmount(amount) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(amount || 0));
}
