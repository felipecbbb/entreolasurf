/* ============================================================
   Surf Camps Section — CRUD for camp editions
   ============================================================ */
import { fetchCamps, upsertCamp, deleteCamp } from '../modules/api.js';
import { renderTable, statusBadge, formatDate, formatCurrency, openModal, closeModal, showToast } from '../modules/ui.js';

const STATUSES = ['open', 'full', 'closed', 'coming_soon'];

export async function renderCamps(container) {

  async function render() {
    const camps = await fetchCamps();

    const toolbar = `
      <div class="admin-toolbar">
        <button class="btn red" id="new-camp-btn">+ Nuevo Camp</button>
      </div>`;

    const table = renderTable(
      [
        { label: 'Título', key: 'title' },
        { label: 'Fechas', render: r => `${formatDate(r.date_start)} — ${formatDate(r.date_end)}` },
        { label: 'Precio', render: r => formatCurrency(r.price) },
        { label: 'Plazas', render: r => `${r.spots_taken}/${r.max_spots}` },
        { label: 'Estado', render: r => statusBadge(r.status) }
      ],
      camps,
      (row) => `
        <button class="admin-action-btn" data-id="${row.id}" data-action="edit">Editar</button>
        <button class="admin-action-btn danger" data-id="${row.id}" data-action="delete">Eliminar</button>
      `
    );

    container.innerHTML = toolbar + table;

    // New camp
    container.querySelector('#new-camp-btn').addEventListener('click', () => openCampModal());

    // Edit
    container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const camp = camps.find(c => c.id === btn.dataset.id);
        openCampModal(camp);
      });
    });

    // Delete
    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este camp? Esta acción no se puede deshacer.')) return;
        try {
          await deleteCamp(btn.dataset.id);
          showToast('Camp eliminado', 'success');
          render();
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }
      });
    });
  }

  function openCampModal(camp = null) {
    const isEdit = !!camp;
    const statusOptions = STATUSES.map(s =>
      `<option value="${s}" ${camp?.status === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    openModal(isEdit ? 'Editar Camp' : 'Nuevo Camp', `
      <form id="camp-form" class="trip-form">
        <label>Título</label>
        <input type="text" name="title" value="${camp?.title || ''}" required />

        <label>Slug</label>
        <input type="text" name="slug" value="${camp?.slug || ''}" required />

        <label>Kicker</label>
        <input type="text" name="kicker" value="${camp?.kicker || ''}" />

        <label>Fecha Inicio</label>
        <input type="date" name="date_start" value="${camp?.date_start || ''}" required />

        <label>Fecha Fin</label>
        <input type="date" name="date_end" value="${camp?.date_end || ''}" required />

        <label>Precio (€)</label>
        <input type="number" name="price" step="0.01" value="${camp?.price || ''}" required />

        <label>Precio Original (€)</label>
        <input type="number" name="original_price" step="0.01" value="${camp?.original_price || ''}" />

        <label>Depósito (€)</label>
        <input type="number" name="deposit" step="0.01" value="${camp?.deposit ?? 180}" required />

        <label>Plazas Máximas</label>
        <input type="number" name="max_spots" value="${camp?.max_spots ?? 17}" required />

        <label>Estado</label>
        <select name="status">${statusOptions}</select>

        <label>Imagen Hero (URL)</label>
        <input type="url" name="hero_image" value="${camp?.hero_image || ''}" />

        <label>Descripción</label>
        <textarea name="description">${camp?.description || ''}</textarea>

        <button type="submit" class="btn red" style="margin-top:12px">${isEdit ? 'Guardar Cambios' : 'Crear Camp'}</button>
      </form>
    `);

    document.getElementById('camp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const obj = Object.fromEntries(fd);

      // Clean up empty optionals
      if (!obj.original_price) obj.original_price = null;
      if (!obj.hero_image) obj.hero_image = null;
      if (!obj.description) obj.description = null;
      if (!obj.kicker) obj.kicker = null;

      if (isEdit) obj.id = camp.id;

      try {
        await upsertCamp(obj);
        closeModal();
        showToast(isEdit ? 'Camp actualizado' : 'Camp creado', 'success');
        render();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  await render();
}
