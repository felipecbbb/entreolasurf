/* ============================================================
   Reservas Section — Camp booking management
   ============================================================ */
import { fetchBookings, updateBookingStatus } from '../modules/api.js';
import { renderTable, statusBadge, formatDate, formatCurrency, openModal, closeModal, showToast } from '../modules/ui.js';
import { navigate } from '../modules/router.js';

const STATUSES = ['pending', 'deposit_paid', 'fully_paid', 'cancelled', 'refunded'];

export async function renderReservas(container) {
  let currentFilter = '';

  async function render() {
    const bookings = await fetchBookings(currentFilter || undefined);

    const filterOptions = STATUSES.map(s =>
      `<option value="${s}" ${currentFilter === s ? 'selected' : ''}>${statusLabel(s)}</option>`
    ).join('');

    const toolbar = `
      <div class="admin-toolbar">
        <select class="admin-filter" id="reservas-filter">
          <option value="">Todos los estados</option>
          ${filterOptions}
        </select>
      </div>`;

    const table = renderTable(
      [
        { label: 'Cliente', render: r => r.profiles?.full_name || '—' },
        { label: 'Teléfono', render: r => r.profiles?.phone || '—' },
        { label: 'Camp', render: r => r.surf_camps?.title || '—' },
        { label: 'Estado', render: r => statusBadge(r.status) },
        { label: 'Monto', render: r => formatCurrency(r.total_amount) },
        { label: 'Fecha', render: r => formatDate(r.created_at) }
      ],
      bookings,
      (row) => `<button class="admin-action-btn" data-id="${row.id}" data-action="edit-status">Estado</button>`
    );

    container.innerHTML = toolbar + table;

    // Filter handler
    container.querySelector('#reservas-filter').addEventListener('change', (e) => {
      currentFilter = e.target.value;
      render();
    });

    // Edit status buttons
    container.querySelectorAll('[data-action="edit-status"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const booking = bookings.find(b => b.id === btn.dataset.id);
        openStatusModal(booking);
      });
    });
  }

  function openStatusModal(booking) {
    const options = STATUSES.map(s =>
      `<option value="${s}" ${booking.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`
    ).join('');

    openModal('Cambiar Estado de Reserva', `
      <div class="trip-form">
        <label>Cliente</label>
        <input type="text" value="${booking.profiles?.full_name || '—'}" disabled />

        <label>Camp</label>
        <input type="text" value="${booking.surf_camps?.title || '—'}" disabled />

        <label>Monto</label>
        <input type="text" value="${formatCurrency(booking.total_amount)}" disabled />

        <label>Nuevo Estado</label>
        <select id="modal-status">${options}</select>

        <button class="btn red" id="modal-save" style="margin-top:12px">Guardar</button>
      </div>
    `);

    document.getElementById('modal-save').addEventListener('click', async () => {
      const newStatus = document.getElementById('modal-status').value;
      try {
        await updateBookingStatus(booking.id, newStatus);
        closeModal();
        showToast('Estado actualizado', 'success');
        render();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  await render();
}

function statusLabel(s) {
  const map = {
    pending: 'Pendiente', deposit_paid: 'Señal pagada', fully_paid: 'Pagado',
    cancelled: 'Cancelado', refunded: 'Reembolsado'
  };
  return map[s] || s;
}
