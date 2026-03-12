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

  function openProductModal(product = null) {
    const isEdit = !!product;

    const statusOptions = STATUSES.map(s =>
      `<option value="${s}" ${product?.status === s ? 'selected' : ''}>${s}</option>`
    ).join('');

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

        <label>Stock</label>
        <input type="number" name="stock" value="${product?.stock ?? 0}" required />

        <label>Categoría</label>
        <input type="text" name="category" value="${product?.category || ''}" />

        <label>Imagen (URL)</label>
        <input type="url" name="image_url" value="${product?.image_url || ''}" />

        <label>Estado</label>
        <select name="status">${statusOptions}</select>

        <button type="submit" class="btn red" style="margin-top:12px">${isEdit ? 'Guardar' : 'Crear Producto'}</button>
      </form>
    `);

    document.getElementById('product-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const obj = Object.fromEntries(fd);

      if (!obj.description) obj.description = null;
      if (!obj.category) obj.category = null;
      if (!obj.image_url) obj.image_url = null;
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
