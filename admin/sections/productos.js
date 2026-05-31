/* ============================================================
   Productos Section — CRUD de productos de la tienda
   Editor a página completa: subida de fotos, variantes con
   stock independiente, colores y galería.
   ============================================================ */
import { fetchProducts, upsertProduct, deleteProduct, uploadProductImage } from '../modules/api.js';
import { renderTable, statusBadge, formatCurrency, showToast } from '../modules/ui.js';

const STATUSES = [
  { v: 'active', l: 'Activo' },
  { v: 'draft', l: 'Borrador' },
  { v: 'out_of_stock', l: 'Agotado' },
];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const csv = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const slugify = (s) => String(s || '').toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export async function renderProductos(container) {

  // ---------------------------------------------------------
  // VISTA LISTA
  // ---------------------------------------------------------
  async function renderList() {
    const products = await fetchProducts();

    const toolbar = `
      <div class="admin-toolbar">
        <button class="btn red" id="new-product-btn">+ Nuevo Producto</button>
      </div>`;

    const table = renderTable(
      [
        { label: 'Producto', render: r => {
          const img = r.image_url
            ? `<img src="${esc(r.image_url)}" alt="" class="prod-list-thumb">`
            : `<span class="prod-list-thumb prod-list-thumb-empty">📦</span>`;
          return `<div class="prod-list-name">${img}<span>${esc(r.name)}</span></div>`;
        } },
        { label: 'Precio', render: r => formatCurrency(r.price) },
        { label: 'Stock', render: r => {
          const ss = Array.isArray(r.sizes_stock) ? r.sizes_stock : [];
          const total = ss.length ? ss.reduce((a, s) => a + (Number(s.stock) || 0), 0) : (r.stock ?? 0);
          return `${total}${ss.length ? ` <span class="prod-list-sub">(${ss.length} var.)</span>` : ''}`;
        } },
        { label: 'Categoría', render: r => esc(r.category || '—') },
        { label: 'Estado', render: r => statusBadge(r.status) }
      ],
      products,
      (row) => `
        <button class="admin-action-btn" data-id="${row.id}" data-action="edit">Editar</button>
        <button class="admin-action-btn danger" data-id="${row.id}" data-action="delete">Eliminar</button>
      `
    );

    container.innerHTML = toolbar + table;

    container.querySelector('#new-product-btn').addEventListener('click', () => renderEditor());

    container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = products.find(x => x.id === btn.dataset.id);
        renderEditor(p);
      });
    });

    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este producto?')) return;
        try {
          await deleteProduct(btn.dataset.id);
          showToast('Producto eliminado', 'success');
          renderList();
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }
      });
    });
  }

  // ---------------------------------------------------------
  // VISTA EDITOR (página completa)
  // ---------------------------------------------------------
  function renderEditor(product = null) {
    const isEdit = !!product;

    // Estado en memoria de los campos compuestos
    const state = {
      image_url: product?.image_url || '',
      gallery: csv(product?.gallery),
      colors: csv(product?.colors),
      variants: (Array.isArray(product?.sizes_stock) ? product.sizes_stock : [])
        .map(s => ({ size: s.size || '', stock: Number(s.stock) || 0 })),
    };

    const statusOptions = STATUSES.map(s =>
      `<option value="${s.v}" ${product?.status === s.v ? 'selected' : ''}>${s.l}</option>`
    ).join('');

    container.innerHTML = `
      <div class="prod-editor">
        <div class="prod-editor-head">
          <button type="button" class="prod-back" id="prod-back">← Volver a productos</button>
          <h2>${isEdit ? 'Editar producto' : 'Nuevo producto'}</h2>
        </div>

        <form id="product-form" class="prod-grid">
          <!-- Columna izquierda: media -->
          <div class="prod-col prod-col-media">
            <section class="prod-card">
              <h3 class="prod-card-title">Imagen principal</h3>
              <div class="prod-dropzone${state.image_url ? ' has-img' : ''}" id="main-drop">
                <img class="prod-main-preview" id="main-preview" src="${esc(state.image_url)}" alt="" ${state.image_url ? '' : 'hidden'}>
                <div class="prod-drop-placeholder" id="main-placeholder" ${state.image_url ? 'hidden' : ''}>
                  <span class="prod-drop-icon">⬆</span>
                  <span class="prod-drop-text">Arrastra una imagen<br>o haz clic para subir</span>
                </div>
                <button type="button" class="prod-img-remove" id="main-remove" ${state.image_url ? '' : 'hidden'} title="Quitar imagen">✕</button>
                <div class="prod-drop-loading" id="main-loading" hidden><span class="prod-spinner"></span></div>
                <input type="file" accept="image/*" id="main-file" hidden>
              </div>
            </section>

            <section class="prod-card">
              <h3 class="prod-card-title">Galería</h3>
              <div class="prod-gallery-grid" id="gallery-grid"></div>
              <button type="button" class="btn ghost prod-add-gallery" id="add-gallery-btn">+ Añadir fotos</button>
              <input type="file" accept="image/*" id="gallery-file" multiple hidden>
            </section>
          </div>

          <!-- Columna derecha: detalles -->
          <div class="prod-col prod-col-main">
            <section class="prod-card">
              <h3 class="prod-card-title">Información</h3>
              <div class="prod-field">
                <label>Nombre</label>
                <input type="text" name="name" value="${esc(product?.name || '')}" required>
              </div>
              <div class="prod-field-row">
                <div class="prod-field">
                  <label>Slug (URL)</label>
                  <input type="text" name="slug" id="slug-input" value="${esc(product?.slug || '')}" required>
                </div>
                <div class="prod-field prod-field-price">
                  <label>Precio (€)</label>
                  <input type="number" name="price" step="0.01" min="0" value="${esc(product?.price ?? '')}" required>
                </div>
              </div>
              <div class="prod-field-row">
                <div class="prod-field">
                  <label>Categoría</label>
                  <input type="text" name="category" value="${esc(product?.category || '')}" placeholder="Camisetas, Accesorios…">
                </div>
                <div class="prod-field prod-field-status">
                  <label>Estado</label>
                  <select name="status">${statusOptions}</select>
                </div>
              </div>
              <div class="prod-field">
                <label>Descripción</label>
                <textarea name="description" rows="4">${esc(product?.description || '')}</textarea>
              </div>
            </section>

            <section class="prod-card">
              <h3 class="prod-card-title">Colores</h3>
              <div class="prod-chips" id="colors-chips"></div>
              <input type="text" class="prod-chip-input" id="color-input" placeholder="Escribe un color y pulsa Enter">
            </section>

            <section class="prod-card">
              <div class="prod-card-title-row">
                <h3 class="prod-card-title">Variantes y stock</h3>
                <span class="prod-stock-total" id="stock-total"></span>
              </div>
              <p class="prod-hint">Cada talla/tipo lleva su stock independiente. Si no añades variantes, se usa el stock general de abajo.</p>
              <div class="prod-var-head">
                <span>Talla / tipo</span><span>Stock</span><span></span>
              </div>
              <div id="variants-wrap"></div>
              <button type="button" class="btn ghost prod-add-var" id="add-variant-btn">+ Añadir variante</button>

              <div class="prod-field prod-simple-stock" id="simple-stock-field">
                <label>Stock general (sin variantes)</label>
                <input type="number" name="stock" value="${esc(product?.stock ?? 0)}" min="0">
              </div>
            </section>
          </div>
        </form>

        <div class="prod-actionbar">
          <button type="button" class="btn line" id="prod-cancel">Cancelar</button>
          <button type="submit" form="product-form" class="btn red" id="prod-save">${isEdit ? 'Guardar cambios' : 'Crear producto'}</button>
        </div>
      </div>
    `;

    const form = container.querySelector('#product-form');
    const slugInput = container.querySelector('#slug-input');
    const nameInput = form.querySelector('[name="name"]');
    const currentSlug = () => slugInput.value.trim() || slugify(nameInput.value) || 'producto';

    // Auto-slug desde el nombre mientras no se haya editado el slug a mano
    let slugTouched = isEdit;
    slugInput.addEventListener('input', () => { slugTouched = true; });
    nameInput.addEventListener('input', () => { if (!slugTouched) slugInput.value = slugify(nameInput.value); });

    // ---- Subida de imagen (helper) ----
    async function uploadFile(file, loadingEl) {
      if (loadingEl) loadingEl.hidden = false;
      try {
        return await uploadProductImage(file, currentSlug());
      } catch (err) {
        showToast('Error al subir la imagen: ' + err.message, 'error');
        return null;
      } finally {
        if (loadingEl) loadingEl.hidden = true;
      }
    }

    // ---- Imagen principal ----
    const mainDrop = container.querySelector('#main-drop');
    const mainFile = container.querySelector('#main-file');
    const mainPreview = container.querySelector('#main-preview');
    const mainPlaceholder = container.querySelector('#main-placeholder');
    const mainRemove = container.querySelector('#main-remove');
    const mainLoading = container.querySelector('#main-loading');

    function paintMain() {
      const has = !!state.image_url;
      mainDrop.classList.toggle('has-img', has);
      mainPreview.hidden = !has;
      mainPreview.src = state.image_url || '';
      mainPlaceholder.hidden = has;
      mainRemove.hidden = !has;
    }
    mainDrop.addEventListener('click', (e) => { if (!e.target.closest('#main-remove')) mainFile.click(); });
    mainFile.addEventListener('change', async () => {
      const file = mainFile.files[0]; mainFile.value = '';
      if (!file) return;
      const url = await uploadFile(file, mainLoading);
      if (url) { state.image_url = url; paintMain(); }
    });
    mainRemove.addEventListener('click', () => { state.image_url = ''; paintMain(); });
    setupDnd(mainDrop, async (files) => {
      const url = await uploadFile(files[0], mainLoading);
      if (url) { state.image_url = url; paintMain(); }
    });

    // ---- Galería ----
    const galleryGrid = container.querySelector('#gallery-grid');
    const galleryFile = container.querySelector('#gallery-file');

    function paintGallery() {
      galleryGrid.innerHTML = state.gallery.map((src, i) => `
        <div class="prod-gallery-item">
          <img src="${esc(src)}" alt="">
          <button type="button" class="prod-img-remove" data-gi="${i}" title="Quitar">✕</button>
        </div>`).join('');
      galleryGrid.querySelectorAll('[data-gi]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.gallery.splice(Number(btn.dataset.gi), 1);
          paintGallery();
        });
      });
    }
    container.querySelector('#add-gallery-btn').addEventListener('click', () => galleryFile.click());
    galleryFile.addEventListener('change', async () => {
      const files = [...galleryFile.files]; galleryFile.value = '';
      for (const file of files) {
        const url = await uploadFile(file);
        if (url) { state.gallery.push(url); paintGallery(); }
      }
    });
    setupDnd(galleryGrid.closest('.prod-card'), async (files) => {
      for (const file of files) {
        const url = await uploadFile(file);
        if (url) { state.gallery.push(url); paintGallery(); }
      }
    });
    paintGallery();
    paintMain();

    // ---- Colores (chips) ----
    const colorsChips = container.querySelector('#colors-chips');
    const colorInput = container.querySelector('#color-input');
    function paintColors() {
      colorsChips.innerHTML = state.colors.map((c, i) =>
        `<span class="prod-chip">${esc(c)}<button type="button" data-ci="${i}">✕</button></span>`).join('');
      colorsChips.querySelectorAll('[data-ci]').forEach(btn => {
        btn.addEventListener('click', () => { state.colors.splice(Number(btn.dataset.ci), 1); paintColors(); });
      });
    }
    function addColor() {
      const v = colorInput.value.trim().replace(/,$/, '');
      if (v && !state.colors.includes(v)) { state.colors.push(v); paintColors(); }
      colorInput.value = '';
    }
    colorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addColor(); }
    });
    colorInput.addEventListener('blur', addColor);
    paintColors();

    // ---- Variantes (talla + stock independiente) ----
    const variantsWrap = container.querySelector('#variants-wrap');
    const stockTotalEl = container.querySelector('#stock-total');
    const simpleStockField = container.querySelector('#simple-stock-field');

    function variantRow(size = '', stock = 0) {
      const row = document.createElement('div');
      row.className = 'prod-var-row';
      row.innerHTML = `
        <input type="text" class="var-size" placeholder="ej: M, 8 años, Talla única" value="${esc(size)}">
        <input type="number" class="var-stock" min="0" value="${esc(stock)}">
        <button type="button" class="prod-var-remove" title="Quitar">✕</button>`;
      row.querySelector('.prod-var-remove').addEventListener('click', () => { row.remove(); refreshVariantUI(); });
      row.querySelector('.var-stock').addEventListener('input', refreshVariantUI);
      row.querySelector('.var-size').addEventListener('input', refreshVariantUI);
      return row;
    }
    function refreshVariantUI() {
      const rows = [...variantsWrap.querySelectorAll('.prod-var-row')];
      const hasVariants = rows.length > 0;
      simpleStockField.style.display = hasVariants ? 'none' : '';
      if (hasVariants) {
        const total = rows.reduce((a, r) => a + (parseInt(r.querySelector('.var-stock').value, 10) || 0), 0);
        stockTotalEl.textContent = `Total: ${total} uds · ${rows.length} variantes`;
      } else {
        stockTotalEl.textContent = '';
      }
    }
    container.querySelector('#add-variant-btn').addEventListener('click', () => {
      variantsWrap.appendChild(variantRow());
      refreshVariantUI();
      variantsWrap.lastChild.querySelector('.var-size').focus();
    });
    state.variants.forEach(v => variantsWrap.appendChild(variantRow(v.size, v.stock)));
    refreshVariantUI();

    // ---- Navegación ----
    container.querySelector('#prod-back').addEventListener('click', renderList);
    container.querySelector('#prod-cancel').addEventListener('click', renderList);

    // ---- Guardar ----
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = container.querySelector('#prod-save');
      const fd = new FormData(form);
      const obj = Object.fromEntries(fd);

      // Variantes desde el DOM
      const rows = [...variantsWrap.querySelectorAll('.prod-var-row')];
      const sizesStock = rows
        .map(r => ({
          size: r.querySelector('.var-size').value.trim(),
          stock: Math.max(parseInt(r.querySelector('.var-stock').value, 10) || 0, 0),
        }))
        .filter(s => s.size);

      obj.sizes_stock = sizesStock;
      if (sizesStock.length) {
        obj.sizes = sizesStock.map(s => s.size).join(', ');
        obj.stock = sizesStock.reduce((a, s) => a + s.stock, 0);
      } else {
        obj.sizes = null;
        obj.stock = Math.max(parseInt(obj.stock, 10) || 0, 0);
      }

      obj.slug = obj.slug?.trim() || slugify(obj.name);
      obj.price = Number(obj.price) || 0;
      obj.image_url = state.image_url || null;
      obj.gallery = state.gallery.length ? state.gallery.join(', ') : null;
      obj.colors = state.colors.length ? state.colors.join(', ') : null;
      if (!obj.description) obj.description = null;
      if (!obj.category) obj.category = null;
      if (isEdit) obj.id = product.id;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';
      try {
        await upsertProduct(obj);
        showToast(isEdit ? 'Producto actualizado' : 'Producto creado', 'success');
        renderList();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Guardar cambios' : 'Crear producto';
      }
    });

    window.scrollTo({ top: 0 });
  }

  // Drag & drop genérico sobre un contenedor → callback(files[])
  function setupDnd(el, onDrop) {
    ['dragenter', 'dragover'].forEach(ev => el.addEventListener(ev, (e) => {
      e.preventDefault(); el.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, (e) => {
      e.preventDefault(); el.classList.remove('dragover');
    }));
    el.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
      if (files.length) onDrop(files);
    });
  }

  await renderList();
}
