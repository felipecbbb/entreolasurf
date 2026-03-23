import { getCart, getCartTotal, clearCart, updateCartPill } from '/lib/cart.js';
import { getSession, getProfile } from '/lib/auth-client.js';
import { supabase } from '/lib/supabase.js';

const formWrap = document.getElementById('checkout-form-wrap');
const summaryWrap = document.getElementById('checkout-summary');
const mainEl = document.querySelector('main');

function formatPrice(n) {
  return n.toFixed(2).replace('.', ',') + '€';
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function init() {
  // Check for success return from Stripe
  const params = new URLSearchParams(window.location.search);
  if (params.get('success') === '1') {
    clearCart();
    updateCartPill();
    mainEl.innerHTML = `
      <section class="section" style="padding-top:120px"><div class="container">
        <div class="card confirmation-card">
          <h2>Pago completado</h2>
          <p>Tu pedido ha sido procesado correctamente.</p>
          <p>Recibiras un email de confirmacion con los detalles.</p>
          <div class="hero-actions" style="justify-content:center;margin-top:18px">
            <a class="btn red" href="/">Volver al inicio</a>
            <a class="btn line" href="/mi-cuenta/">Ver mis pedidos</a>
          </div>
        </div>
      </div></section>`;
    return;
  }

  const cart = getCart();
  if (!cart.length) {
    mainEl.innerHTML = `
      <section class="section" style="padding-top:120px"><div class="container">
        <div class="cart-empty">
          <h2>No hay nada que pagar</h2>
          <p>Tu carrito esta vacio.</p>
          <a class="btn red" href="/tienda-2/">Ir a la tienda</a>
        </div>
      </div></section>`;
    return;
  }

  const session = await getSession();
  const hasClassPacks = cart.some(i => i.type === 'class_reservation');

  if (hasClassPacks && !session) {
    const bar = document.getElementById('guest-bar');
    if (bar) bar.style.display = 'flex';
    const msgEl = document.createElement('div');
    msgEl.className = 'card';
    msgEl.style.cssText = 'background:#fff8d6;border:1px solid var(--color-red);padding:16px 20px;margin-bottom:20px;border-radius:var(--radius-md)';
    msgEl.innerHTML = `
      <p style="margin:0;font-weight:600;color:var(--color-navy)">Necesitas una cuenta para comprar packs de clases</p>
      <p style="margin:6px 0 0;font-size:.9rem">Los bonos se vinculan a tu cuenta. <a href="/mi-cuenta/" style="color:var(--color-navy);text-decoration:underline">Inicia sesion o crea una cuenta</a> y vuelve aqui.</p>`;
    if (formWrap) formWrap.prepend(msgEl);
  }

  let profile = null;
  if (session) {
    profile = await getProfile();
  }

  const cartTotal = getCartTotal();
  let appliedCoupon = null;
  let discount = 0;

  // Render summary
  function renderSummary() {
    const summaryItems = cart.map(i => {
      const isClass = i.type === 'class_reservation';
      const name = esc(i.name);
      const label = isClass ? `${name} (anticipo)` : `${name} × ${i.quantity}`;
      return `<div class="summary-item"><span class="name">${label}</span><span class="amt">${formatPrice(i.price * i.quantity)}</span></div>`;
    }).join('');

    const finalTotal = Math.max(cartTotal - discount, 0);

    summaryWrap.innerHTML = `
      <h3>Resumen del pedido</h3>
      ${summaryItems}
      <div class="summary-total"><span>Subtotal</span><span>${formatPrice(cartTotal)}</span></div>
      ${appliedCoupon ? `
        <div class="summary-item" style="color:#166534;font-weight:600">
          <span>Cupon ${esc(appliedCoupon.code)}</span>
          <span>-${formatPrice(discount)}</span>
        </div>` : ''}
      <div class="summary-total summary-final"><span>Total a pagar</span><span>${formatPrice(finalTotal)}</span></div>

      <div class="coupon-form" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--color-line)">
        <label style="font-family:'Space Grotesk',sans-serif;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--color-muted);display:block;margin-bottom:6px">Codigo de descuento</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="coupon-input" placeholder="CODIGO" style="flex:1;border:1px solid var(--color-line);border-radius:8px;padding:8px 12px;font-family:'Manrope',sans-serif;font-size:.88rem;text-transform:uppercase" value="${appliedCoupon?.code || ''}" ${appliedCoupon ? 'disabled' : ''} />
          ${appliedCoupon
            ? '<button type="button" id="coupon-remove" class="btn line" style="font-size:.82rem;padding:8px 14px">Quitar</button>'
            : '<button type="button" id="coupon-apply" class="btn line" style="font-size:.82rem;padding:8px 14px">Aplicar</button>'}
        </div>
        <div id="coupon-msg" style="font-size:.82rem;margin-top:6px"></div>
      </div>`;

    // Coupon events
    document.getElementById('coupon-apply')?.addEventListener('click', async () => {
      const code = document.getElementById('coupon-input')?.value.trim().toUpperCase();
      if (!code) return;
      const msgEl = document.getElementById('coupon-msg');

      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', code)
        .eq('active', true)
        .single();

      if (error || !data) {
        msgEl.textContent = 'Cupon no valido';
        msgEl.style.color = '#b91c1c';
        return;
      }

      const now = new Date();
      if (data.starts_at && new Date(data.starts_at) > now) {
        msgEl.textContent = 'Este cupon aun no esta activo';
        msgEl.style.color = '#b91c1c';
        return;
      }
      if (data.expires_at && new Date(data.expires_at) < now) {
        msgEl.textContent = 'Este cupon ha expirado';
        msgEl.style.color = '#b91c1c';
        return;
      }
      if (data.max_uses && data.used_count >= data.max_uses) {
        msgEl.textContent = 'Este cupon se ha agotado';
        msgEl.style.color = '#b91c1c';
        return;
      }
      if (data.min_amount && cartTotal < Number(data.min_amount)) {
        msgEl.textContent = `Importe minimo: ${Number(data.min_amount).toFixed(2)}€`;
        msgEl.style.color = '#b91c1c';
        return;
      }

      // Check applies_to
      const hasMatchingItem = cart.some(i => {
        if (data.applies_to === 'all') return true;
        if (data.applies_to === 'camps' && i.type === 'camp_reservation') return true;
        if (data.applies_to === 'classes' && i.type === 'class_reservation') {
          if (data.activity_type) return i.metadata?.classType === data.activity_type;
          return true;
        }
        if (data.applies_to === 'products' && i.type === 'product') return true;
        if (data.applies_to === 'rentals' && i.type === 'rental') return true;
        return false;
      });

      if (!hasMatchingItem) {
        msgEl.textContent = 'Este cupon no aplica a los productos de tu carrito';
        msgEl.style.color = '#b91c1c';
        return;
      }

      appliedCoupon = data;
      discount = data.discount_type === 'percentage'
        ? cartTotal * (Number(data.discount_value) / 100)
        : Number(data.discount_value);
      discount = Math.min(discount, cartTotal);

      renderSummary();
    });

    document.getElementById('coupon-remove')?.addEventListener('click', () => {
      appliedCoupon = null;
      discount = 0;
      renderSummary();
    });
  }

  renderSummary();

  // Pre-fill form
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

  // Handle submit → redirect to Stripe Checkout
  document.getElementById('co-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const submitBtn = f.querySelector('button[type="submit"]');

    if (hasClassPacks && !session) {
      alert('Necesitas iniciar sesion para comprar packs de clases.');
      return;
    }

    if (!session) {
      alert('Necesitas iniciar sesion para completar la compra.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Redirigiendo a pago…';

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;

      const response = await supabase.functions.invoke('create-checkout', {
        body: {
          items: cart,
          customer: {
            email: f.email?.value,
            phone: f.telefono?.value,
            address: f.direccion?.value,
            city: f.ciudad?.value,
            postalCode: f.cp?.value,
            notes: f.notas?.value,
          },
          couponCode: appliedCoupon?.code || null,
        },
      });

      if (response.error) throw new Error(response.error.message || 'Error creando sesion de pago');

      const { url } = response.data;
      if (!url) throw new Error('No se recibio URL de pago');

      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Pagar con tarjeta';
      alert('Error: ' + err.message);
    }
  });
}

init();
