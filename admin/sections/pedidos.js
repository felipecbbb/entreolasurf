/* ============================================================
   Pedidos Section — Order management
   ============================================================ */
import { fetchOrders, fetchOrderItems, updateOrderStatus } from '../modules/api.js';
import { renderTable, statusBadge, formatDate, formatCurrency, openModal, closeModal, showToast } from '../modules/ui.js';

const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

export async function renderPedidos(container) {

  async function render() {
    const orders = await fetchOrders();

    const table = renderTable(
      [
        { label: 'Cliente', render: r => r.profiles?.full_name || '—' },
        { label: 'Total', render: r => formatCurrency(r.total) },
        { label: 'Estado', render: r => statusBadge(r.status) },
        { label: 'Dirección', render: r => r.shipping_address ? r.shipping_address.substring(0, 40) + (r.shipping_address.length > 40 ? '…' : '') : '—' },
        { label: 'Fecha', render: r => formatDate(r.created_at) }
      ],
      orders,
      (row) => `
        <button class="admin-action-btn" data-id="${row.id}" data-action="detail">Detalle</button>
        <button class="admin-action-btn" data-id="${row.id}" data-action="status">Estado</button>
      `
    );

    container.innerHTML = table;

    // Detail modal
    container.querySelectorAll('[data-action="detail"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const order = orders.find(o => o.id === btn.dataset.id);
        await openDetailModal(order);
      });
    });

    // Status modal
    container.querySelectorAll('[data-action="status"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const order = orders.find(o => o.id === btn.dataset.id);
        openStatusModal(order);
      });
    });
  }

  async function openDetailModal(order) {
    const items = await fetchOrderItems(order.id);

    const itemsHTML = items.length
      ? `<table style="width:100%;border-collapse:collapse;margin-top:12px">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #eee9da;font-family:'Space Grotesk',sans-serif;font-size:.72rem;text-transform:uppercase">Producto</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #eee9da;font-family:'Space Grotesk',sans-serif;font-size:.72rem;text-transform:uppercase">Cant.</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #eee9da;font-family:'Space Grotesk',sans-serif;font-size:.72rem;text-transform:uppercase">Precio</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #eee9da;font-family:'Space Grotesk',sans-serif;font-size:.72rem;text-transform:uppercase">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(i => `
              <tr>
                <td style="padding:8px;border-bottom:1px solid #f3f1e8">${i.products?.name || '—'}</td>
                <td style="padding:8px;border-bottom:1px solid #f3f1e8">${i.quantity}</td>
                <td style="padding:8px;border-bottom:1px solid #f3f1e8">${formatCurrency(i.unit_price)}</td>
                <td style="padding:8px;border-bottom:1px solid #f3f1e8">${formatCurrency(i.quantity * i.unit_price)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`
      : '<p style="color:var(--color-muted);margin-top:12px">No hay items en este pedido</p>';

    openModal('Detalle del Pedido', `
      <div class="trip-form">
        <label>Cliente</label>
        <input type="text" value="${order.profiles?.full_name || '—'}" disabled />

        <label>Estado</label>
        <div style="margin-bottom:8px">${statusBadge(order.status)}</div>

        <label>Total</label>
        <input type="text" value="${formatCurrency(order.total)}" disabled />

        <label>Dirección de envío</label>
        <input type="text" value="${order.shipping_address || '—'}" disabled />

        ${order.notes ? `<label>Notas</label><textarea disabled>${order.notes}</textarea>` : ''}
      </div>

      <h3 style="font-family:'Bebas Neue',sans-serif;font-size:1.15rem;color:var(--color-navy);margin-top:20px">Items del pedido</h3>
      ${itemsHTML}
    `);
  }

  function openStatusModal(order) {
    const options = STATUSES.map(s =>
      `<option value="${s}" ${order.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`
    ).join('');

    openModal('Cambiar Estado del Pedido', `
      <div class="trip-form">
        <label>Cliente</label>
        <input type="text" value="${order.profiles?.full_name || '—'}" disabled />

        <label>Total</label>
        <input type="text" value="${formatCurrency(order.total)}" disabled />

        <label>Nuevo Estado</label>
        <select id="modal-order-status">${options}</select>

        <button class="btn red" id="modal-order-save" style="margin-top:12px">Guardar</button>
      </div>
    `);

    document.getElementById('modal-order-save').addEventListener('click', async () => {
      const newStatus = document.getElementById('modal-order-status').value;
      try {
        await updateOrderStatus(order.id, newStatus);
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
    pending: 'Pendiente', paid: 'Pagado', shipped: 'Enviado',
    delivered: 'Entregado', cancelled: 'Cancelado'
  };
  return map[s] || s;
}
