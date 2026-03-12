import { addItem, updateCartPill } from '/lib/cart.js';

function showToast(msg) {
  let toast = document.querySelector('.cart-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'cart-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

document.querySelectorAll('[data-add-product]').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.addProduct;
    const name = btn.dataset.name;
    const price = Number(btn.dataset.price);
    const sizeSelect = btn.closest('.card')?.querySelector('.size-select');
    const size = sizeSelect ? sizeSelect.value : null;

    addItem({
      id: size ? `${id}-${size}` : id,
      type: 'product',
      name: size ? `${name} (${size})` : name,
      price,
      quantity: 1,
      metadata: size ? { size } : null,
    });

    updateCartPill();
    showToast(`${name} añadido al carrito`);
  });
});
