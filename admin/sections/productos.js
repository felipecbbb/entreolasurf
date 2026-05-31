/* ============================================================
   Productos Section — CRUD for store products
   ============================================================ */
import { fetchProducts, upsertProduct, deleteProduct } from '../modules/api.js';
import { renderTable, statusBadge, formatCurrency, openModal, closeModal, showToast } from '../modules/ui.js';

const STATUSES = ['active', 'draft', 'out_of_stock'];

export async function renderProductos(container) {

  async function render() {
    const products = await fetchProducts();

    const toolbar = `
      <div class="admin-toolbar">
        <button class="btn red" id="new-product-btn">+ Nuevo Producto</button>
      </div>`;

    const table = renderTable(
      [
        { label: 'Nombre', key: 'name' },
        { label: 'Precio', render: r => formatCurrency(r.price) },
        { label: 'Stock', key: 'stock' },
        { label: 'Categoría', render: r => r.category || '—' },
        { label: 'Estado', render: r => statusBadge(r.status) }
      ],
      products,
      (row) => `
        <button class="admin-action-btn" data-id="${row.id}" data-action="edit">Editar</button>
        <button class="admin-action-btn danger" data-id="${row.id}" data-action="delete">Eliminar</button>
      `
    );

    container.innerHTML = toolbar + table;

    container.querySelector('#new-product-btn').addEventListener('click', () => openProductModal());

    container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = products.find(x => x.id === btn.dataset.id);
        openProductModal(p);
      });
    });

    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este producto?')) return;
        try {
          await deleteProduct(btn.dataset.id);
          showToast('Producto eliminado', 'success');
          render();
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }
      });
    });
  }

  function sizeRowHtml(size = '', stock = 0) {
    return `
      <div class="size-row" style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
        <input type="text" class="size-name" placeholder="Talla (ej: M, 8 años)" value="${size}" style="flex:1" />
        <input type="number" class="size-stock" placeholder="Stock" value="${stock}" min="0" style="width:90px" />
        <button type="button" class="admin-action-btn danger size-remove" title="Quitar">✕</button>
      </div>`;
  }

  function openProductModal(product = null) {
    const isEdit = !!product;

    const statusOptions = STATUSES.map(s =>
      `<option value="${s}" ${product?.status === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    const sizeStock = Array.isArray(product?.sizes_stock) ? product.sizes_stock : [];
    const sizeRowsHtml = sizeStock.length
      ? sizeStock.map(s => sizeRowHtml(s.size, s.stock)).join('')
      : '';

    openModal(isEdit ? 'Editar Producto' : 'Nuevo Producto', `
      <form id="product-form" class="trip-form">
        <label>Nombre</label>
        <input type="text" name="name" value="${product?.name || ''}" required />

        <label>Slug</label>
        <input type="text" name="slug" value="${product?.slug || ''}" required />

        <label>Descripción</label>
        <textarea name="description">${product?.description || ''}</textarea>

        <label>Precio (€)</label>
        <input type="number" name="price" step="0.01" value="${product?.price || ''}" required />

        <label>Categoría</label>
        <input type="text" name="category" value="${product?.category || ''}" />

        <label>Imagen principal (URL)</label>
        <input type="url" name="image_url" value="${product?.image_url || ''}" />

        <label>Galería (URLs separadas por comas)</label>
        <input type="text" name="gallery" value="${product?.gallery || ''}" placeholder="/uploads/a.jpg, /uploads/b.jpg" />

        <label>Colores (separados por comas)</label>
        <input type="text" name="colors" value="${product?.colors || ''}" placeholder="Negro, Blanco" />

        <label>Tallas y stock</label>
        <div id="sizes-stock-wrap">${sizeRowsHtml}</div>
        <button type="button" class="btn ghost" id="add-size-btn" style="margin:4px 0 8px">+ Añadir talla</button>
        <p style="font-size:.72rem;color:var(--color-muted);margin:0 0 8px">
          Cada talla con su stock. El stock total se calcula automáticamente. Si no añades tallas, se usa el stock simple de abajo.
        </p>

        <label>Stock (sin tallas)</label>
        <input type="number" name="stock" value="${product?.stock ?? 0}" min="0" />

        <label>Estado</label>
        <select name="status">${statusOptions}</select>

        <button type="submit" class="btn red" style="margin-top:12px">${isEdit ? 'Guardar' : 'Crear Producto'}</button>
      </form>
    `);

    const form = document.getElementById('product-form');
    const wrap = form.querySelector('#sizes-stock-wrap');

    form.querySelector('#add-size-btn').addEventListener('click', () => {
      wrap.insertAdjacentHTML('beforeend', sizeRowHtml());
    });
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('.size-remove')) e.target.closest('.size-row').remove();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const obj = Object.fromEntries(fd);

      // Construye sizes_stock desde las filas
      const rows = [...wrap.querySelectorAll('.size-row')];
      const sizesStock = rows
        .map(r => ({
          size: r.querySelector('.size-name').value.trim(),
          stock: Math.max(parseInt(r.querySelector('.size-stock').value, 10) || 0, 0),
        }))
        .filter(s => s.size);

      obj.sizes_stock = sizesStock;
      // Mantiene 'sizes' CSV por compatibilidad y stock total = suma de tallas
      if (sizesStock.length) {
        obj.sizes = sizesStock.map(s => s.size).join(', ');
        obj.stock = sizesStock.reduce((a, s) => a + s.stock, 0);
      } else {
        obj.sizes = null;
        obj.stock = Math.max(parseInt(obj.stock, 10) || 0, 0);
      }

      if (!obj.description) obj.description = null;
      if (!obj.category) obj.category = null;
      if (!obj.image_url) obj.image_url = null;
      if (!obj.gallery) obj.gallery = null;
      if (!obj.colors) obj.colors = null;
      if (isEdit) obj.id = product.id;

      try {
        await upsertProduct(obj);
        closeModal();
        showToast(isEdit ? 'Producto actualizado' : 'Producto creado', 'success');
        render();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  await render();
}
