import { supabase } from '/lib/supabase.js';
import { formatDate, formatPrice, METHOD_LABELS } from '/lib/utils.js';

export async function renderPayments(panel) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { panel.innerHTML = '<p>Inicia sesión para ver tus pagos.</p>'; return; }

  panel.innerHTML = '<p style="color:var(--color-muted)">Cargando pagos…</p>';

  // Fetch payments via RPC + orders + bonos in parallel
  const [paymentsRes, ordersRes, profileRes, bonosRes] = await Promise.all([
    supabase.rpc('get_user_payments', { p_user_id: user.id }),
    supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('profiles').select('credit_balance').eq('id', user.id).single(),
    supabase.from('bonos').select('*, payments:payments(amount)').eq('user_id', user.id).eq('status', 'active'),
  ]);

  const payments = paymentsRes.data || [];
  const orders = ordersRes.data || [];
  const creditBalance = Number(profileRes.data?.credit_balance || 0);
  const activeBonos = bonosRes.data || [];

  // Build unified timeline
  const timeline = [];

  const RES_TYPE_LABELS = { enrollment: 'Clase', rental: 'Alquiler', custom: 'Saldo a favor' };
  for (const p of payments) {
    timeline.push({
      date: p.payment_date || p.created_at,
      type: RES_TYPE_LABELS[p.reservation_type] || p.reservation_type,
      concept: p.concept || (p.reservation_type === 'enrollment' ? 'Pago clase' : p.reservation_type === 'custom' ? 'Saldo a favor' : 'Pago alquiler'),
      amount: Number(p.amount),
      method: p.payment_method || '—',
      source: 'admin',
    });
  }

  for (const o of orders) {
    timeline.push({
      date: o.created_at,
      type: 'Pedido online',
      concept: `Pedido #${o.id.substring(0, 8)}`,
      amount: Number(o.total),
      method: 'online',
      source: 'web',
    });
  }

  timeline.sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalPaid = timeline.reduce((s, t) => s + t.amount, 0);

  // Calculate pending payment from active bonos
  // For each active bono, check expected price vs total paid
  let totalPending = 0;
  for (const b of activeBonos) {
    const bonoPayments = (b.payments || []);
    const totalBonoPayments = bonoPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const expectedPrice = Number(b.price || 0);
    const pending = Math.round((expectedPrice - totalBonoPayments) * 100) / 100;
    if (pending > 0) totalPending += pending;
  }
  totalPending = Math.round(totalPending * 100) / 100;

  let html = `
    <div class="pay-summary-grid">
      <div class="pay-summary-card pay-summary-green">
        <div class="pay-summary-label">Créditos comprados</div>
        <div class="pay-summary-value">${formatPrice(totalPaid)}</div>
      </div>
      ${totalPending > 0 ? `
      <div class="pay-summary-card" style="border-color:#ef4444;background:#fef2f2">
        <div class="pay-summary-label" style="color:#b91c1c">Pendiente de pago</div>
        <div class="pay-summary-value" style="color:#b91c1c">${formatPrice(totalPending)}</div>
        <div class="pay-summary-hint" style="color:#b91c1c">Saldo pendiente en tus bonos activos</div>
      </div>` : ''}
      <div class="pay-summary-card ${creditBalance > 0 ? 'pay-summary-yellow' : 'pay-summary-neutral'}">
        <div class="pay-summary-label">Saldo a favor</div>
        <div class="pay-summary-value">${formatPrice(creditBalance)}</div>
        ${creditBalance > 0 ? '<div class="pay-summary-hint">Puedes usar este saldo en tus próximas reservas</div>' : ''}
      </div>
    </div>`;

  if (!timeline.length) {
    html += `<div class="account-form-card"><p style="color:var(--color-muted);margin:0">No tienes pagos registrados todavía.</p></div>`;
  } else {
    html += `
      <div class="account-form-card" style="padding:0;overflow:hidden">
        <div class="pay-table-wrap">
          <table class="pay-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th>Importe</th>
                <th>Método</th>
                <th>Origen</th>
              </tr>
            </thead>
            <tbody>
              ${timeline.map(t => `
                <tr>
                  <td data-label="Fecha">${formatDate(t.date)}</td>
                  <td data-label="Tipo">${t.type}</td>
                  <td data-label="Concepto">${t.concept}</td>
                  <td data-label="Importe" class="pay-amount">+${formatPrice(t.amount)}</td>
                  <td data-label="Método">${METHOD_LABELS[t.method] || t.method}</td>
                  <td data-label="Origen"><span class="pay-source-badge ${t.source === 'web' ? 'pay-source-web' : ''}">${t.source === 'web' ? 'Web' : 'Escuela'}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  panel.innerHTML = html;
}
