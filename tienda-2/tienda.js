/* ============================================================
   Tienda — Dynamic product grid from Supabase
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { addItem, updateCartPill } from '/lib/cart.js';

// ---- Toast ----
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

// ---- Fetch products ----
async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading products:', error.message);
    return [];
  }
  return data || [];
}

// ---- Format price ----
function formatPrice(price) {
  const num = Number(price);
  const whole = Math.floor(num);
  const dec = Math.round((num - whole) * 100);
  if (dec === 0) return `${whole}<span class="decimals">,00€</span>`;
  return `${whole}<span class="decimals">,${String(dec).padStart(2, '0')}€</span>`;
}

// ---- Render product card ----
function renderCard(product) {
  const hasImage = !!product.image_url;
  const isOutOfStock = product.stock !== null && product.stock <= 0;
  const isLowStock = product.stock !== null && product.stock > 0 && product.stock <= 3;

  let badgeHtml = '';
  if (isOutOfStock) badgeHtml = '<span class="shop-card-badge out-of-stock">Agotado</span>';
  else if (isLowStock) badgeHtml = `<span class="shop-card-badge low-stock">Quedan ${product.stock}</span>`;

  const imgHtml = hasImage
    ? `<img src="${product.image_url}" alt="${product.name}" loading="lazy">`
    : `<div class="shop-card-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg></div>`;

  const categoryHtml = product.category
    ? `<span class="shop-card-category">${product.category}</span>`
    : '';

  const descHtml = product.description
    ? `<p class="shop-card-desc">${product.description}</p>`
    : '';

  const btnHtml = isOutOfStock
    ? `<button class="shop-card-add" disabled>Agotado</button>`
    : `<button class="shop-card-add" data-product-id="${product.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Añadir</span>
      </button>`;

  return `
    <article class="shop-card${isOutOfStock ? ' shop-card--sold-out' : ''}" data-category="${product.category || ''}">
      <div class="shop-card-img">
        ${imgHtml}
        ${badgeHtml}
      </div>
      <div class="shop-card-body">
        ${categoryHtml}
        <h3 class="shop-card-name">${product.name}</h3>
        ${descHtml}
        <div class="shop-card-footer">
          <span class="shop-card-price">${formatPrice(product.price)}</span>
          ${btnHtml}
        </div>
      </div>
    </article>`;
}

// ---- Render grid ----
async function init() {
  const grid = document.getElementById('shop-grid');
  const empty = document.getElementById('shop-empty');
  const filterBar = document.querySelector('.shop-filter-bar');
  if (!grid) return;

  const products = await loadProducts();

  if (!products.length) {
    grid.style.display = 'none';
    empty.style.display = '';
    return;
  }

  // Build category filters
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  categories.forEach(cat => {
    const pill = document.createElement('button');
    pill.className = 'shop-filter-pill';
    pill.dataset.cat = cat;
    pill.textContent = cat;
    filterBar.appendChild(pill);
  });

  // Render all cards
  grid.innerHTML = products.map(renderCard).join('');

  // Stagger entrance animation
  grid.querySelectorAll('.shop-card').forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    setTimeout(() => {
      card.style.transition = 'opacity .4s ease, transform .4s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 60 * i);
  });

  // ---- Add to cart ----
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.shop-card-add');
    if (!btn || btn.disabled) return;

    const productId = btn.dataset.productId;
    const product = products.find(p => p.id === productId);
    if (!product) return;

    addItem({
      id: product.slug || product.id,
      type: 'product',
      name: product.name,
      price: Number(product.price),
      quantity: 1,
      metadata: { productId: product.id },
    });

    updateCartPill();

    // Button feedback
    const original = btn.innerHTML;
    btn.classList.add('added');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> <span>Añadido</span>`;
    setTimeout(() => {
      btn.classList.remove('added');
      btn.innerHTML = original;
    }, 1500);

    showToast(`${product.name} añadido al carrito`);
  });

  // ---- Category filter ----
  filterBar.addEventListener('click', (e) => {
    const pill = e.target.closest('.shop-filter-pill');
    if (!pill) return;

    filterBar.querySelectorAll('.shop-filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');

    const cat = pill.dataset.cat;
    grid.querySelectorAll('.shop-card').forEach(card => {
      if (cat === 'all' || card.dataset.category === cat) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  });
}

init();
