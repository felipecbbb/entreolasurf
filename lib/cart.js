/* ============================================================
   Cart Module — localStorage-based cart state + helpers
   ============================================================ */

// v2: el esquema de variantes de producto cambió (id y metadata color/talla).
// Subir la versión descarta carritos antiguos que romperían el descuento de stock.
const STORAGE_KEY = 'eo_cart_v2';

function read() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

// Limpia el carrito de la versión anterior, si existía
try { localStorage.removeItem('eo_cart'); } catch { /* ignore */ }

function write(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  updateCartPill();
}

/** @returns {{ id:string, type:'product'|'camp_reservation'|'class_reservation', name:string, price:number, quantity:number, metadata?:object }[]} */
export function getCart() {
  return read();
}

/**
 * Add an item to the cart.
 * - Camp reservations: always qty=1, no duplicates (deposit 180€).
 * - Class reservations: no duplicates for same pack.
 * - Products: increment qty if already present.
 */
export function addItem(item) {
  const cart = read();
  const existing = cart.find(i => i.id === item.id);

  if (existing) {
    if (item.type === 'camp_reservation') {
      // Un camp solo entra una vez, pero el cliente puede cambiar de idea sobre
      // cuántas plazas quiere: la última elección manda (no se acumulan).
      existing.quantity = Math.max(1, Number(item.quantity) || 1);
      existing.name = item.name;
      existing.price = Number(item.price);
      existing.metadata = item.metadata || existing.metadata;
      write(cart);
      return cart;
    }
    if (item.type === 'class_reservation' || item.type === 'rental') {
      // Already in cart — don't duplicate
      write(cart);
      return cart;
    }
    existing.quantity += (item.quantity || 1);
  } else {
    cart.push({
      id: item.id,
      type: item.type || 'product',
      name: item.name,
      price: Number(item.price),
      quantity: Math.max(1, Number(item.quantity) || 1),
      metadata: item.metadata || null,
    });
  }

  write(cart);
  return cart;
}

export function removeItem(id) {
  const cart = read().filter(i => i.id !== id);
  write(cart);
  return cart;
}

export function updateQuantity(id, qty) {
  const cart = read();
  const item = cart.find(i => i.id === id);
  if (!item) return cart;
  if (qty <= 0) return removeItem(id);
  item.quantity = qty;
  write(cart);
  return cart;
}

export function clearCart() {
  localStorage.removeItem(STORAGE_KEY);
  updateCartPill();
}

export function getCartCount() {
  return read().reduce((sum, i) => sum + i.quantity, 0);
}

export function getCartTotal() {
  return read().reduce((sum, i) => sum + i.price * i.quantity, 0);
}

/** Update every .cart-pill element in the DOM */
export function updateCartPill() {
  const count = getCartCount();
  document.querySelectorAll('.cart-pill').forEach(el => {
    el.textContent = String(count);
  });
}
