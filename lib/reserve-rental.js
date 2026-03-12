/* ============================================================
   Reserve Rental — adds equipment rental to cart
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

// Duration selector: clicking a duration button updates the active state
// and sets the card's selected price + duration
document.querySelectorAll('.rental-dur-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const card = btn.closest('.pack-card');
    card.querySelectorAll('.rental-dur-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Set first duration as active by default
document.querySelectorAll('.pack-card[data-rental]').forEach(card => {
  const first = card.querySelector('.rental-dur-btn');
  if (first) first.classList.add('active');
});

// Reserve button
document.querySelectorAll('[data-add-rental]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const card = btn.closest('.pack-card');
    const activeDur = card.querySelector('.rental-dur-btn.active');
    if (!activeDur) return;

    const itemName = card.dataset.rentalName;
    const duration = activeDur.dataset.duration;
    const price = Number(activeDur.dataset.price);
    const id = `rental-${itemName.toLowerCase().replace(/\s+/g, '-')}-${duration}`;

    addItem({
      id,
      type: 'rental',
      name: `${itemName} — ${activeDur.dataset.durationLabel}`,
      price,
      quantity: 1,
      metadata: { item: itemName, duration },
    });

    updateCartPill();
    showToast(`${itemName} (${activeDur.dataset.durationLabel}) añadido al carrito`);
  });
});
