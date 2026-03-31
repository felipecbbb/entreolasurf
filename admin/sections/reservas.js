/* ============================================================
   Reservas Section — Camp bookings grouped by camp
   ============================================================ */
import { fetchBookings, fetchCamps, updateBookingStatus } from '../modules/api.js';
import { statusBadge, formatDate, formatCurrency, openModal, closeModal, showToast } from '../modules/ui.js';
import { supabase } from '/lib/supabase.js';

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
                <div class="rv-booking-row rv-booking-clickable" data-id="${b.id}" style="cursor:pointer">
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
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const booking = filtered.find(b => b.id === btn.dataset.id);
        if (booking) openStatusModal(booking);
      });
    });

    container.querySelectorAll('.rv-booking-clickable').forEach(row => {
      row.addEventListener('click', () => {
        const booking = filtered.find(b => b.id === row.dataset.id);
        if (booking) openBookingFicha(booking);
      });
    });
  }

  function calcAge(birthDate) {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  function closeFicha() {
    document.getElementById('rv-ficha-overlay')?.remove();
  }

  async function openBookingFicha(booking) {
    const p = booking.profiles || {};
    const camp = booking.surf_camps || {};

    // Name & surname separated
    const firstName = esc(p.full_name || 'Sin nombre');
    const lastName = esc(p.last_name || '');
    const clientPhone = esc(p.phone || '—');
    const clientAddress = [p.address, p.city, p.postal_code].filter(Boolean).join(', ');

    // Birth date & age
    const birthStr = p.birth_date ? formatDate(p.birth_date) : '';
    const age = calcAge(p.birth_date);

    // Fetch email from auth.users via RPC
    let email = '—';
    if (booking.user_id) {
      try {
        const { data } = await supabase.rpc('get_user_email', { p_user_id: booking.user_id });
        email = data || '—';
      } catch {}
    }
    const safeEmail = esc(email);

    const statusColor = {
      pending: '#f59e0b', deposit_paid: '#0ea5e9', fully_paid: '#22c55e',
      cancelled: '#ef4444', refunded: '#6b7280',
    }[booking.status] || '#6b7280';

    const depositPaid = Number(booking.deposit_amount || 0);
    const totalAmount = Number(booking.total_amount || 0);
    const pendingAmount = Math.max(0, totalAmount - depositPaid);
    const isFullyPaid = booking.status === 'fully_paid' || pendingAmount <= 0;

    // Health info
    const healthItems = [];
    if (p.can_swim === true) healthItems.push('✓ Sabe nadar');
    if (p.can_swim === false) healthItems.push('<span style="color:#ef4444;font-weight:600">✗ No sabe nadar</span>');
    if (p.has_injury) healthItems.push(`<span style="color:#f59e0b;font-weight:600">⚠ Lesión: ${esc(p.injury_detail || 'Sí')}</span>`);
    if (p.wetsuit_size) healthItems.push(`Neopreno: <strong>${esc(p.wetsuit_size)}</strong>`);

    const waLink = clientPhone !== '—' ? `https://wa.me/${clientPhone.replace(/[^0-9+]/g, '')}` : null;

    const waSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.12 1.521 5.855L0 24l6.335-1.652A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-1.875 0-3.633-.506-5.15-1.387l-.37-.218-3.83.999 1.02-3.72-.24-.38A9.7 9.7 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75z"/></svg>`;

    // Label helper
    const lbl = (text) => `<div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:var(--color-muted);font-weight:600;margin-bottom:4px;font-family:'Space Grotesk',sans-serif">${text}</div>`;

    // Remove previous overlay if exists
    closeFicha();

    const overlay = document.createElement('div');
    overlay.id = 'rv-ficha-overlay';
    overlay.innerHTML = `
      <style>
        #rv-ficha-overlay {
          position:fixed;inset:0;z-index:9999;background:rgba(15,47,57,.5);display:flex;justify-content:center;align-items:stretch;
          overscroll-behavior:contain;
        }
        .rv-ficha {
          background:#fff;width:100%;max-width:720px;overflow-y:auto;-webkit-overflow-scrolling:touch;
          padding:32px;display:flex;flex-direction:column;gap:24px;
          animation:rvSlideIn .25s ease;
        }
        @keyframes rvSlideIn { from{transform:translateX(40px);opacity:0} to{transform:translateX(0);opacity:1} }
        .rv-ficha-topbar {
          display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;
          padding-bottom:16px;border-bottom:1px solid #e5e7eb;margin:-32px -32px 0;padding:20px 32px 16px;z-index:1;
        }
        .rv-ficha-close {
          width:40px;height:40px;border-radius:50%;border:none;background:#f3f4f6;cursor:pointer;font-size:1.3rem;
          display:flex;align-items:center;justify-content:center;color:#64748b;flex-shrink:0;
        }
        .rv-ficha-close:hover { background:#e5e7eb; }
        .rv-field { display:flex;flex-direction:column;gap:2px; }
        .rv-grid { display:grid;grid-template-columns:1fr 1fr;gap:16px; }
        .rv-grid-3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px; }
        .rv-section { padding-top:20px;border-top:1px solid #f3f4f6; }
        .rv-tag { font-size:.82rem;padding:5px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;display:inline-flex;align-items:center;gap:6px; }
        .rv-actions { display:flex;gap:10px;flex-wrap:wrap; }

        @media (max-width:640px) {
          .rv-ficha { padding:20px 16px;max-width:100%; }
          .rv-ficha-topbar { margin:-20px -16px 0;padding:16px 16px 12px; }
          .rv-grid, .rv-grid-3 { grid-template-columns:1fr; }
          .rv-actions { flex-direction:column; }
          .rv-actions .btn { width:100%;justify-content:center; }
        }
      </style>
      <div class="rv-ficha">
        <!-- Top bar -->
        <div class="rv-ficha-topbar">
          <div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:1.4rem;color:var(--color-navy);line-height:1.1">Ficha de Reserva</div>
            <div style="font-size:.78rem;color:var(--color-muted)">${esc(camp.title || 'Surf Camp')}</div>
          </div>
          <button class="rv-ficha-close" id="rv-ficha-close-btn">&times;</button>
        </div>

        <!-- Client card -->
        <div style="display:flex;gap:16px;align-items:flex-start;padding:20px;background:#f8fafc;border-radius:12px">
          <div style="width:52px;height:52px;border-radius:50%;background:#0f2f39;display:flex;align-items:center;justify-content:center;color:#FFCC01;font-weight:700;font-size:1.2rem;flex-shrink:0">
            ${firstName.charAt(0).toUpperCase()}
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline">
              <span style="font-weight:700;font-size:1.05rem;color:var(--color-navy)">${firstName}</span>
              ${lastName ? `<span style="font-weight:400;font-size:1.05rem;color:var(--color-navy)">${lastName}</span>` : ''}
            </div>
            <div style="font-size:.82rem;color:var(--color-muted);margin-top:2px">${safeEmail}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin-top:6px">
              <span style="font-size:.82rem;color:var(--color-muted)">${clientPhone}</span>
              ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-size:.78rem;color:#25D366;text-decoration:none;font-weight:600">${waSvg} WhatsApp</a>` : ''}
            </div>
            ${clientAddress ? `<div style="font-size:.78rem;color:var(--color-muted);margin-top:4px">${esc(clientAddress)}</div>` : ''}
            ${p.id ? `<a href="#clientes" class="rv-goto-client" data-client-id="${p.id}" style="font-size:.75rem;color:#0ea5e9;text-decoration:underline;cursor:pointer;margin-top:6px;display:inline-block">Ver ficha completa del cliente</a>` : ''}
          </div>
        </div>

        <!-- Personal data grid -->
        <div class="rv-grid-3">
          <div class="rv-field">
            ${lbl('Fecha de nacimiento')}
            <span style="font-size:.88rem;color:var(--color-navy)">${birthStr || '—'}${age !== null ? ` <span style="color:var(--color-muted)">(${age} años)</span>` : ''}</span>
          </div>
          <div class="rv-field">
            ${lbl('Teléfono')}
            <span style="font-size:.88rem;color:var(--color-navy)">${clientPhone}</span>
          </div>
          <div class="rv-field">
            ${lbl('Email')}
            <span style="font-size:.88rem;color:var(--color-navy);word-break:break-all">${safeEmail}</span>
          </div>
        </div>

        <!-- Camp info + status -->
        <div class="rv-section">
          <div class="rv-grid">
            <div class="rv-field">
              ${lbl('Surf Camp')}
              <div style="font-weight:700;font-size:.95rem;color:var(--color-navy)">${esc(camp.title || '—')}</div>
              <div style="font-size:.78rem;color:var(--color-muted)">${camp.date_start ? formatDate(camp.date_start) + ' — ' + formatDate(camp.date_end) : '—'}</div>
            </div>
            <div class="rv-field">
              ${lbl('Estado')}
              <span class="admin-badge" style="--badge-bg:${statusColor}18;--badge-color:${statusColor};align-self:flex-start">${STATUS_LABELS[booking.status] || booking.status}</span>
            </div>
          </div>
        </div>

        <!-- Payment -->
        <div style="padding:18px 20px;border-radius:12px;background:${isFullyPaid ? '#f0fdf4' : '#fef2f2'};border:1px solid ${isFullyPaid ? '#bbf7d0' : '#fecaca'}">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-weight:700;color:${isFullyPaid ? '#166534' : '#b91c1c'};font-size:.92rem">
                ${isFullyPaid ? 'Pagado completamente' : 'Pendiente de pago'}
              </div>
              <div style="font-size:.82rem;color:${isFullyPaid ? '#15803d' : '#dc2626'};margin-top:4px">
                Señal: <strong>${formatCurrency(depositPaid)}</strong> · Total: <strong>${formatCurrency(totalAmount)}</strong>
              </div>
            </div>
            ${!isFullyPaid && pendingAmount > 0 ? `<div style="font-family:'Bebas Neue',sans-serif;font-size:1.7rem;color:#b91c1c">${formatCurrency(pendingAmount)}</div>` : ''}
          </div>
        </div>

        <!-- Health & equipment -->
        ${healthItems.length ? `
        <div class="rv-section">
          ${lbl('Salud y equipamiento')}
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
            ${healthItems.map(h => `<span class="rv-tag">${h}</span>`).join('')}
          </div>
        </div>` : ''}

        <!-- Notes -->
        ${booking.notes ? `
        <div class="rv-section">
          ${lbl('Notas')}
          <div style="font-size:.88rem;color:var(--color-navy);padding:12px 16px;background:#f8fafc;border-radius:10px;margin-top:6px">${esc(booking.notes)}</div>
        </div>` : ''}

        <!-- Actions -->
        <div class="rv-section rv-actions">
          <button class="btn red rv-ficha-status-btn" data-id="${booking.id}" style="font-size:.85rem;padding:10px 20px">Cambiar estado</button>
          ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="btn line" style="font-size:.85rem;padding:10px 20px;display:inline-flex;align-items:center;gap:8px">
            ${waSvg} Contactar por WhatsApp
          </a>` : ''}
        </div>

        <!-- Meta -->
        <div style="font-size:.72rem;color:#b0b8c1;padding-top:12px;border-top:1px solid #f3f4f6">
          ID: ${booking.id.slice(0, 8)} · Reservado: ${formatDate(booking.created_at)}${booking.updated_at ? ` · Actualizado: ${formatDate(booking.updated_at)}` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    overlay.querySelector('#rv-ficha-close-btn').addEventListener('click', closeFicha);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeFicha(); });

    // Link to client ficha
    overlay.querySelector('.rv-goto-client')?.addEventListener('click', (e) => {
      e.preventDefault();
      const clientId = e.target.dataset.clientId;
      closeFicha();
      location.hash = '#clientes';
      setTimeout(() => {
        const card = document.querySelector(`.cli-list-card[data-id="${clientId}"]`);
        if (card) card.click();
      }, 400);
    });

    // Status change from ficha
    overlay.querySelector('.rv-ficha-status-btn')?.addEventListener('click', () => {
      closeFicha();
      openStatusModal(booking);
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
        // Fire-and-forget email notification
        if (newStatus === 'cancelled') {
          try {
            const { data: emailData } = await supabase.rpc('get_user_email', { p_user_id: booking.user_id });
            if (emailData) {
              supabase.functions.invoke('send-email', {
                body: {
                  to: emailData,
                  type: 'camp_cancelled',
                  data: {
                    customerName: booking.profiles?.full_name,
                    orderId: booking.id,
                  },
                },
              });
            }
          } catch {}
        }
        closeModal();
        showToast('Estado actualizado', 'success');
        render();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  }

  await render();
}
