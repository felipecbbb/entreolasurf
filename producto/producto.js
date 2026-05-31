/* ============================================================
   Página de producto (PDP) — detalle individual desde Supabase
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { addItem, updateCartPill } from '/lib/cart.js';
import { openCartDrawer } from '/lib/cart-drawer.js';

function csv(s) { return (s || '').split(',').map(x => x.trim()).filter(Boolean); }

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

function formatPrice(price) {
  const num = Number(price);
  const whole = Math.floor(num);
  const dec = Math.round((num - whole) * 100);
  if (dec === 0) return `${whole}<span class="decimals">,00€</span>`;
  return `${whole}<span class="decimals">,${String(dec).padStart(2, '0')}€</span>`;
}

async function loadProduct(slug, id) {
  let q = supabase.from('products').select('*').eq('status', 'active').limit(1);
  q = slug ? q.eq('slug', slug) : q.eq('id', id);
  const { data, error } = await q;
  if (error) { console.error('Error loading product:', error.message); return null; }
  return (data && data[0]) || null;
}

function render(product) {
  const root = document.getElementById('pdp-root');

  const sizeStock = Array.isArray(product.sizes_stock) ? product.sizes_stock : [];
  const hasSizes = sizeStock.length > 0;
  const totalSizeStock = sizeStock.reduce((a, s) => a + (Number(s.stock) || 0), 0);
  const isOutOfStock = hasSizes ? totalSizeStock <= 0 : (product.stock !== null && product.stock <= 0);

  const gallery = csv(product.gallery);
  const images = product.image_url
    ? [product.image_url, ...gallery.filter(g => g !== product.image_url)]
    : gallery;
  const mainImg = images[0] || '';
  const colors = csv(product.colors);

  document.title = `${product.name} | Entre Olas`;

  const thumbsHtml = images.length > 1
    ? `<div class="pdp-thumbs">${images.map((src, i) =>
        `<button type="button" class="pdp-thumb${i === 0 ? ' active' : ''}" data-src="${src}"><img src="${src}" alt="" loading="lazy"></button>`).join('')}</div>`
    : '';

  const colorHtml = colors.length
    ? `<div class="pdp-variant"><span class="pdp-variant-label">Color</span>
        <div class="pdp-colors">${colors.map((c, i) => `<button type="button" class="pdp-color${i === 0 ? ' active' : ''}" data-color="${c}">${c}</button>`).join('')}</div>
      </div>`
    : '';

  const sizeHtml = hasSizes
    ? `<div class="pdp-variant"><span class="pdp-variant-label">Talla</span>
        <select class="pdp-size"><option value="">Elige tu talla</option>${sizeStock.map(s => {
          const out = (Number(s.stock) || 0) <= 0;
          return `<option value="${s.size}" data-stock="${Number(s.stock) || 0}"${out ? ' disabled' : ''}>${s.size}${out ? ' — agotado' : ''}</option>`;
        }).join('')}</select>
      </div>`
    : '';

  const categoryHtml = product.category ? `<span class="pdp-category">${product.category}</span>` : '';
  const descHtml = product.description ? `<p class="pdp-desc">${product.description}</p>` : '';

  const actionsHtml = isOutOfStock
    ? `<button class="btn red pdp-add" disabled>Agotado</button>`
    : `<div class="pdp-actions">
        <button class="btn line pdp-add" data-mode="cart">Añadir al carrito</button>
        <button class="btn red pdp-buy" data-mode="buy">Comprar ahora</button>
      </div>`;

  root.innerHTML = `
    <div class="pdp-gallery">
      <div class="pdp-main-wrap">
        <img class="pdp-main-img" src="${mainImg}" alt="${product.name}">
      </div>
      ${thumbsHtml}
    </div>
    <div class="pdp-info">
      ${categoryHtml}
      <h1 class="pdp-name">${product.name}</h1>
      <div class="pdp-price">${formatPrice(product.price)}</div>
      ${descHtml}
      ${colorHtml}
      ${sizeHtml}
      ${actionsHtml}
      <div class="pdp-trust">
        <span>✓ Envío a toda España</span>
        <span>✓ Pago seguro</span>
      </div>
    </div>`;

  // ---- Galería ----
  root.querySelectorAll('.pdp-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      root.querySelector('.pdp-main-img').src = thumb.dataset.src;
      root.querySelectorAll('.pdp-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });

  // ---- Color ----
  root.querySelectorAll('.pdp-color').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.pdp-color').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ---- Añadir / Comprar ----
  function buildItem() {
    const sizeSel = root.querySelector('.pdp-size');
    const size = hasSizes ? (sizeSel?.value || '') : '';
    if (hasSizes && !size) {
      showToast('Elige una talla');
      if (sizeSel) { sizeSel.classList.add('pdp-size--error'); sizeSel.focus(); setTimeout(() => sizeSel.classList.remove('pdp-size--error'), 1500); }
      return null;
    }
    if (hasSizes) {
      const left = Number(sizeSel?.selectedOptions?.[0]?.dataset.stock || 0);
      if (left <= 0) { showToast('Esa talla está agotada'); return null; }
    }
    const color = colors.length ? (root.querySelector('.pdp-color.active')?.dataset.color || colors[0]) : '';
    const variantParts = [color, size && `Talla ${size}`].filter(Boolean);
    const displayName = variantParts.length ? `${product.name} · ${variantParts.join(' · ')}` : product.name;
    const variantId = [product.slug || product.id, color, size].filter(Boolean).join('-').toLowerCase().replace(/\s+/g, '-');
    return {
      id: variantId,
      type: 'product',
      name: displayName,
      price: Number(product.price),
      quantity: 1,
      metadata: { productId: product.id, color, size },
    };
  }

  root.querySelector('.pdp-add')?.addEventListener('click', () => {
    const item = buildItem();
    if (!item) return;
    addItem(item);
    updateCartPill();
    openCartDrawer();
  });

  root.querySelector('.pdp-buy')?.addEventListener('click', () => {
    const item = buildItem();
    if (!item) return;
    addItem(item);
    updateCartPill();
    window.location.href = '/finalizar-compra/';
  });
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const id = params.get('id');
  if (!slug && !id) { fail(); return; }

  const product = await loadProduct(slug, id);
  if (!product) { fail(); return; }
  render(product);
}

function fail() {
  document.getElementById('pdp-root').style.display = 'none';
  document.getElementById('pdp-notfound').style.display = '';
}

init();
