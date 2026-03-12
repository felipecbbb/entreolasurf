import { getCart, removeItem, updateQuantity, getCartTotal, updateCartPill } from '/lib/cart.js';

const container = document.getElementById('cart-content');

function badgeClass(type) {
  if (type === 'camp_reservation') return 'camp';
  if (type === 'class_reservation') return 'class';
  if (type === 'rental') return 'rental';
  return 'product';
}

function badgeLabel(type) {
  if (type === 'camp_reservation') return 'Camp';
  if (type === 'class_reservation') return 'Clase';
  if (type === 'rental') return 'Alquiler';
  return 'Producto';
}

function formatPrice(n) {
  return n.toFixed(2).replace('.', ',') + '€';
}

export function renderCart() {
  const cart = getCart();

  if (!cart.length) {
    container.innerHTML = `
      <div class="cart-empty">
        <h2>Tu carrito está vacío</h2>
        <p>Añade productos, clases o reservas de camp para empezar.</p>
        <a class="btn red" href="/tienda-2/">Ir a la tienda</a>
      </div>`;
    return;
  }

  const rows = cart.map(item => `
    <tr>
      <td>
        <span class="cart-item-name">${item.name}</span><br>
        <span class="type-badge ${badgeClass(item.type)}">${badgeLabel(item.type)}</span>
      </td>
      <td>${formatPrice(item.price)}</td>
      <td>
        ${item.type === 'product' ? `
          <div class="qty-controls">
            <button class="qty-btn" data-id="${item.id}" data-delta="-1">−</button>
            <span class="qty-val">${item.quantity}</span>
            <button class="qty-btn" data-id="${item.id}" data-delta="1">+</button>
          </div>` : `<span class="qty-val">${item.quantity}</span>`}
      </td>
      <td>${formatPrice(item.price * item.quantity)}</td>
      <td><button class="cart-remove" data-remove="${item.id}">Eliminar</button></td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table class="cart-table">
        <thead><tr><th>Producto</th><th>Precio</th><th>Cantidad</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="cart-summary">
      <span class="cart-total">Total: ${formatPrice(getCartTotal())}</span>
      <a class="btn line" href="/tienda-2/">Seguir comprando</a>
      <a class="btn red" href="/finalizar-compra/">Finalizar compra</a>
    </div>`;

  container.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const delta = Number(btn.dataset.delta);
      const item = getCart().find(i => i.id === id);
      if (item) {
        updateQuantity(id, item.quantity + delta);
        renderCart();
      }
    });
  });

  container.querySelectorAll('.cart-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      removeItem(btn.dataset.remove);
      renderCart();
    });
  });
}

renderCart();
