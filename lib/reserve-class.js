/* ============================================================
   Reserve Class — adds class pack reservation to cart
   ============================================================ */
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

document.querySelectorAll('[data-reserve-class]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const id = btn.dataset.reserveClass;
    const name = btn.dataset.className;
    const fullPrice = Number(btn.dataset.classPrice);
    const deposit = Number(btn.dataset.classDeposit) || 15;
    const sessions = Number(btn.dataset.classSessions) || 1;
    const classType = btn.dataset.classType || 'grupal';

    addItem({
      id: `class-${classType}-${sessions}`,
      type: 'class_reservation',
      name,
      price: deposit,
      quantity: 1,
      metadata: { classType, sessions, fullPrice, deposit },
    });

    updateCartPill();
    showToast(`${name} añadido al carrito`);
  });
});
