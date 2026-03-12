import { getCart, getCartTotal, clearCart, updateCartPill } from '/lib/cart.js';
import { getSession, getProfile } from '/lib/auth-client.js';
import { supabase } from '/lib/supabase.js';

const formWrap = document.getElementById('checkout-form-wrap');
const summaryWrap = document.getElementById('checkout-summary');
const mainEl = document.querySelector('main');

function formatPrice(n) {
  return n.toFixed(2).replace('.', ',') + '€';
}

// Expiry rules: surf classes = 180 days, other activities = 365 days
function getBonoExpiry(classType) {
  const days = ['grupal', 'individual'].includes(classType) ? 180 : 365;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function init() {
  const cart = getCart();
  if (!cart.length) {
    mainEl.innerHTML = `
      <section class="section" style="padding-top:120px"><div class="container">
        <div class="cart-empty">
          <h2>No hay nada que pagar</h2>
          <p>Tu carrito está vacío.</p>
          <a class="btn red" href="/tienda-2/">Ir a la tienda</a>
        </div>
      </div></section>`;
    return;
  }

  // Check if cart has class packs and user is not logged in
  const session = await getSession();
  const hasClassPacks = cart.some(i => i.type === 'class_reservation');

  if (hasClassPacks && !session) {
    const bar = document.getElementById('guest-bar');
    if (bar) bar.style.display = 'flex';
    // Show login requirement message
    const msgEl = document.createElement('div');
    msgEl.className = 'card';
    msgEl.style.cssText = 'background:#fff8d6;border:1px solid var(--color-red);padding:16px 20px;margin-bottom:20px;border-radius:var(--radius-md)';
    msgEl.innerHTML = `
      <p style="margin:0;font-weight:600;color:var(--color-navy)">Necesitas una cuenta para comprar packs de clases</p>
      <p style="margin:6px 0 0;font-size:.9rem">Los bonos de créditos se vinculan a tu cuenta para que puedas reservar clases. <a href="/mi-cuenta/" style="color:var(--color-navy);text-decoration:underline">Inicia sesión o crea una cuenta</a> y vuelve aquí.</p>`;
    if (formWrap) formWrap.prepend(msgEl);
  }

  // Render summary
  const summaryItems = cart.map(i => {
    const isClass = i.type === 'class_reservation';
    const label = isClass ? `${i.name} (anticipo)` : `${i.name} × ${i.quantity}`;
    return `<div class="summary-item"><span class="name">${label}</span><span class="amt">${formatPrice(i.price * i.quantity)}</span></div>`;
  }).join('');
  summaryWrap.innerHTML = `
    <h3>Resumen del pedido</h3>
    ${summaryItems}
    <div class="summary-total"><span>Total</span><span>${formatPrice(getCartTotal())}</span></div>`;

  // Pre-fill if logged in
  let profile = null;
  if (session) {
    profile = await getProfile();
  }

  if (!session) {
    const bar = document.getElementById('guest-bar');
    if (bar) bar.style.display = 'flex';
  }

  if (profile) {
    const f = document.getElementById('co-form');
    if (f) {
      if (profile.full_name) f.nombre.value = profile.full_name;
      if (session.user.email) f.email.value = session.user.email;
      if (profile.phone) f.telefono.value = profile.phone;
      if (profile.address && f.direccion) f.direccion.value = profile.address;
      if (profile.city && f.ciudad) f.ciudad.value = profile.city;
      if (profile.postal_code && f.cp) f.cp.value = profile.postal_code;
    }
  }

  // Handle submit
  document.getElementById('co-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const submitBtn = f.querySelector('button[type="submit"]');

    // Block checkout if class packs and not logged in
    if (hasClassPacks && !session) {
      alert('Necesitas iniciar sesión para comprar packs de clases. Ve a "Mi cuenta" para registrarte o iniciar sesión.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando…';

    // orders table only has: user_id, status, total, shipping_address, notes
    if (!session) {
      alert('Necesitas iniciar sesión para completar la compra.');
      submitBtn.disabled = false; submitBtn.textContent = 'Confirmar pedido';
      return;
    }

    const orderData = {
      user_id: session.user.id,
      status: 'paid',
      total: getCartTotal(),
      shipping_address: [f.direccion?.value, f.ciudad?.value, f.cp?.value].filter(Boolean).join(', ') || null,
      notes: f.notas?.value || null,
    };

    try {
      // Save address/phone to profile for future orders
      if (session) {
        const profileUpdate = {};
        if (f.telefono?.value) profileUpdate.phone = f.telefono.value;
        if (f.direccion?.value) profileUpdate.address = f.direccion.value;
        if (f.ciudad?.value) profileUpdate.city = f.ciudad.value;
        if (f.cp?.value) profileUpdate.postal_code = f.cp.value;
        if (Object.keys(profileUpdate).length) {
          await supabase.from('profiles').update(profileUpdate).eq('id', session.user.id);
        }
      }

      // Create order
      const { data: order, error } = await supabase
        .from('orders')
        .insert(orderData)
        .select()
        .single();
      if (error) throw error;

      // Create bookings for camp reservations
      const camps = cart.filter(i => i.type === 'camp_reservation');
      for (const camp of camps) {
        const booking = {
          user_id: session.user.id,
          camp_id: camp.metadata?.campId,
          deposit_amount: camp.price,
          total_amount: camp.metadata?.totalAmount || camp.price,
          status: 'deposit_paid',
          notes: `Pedido #${order.id.slice(0, 8)}`,
        };
        if (booking.camp_id) {
          await supabase.from('bookings').insert(booking);
        }
      }

      // Create BONOS for class reservations (instead of class_bookings)
      const classes = cart.filter(i => i.type === 'class_reservation');
      for (const cls of classes) {
        const classType = cls.metadata?.classType || 'grupal';
        const sessions = cls.metadata?.sessions || 1;
        const bono = {
          user_id: session.user.id,
          order_id: order.id,
          class_type: classType,
          total_credits: sessions * cls.quantity,
          used_credits: 0,
          total_paid: cls.price * cls.quantity,
          status: 'active',
          expires_at: getBonoExpiry(classType),
        };
        await supabase.from('bonos').insert(bono);
      }

      clearCart();
      updateCartPill();

      mainEl.innerHTML = `
        <section class="section" style="padding-top:120px"><div class="container">
          <div class="card confirmation-card">
            <h2>Pedido confirmado</h2>
            <p>Tu pedido <strong>#${order.id.slice(0, 8)}</strong> ha sido registrado correctamente.</p>
            <p>Recibirás un email de confirmación en <strong>${f.email.value}</strong>.</p>
            ${classes.length ? '<p style="margin-top:8px"><strong>Tus bonos de clases</strong> ya están activos. Ve a <a href="/mi-cuenta/" style="color:var(--color-navy);text-decoration:underline">Mi cuenta</a> para reservar tus clases en el calendario.</p>' : ''}
            <div class="hero-actions" style="justify-content:center;margin-top:18px">
              <a class="btn red" href="/">Volver al inicio</a>
              <a class="btn line" href="/mi-cuenta/">Ver mis pedidos</a>
            </div>
          </div>
        </div></section>`;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmar pedido';
      alert('Error al crear el pedido: ' + err.message);
    }
  });
}

init();
