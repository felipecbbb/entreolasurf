/* ============================================================
   Reservas Section — Camp bookings grouped by camp
   ============================================================ */
import { fetchBookings, fetchCamps, updateBookingStatus } from '../modules/api.js';
import { statusBadge, formatDate, formatCurrency, openModal, closeModal, showToast } from '../modules/ui.js';

const STATUSES = ['pending', 'deposit_paid', 'fully_paid', 'cancelled', 'refunded'];
const STATUS_LABELS = {
  pending: 'Pendiente', deposit_paid: 'Señal pagada', fully_paid: 'Pagado',
  cancelled: 'Cancelado', refunded: 'Reembolsado'
};

const esc = s => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';

export async function renderReservas(container) {
  let campFilter = '';
  let statusFilter = '';

  async function render() {
    const [bookings, camps] = await Promise.all([fetchBookings(), fetchCamps()]);

    // Apply filters
    let filtered = bookings;
    if (campFilter) filtered = filtered.filter(b => b.camp_id === campFilter);
    if (statusFilter) filtered = filtered.filter(b => b.status === statusFilter);

    // Camp options for dropdown
    const campOptions = camps.map(c =>
      `<option value="${c.id}" ${campFilter === c.id ? 'selected' : ''}>${esc(c.title)}</option>`
    ).join('');

    const statusOptions = STATUSES.map(s =>
      `<option value="${s}" ${statusFilter === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`
    ).join('');

    // Group by camp
    const byCamp = {};
    filtered.forEach(b => {
      const cid = b.camp_id || 'unknown';
      if (!byCamp[cid]) byCamp[cid] = { camp: b.surf_camps || { title: 'Desconocido' }, bookings: [] };
      byCamp[cid].bookings.push(b);
    });

    // Stats
    const totalRevenue = filtered.filter(b => ['deposit_paid', 'fully_paid'].includes(b.status))
      .reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const totalDeposits = filtered.filter(b => ['deposit_paid', 'fully_paid'].includes(b.status))
      .reduce((s, b) => s + Number(b.deposit_amount || 0), 0);

    container.innerHTML = `
      <div class="admin-toolbar" style="margin-bottom:20px">
        <select class="admin-filter" id="rv-camp-filter">
          <option value="">Todos los camps</option>
          ${campOptions}
        </select>
        <select class="admin-filter" id="rv-status-filter">
          <option value="">Todos los estados</option>
          ${statusOptions}
        </select>
        <div style="margin-left:auto;display:flex;gap:16px;align-items:center">
          <span style="font-family:'Space Grotesk',sans-serif;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--color-muted)">${filtered.length} reserva${filtered.length !== 1 ? 's' : ''}</span>
          <span style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;color:var(--color-navy)">${formatCurrency(totalRevenue)}</span>
        </div>
      </div>

      ${Object.keys(byCamp).length === 0 ? `
        <div class="sc-empty">
          <p>No hay reservas${campFilter || statusFilter ? ' con estos filtros' : ''}</p>
        </div>
      ` : ''}

      ${Object.values(byCamp).map(group => {
        const c = group.camp;
        const paidCount = group.bookings.filter(b => ['deposit_paid', 'fully_paid'].includes(b.status)).length;
        const groupRevenue = group.bookings.filter(b => ['deposit_paid', 'fully_paid'].includes(b.status))
          .reduce((s, b) => s + Number(b.total_amount || 0), 0);

        return `
          <div class="rv-camp-group">
            <div class="rv-camp-header">
              <div class="rv-camp-info">
                <h3 class="rv-camp-title">${esc(c.title || 'Camp desconocido')}</h3>
                <span class="rv-camp-meta">${c.date_start ? formatDate(c.date_start) + ' — ' + formatDate(c.date_end) : ''}</span>
              </div>
              <div class="rv-camp-stats">
                <div class="rv-stat">
                  <span class="rv-stat-value">${paidCount}</span>
                  <span class="rv-stat-label">Confirmadas</span>
                </div>
                <div class="rv-stat">
                  <span class="rv-stat-value">${c.spots_taken || 0}/${c.max_spots || '?'}</span>
                  <span class="rv-stat-label">Plazas</span>
                </div>
                <div class="rv-stat">
                  <span class="rv-stat-value">${formatCurrency(groupRevenue)}</span>
                  <span class="rv-stat-label">Ingresos</span>
                </div>
              </div>
            </div>

            <div class="rv-bookings-list">
              ${group.bookings.map(b => `
                <div class="rv-booking-row">
                  <div class="rv-booking-client">
                    <strong>${esc(b.profiles?.full_name || 'Sin nombre')}</strong>
                    <span class="rv-booking-phone">${esc(b.profiles?.phone || '')}</span>
                  </div>
                  <div class="rv-booking-amounts">
                    <span class="rv-booking-deposit">Señal: ${formatCurrency(b.deposit_amount)}</span>
                    <span class="rv-booking-total">Total: ${formatCurrency(b.total_amount)}</span>
                  </div>
                  <div>${statusBadge(b.status)}</div>
                  <div class="rv-booking-date">${formatDate(b.created_at)}</div>
                  <div>
                    <button class="admin-action-btn rv-status-btn" data-id="${b.id}">Estado</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>`;
      }).join('')}
    `;

    // Event handlers
    container.querySelector('#rv-camp-filter')?.addEventListener('change', e => { campFilter = e.target.value; render(); });
    container.querySelector('#rv-status-filter')?.addEventListener('change', e => { statusFilter = e.target.value; render(); });

    container.querySelectorAll('.rv-status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const booking = filtered.find(b => b.id === btn.dataset.id);
        if (booking) openStatusModal(booking);
      });
    });
  }

  function openStatusModal(booking) {
    const options = STATUSES.map(s =>
      `<option value="${s}" ${booking.status === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`
    ).join('');

    openModal('Cambiar Estado', `
      <div class="trip-form">
        <label>Cliente</label>
        <input type="text" value="${esc(booking.profiles?.full_name || '—')}" disabled />
        <label>Camp</label>
        <input type="text" value="${esc(booking.surf_camps?.title || '—')}" disabled />
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
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  }

  await render();
}
