import { supabase } from '/lib/supabase.js';
import { formatDate, formatPrice, METHOD_LABELS } from '/lib/utils.js';

export async function renderPayments(panel) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { panel.innerHTML = '<p>Inicia sesion para ver tus pagos.</p>'; return; }

  panel.innerHTML = '<p style="color:var(--color-muted)">Cargando pagos…</p>';

  const [paymentsRes, ordersRes, bookingsRes, profileRes, bonosRes] = await Promise.all([
    supabase.rpc('get_user_payments', { p_user_id: user.id }),
    supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('bookings').select('*, surf_camps:camp_id(title)').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('profiles').select('credit_balance').eq('id', user.id).single(),
    supabase.from('bonos').select('*, payments:payments(amount)').eq('user_id', user.id).eq('status', 'active'),
  ]);

  const payments = paymentsRes.data || [];
  const orders = ordersRes.data || [];
  const bookings = bookingsRes.data || [];
  const creditBalance = Number(profileRes.data?.credit_balance || 0);
  const activeBonos = bonosRes.data || [];

  // Identify which orders are pure product orders (not linked to bonos)
  const bonoOrderIds = new Set();
  const { data: allBonos } = await supabase.from('bonos').select('order_id').eq('user_id', user.id).not('order_id', 'is', null);
  if (allBonos) allBonos.forEach(b => bonoOrderIds.add(b.order_id));

  // Booking IDs to avoid double counting from payments table
  const bookingIds = new Set(bookings.map(b => b.id));

  const DOMAIN_CONFIG = {
    enrollment: { label: 'Clase', color: '#22c55e', bg: '#f0fdf4' },
    rental:     { label: 'Alquiler', color: '#8b5cf6', bg: '#f5f3ff' },
    custom:     { label: 'Saldo', color: '#f59e0b', bg: '#fffbeb' },
    bono:       { label: 'Bono', color: '#16a34a', bg: '#f0fdf4' },
    booking:    { label: 'Surf Camp', color: '#0ea5e9', bg: '#f0f9ff' },
    order:      { label: 'Tienda', color: '#f59e0b', bg: '#fffbeb' },
  };

  function domainBadge(domain) {
    const cfg = DOMAIN_CONFIG[domain];
    if (!cfg) return `<span class="pay-domain-badge" style="background:#f1f5f9;color:#64748b">${domain}</span>`;
    return `<span class="pay-domain-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>`;
  }

  // Build unified timeline
  const timeline = [];

  // Payments from admin (enrollments, rentals, custom)
  for (const p of payments) {
    const domain = p.reservation_type || 'otros';
    // Skip payment records that are order-type (we handle orders separately below)
    if (domain === 'order') continue;
    timeline.push({
      date: p.payment_date || p.created_at,
      domain,
      concept: p.concept || (domain === 'enrollment' ? 'Pago clase' : domain === 'custom' ? 'Saldo a favor' : 'Pago'),
      amount: Number(p.amount),
      method: p.payment_method || '—',
      source: 'admin',
    });
  }

  // Bookings (surf camp reservations)
  for (const b of bookings) {
    timeline.push({
      date: b.created_at,
      domain: 'booking',
      concept: `Reserva: ${b.surf_camps?.title || 'Surf Camp'}`,
      amount: Number(b.deposit_amount || b.total_amount || 0),
      method: b.notes?.includes('Stripe') ? 'stripe' : 'online',
      source: b.notes?.includes('Stripe') ? 'web' : 'admin',
    });
  }

  // Orders — only product orders (exclude bono orders which are class purchases)
  for (const o of orders) {
    if (bonoOrderIds.has(o.id)) {
      // This is a bono/class purchase order
      timeline.push({
        date: o.created_at,
        domain: 'bono',
        concept: `Bono de clases #${o.id.substring(0, 8)}`,
        amount: Number(o.total),
        method: o.notes?.includes('Stripe') ? 'stripe' : 'online',
        source: 'web',
      });
    } else if (o.status !== 'pending') {
      // Pure product order
      timeline.push({
        date: o.created_at,
        domain: 'order',
        concept: `Pedido #${o.id.substring(0, 8)}`,
        amount: Number(o.total),
        method: o.notes?.includes('Stripe') ? 'stripe' : 'online',
        source: 'web',
      });
    }
  }

  timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Totals by category
  const campTotal = timeline.filter(t => t.domain === 'booking').reduce((s, t) => s + t.amount, 0);
  const servicioTotal = timeline.filter(t => ['enrollment', 'rental', 'bono'].includes(t.domain)).reduce((s, t) => s + t.amount, 0);
  const tiendaTotal = timeline.filter(t => t.domain === 'order').reduce((s, t) => s + t.amount, 0);

  let html = `
    <div class="pay-summary-grid">
      ${campTotal > 0 ? `
      <div class="pay-summary-card" style="border-color:#0ea5e9;background:#f0f9ff">
        <div class="pay-summary-label" style="color:#0369a1">Surf Camps</div>
        <div class="pay-summary-value" style="color:#0369a1">${formatPrice(campTotal)}</div>
        <div class="pay-summary-hint" style="color:#0369a1">${bookings.length} reserva${bookings.length !== 1 ? 's' : ''}</div>
      </div>` : ''}
      <div class="pay-summary-card pay-summary-green">
        <div class="pay-summary-label">Servicios</div>
        <div class="pay-summary-value">${formatPrice(servicioTotal)}</div>
        <div class="pay-summary-hint">Clases, bonos y alquiler</div>
      </div>
      ${tiendaTotal > 0 ? `
      <div class="pay-summary-card" style="border-color:#f59e0b;background:#fffbeb">
        <div class="pay-summary-label" style="color:#92400e">Tienda</div>
        <div class="pay-summary-value" style="color:#92400e">${formatPrice(tiendaTotal)}</div>
        <div class="pay-summary-hint" style="color:#92400e">Pedidos de productos</div>
      </div>` : ''}
      <div class="pay-summary-card ${creditBalance > 0 ? 'pay-summary-yellow' : 'pay-summary-neutral'}">
        <div class="pay-summary-label">Saldo a favor</div>
        <div class="pay-summary-value">${formatPrice(creditBalance)}</div>
        ${creditBalance > 0 ? '<div class="pay-summary-hint">Puedes usar este saldo en tus proximas reservas</div>' : ''}
      </div>
    </div>`;

  if (!timeline.length) {
    html += `<div class="account-form-card"><p style="color:var(--color-muted);margin:0">No tienes pagos registrados todavia.</p></div>`;
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
                <th>Metodo</th>
                <th>Origen</th>
              </tr>
            </thead>
            <tbody>
              ${timeline.map(t => `
                <tr>
                  <td data-label="Fecha">${formatDate(t.date)}</td>
                  <td data-label="Tipo">${domainBadge(t.domain)}</td>
                  <td data-label="Concepto">${t.concept}</td>
                  <td data-label="Importe" class="pay-amount">+${formatPrice(t.amount)}</td>
                  <td data-label="Metodo">${METHOD_LABELS[t.method] || t.method}</td>
                  <td data-label="Origen"><span class="pay-source-badge ${t.source === 'web' ? 'pay-source-web' : ''}">${t.source === 'web' ? 'Web' : 'Escuela'}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  panel.innerHTML = html;
}
