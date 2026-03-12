/**
 * Shared utility functions and constants for Entre Olas Surf.
 * Centralises helpers previously duplicated across multiple files.
 */

// ---- HTML escape ----
export function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Price formatting (Spanish locale) ----
export function formatPrice(n) {
  return Number(n).toFixed(2).replace('.', ',') + '\u20ac';
}

// ---- Date formatting (Spanish locale) ----
export function formatDate(d) {
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Activity type labels ----
export const TYPE_LABELS = {
  grupal: 'Surf Grupal',
  individual: 'Surf Individual',
  yoga: 'Yoga',
  paddle: 'Paddle Surf',
  surfskate: 'SurfSkate',
};

// ---- Payment method labels ----
export const METHOD_LABELS = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  voucher: 'Voucher',
  online: 'Online',
  saldo: 'Saldo',
};

// ---- Toast notification ----
export function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
