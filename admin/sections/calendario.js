/* ============================================================
   Calendario Section — Day view of scheduled classes
   ============================================================ */
import {
  fetchClassesInRange, fetchClassEnrollments, publishClasses,
  upsertClass, deleteClass, createEnrollment, deleteEnrollment,
  searchProfiles, moveEnrollment, updateEnrollmentStatus,
  createClientFromAdmin, fetchEquipment, createEquipmentReservation,
  fetchEquipmentReservationsOverlapping, updateEquipmentReservationStatus,
  updateEquipmentReservation, markEquipmentReservationPaid, markEquipmentReservationUnpaid,
  fetchPayments, createPayment, deletePayment,
} from '../modules/api.js';
import { openModal, closeModal, showToast, formatDate } from '../modules/ui.js';
import { TYPE_LABELS, TYPE_COLORS, PACK_PRICING, DEPOSIT } from '../modules/constants.js';
import { supabase } from '/lib/supabase.js';

// Get pack price for a person: uses tiered pricing, extra sessions beyond max tier use the per-session rate of max tier
// fallbackPrice is used when no pack pricing exists for the type
function getPackPrice(type, sessionCount, fallbackPrice = 0) {
  if (sessionCount <= 0) return 0;
  const tiers = PACK_PRICING[type];
  if (!tiers) return fallbackPrice * sessionCount;
  if (sessionCount < tiers.length) return tiers[sessionCount];
  const maxTier = tiers.length - 1;
  const maxPrice = tiers[maxTier];
  const perSession = maxPrice / maxTier;
  return maxPrice + (sessionCount - maxTier) * perSession;
}

const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_NAMES_SHORT = ['Dom.', 'Lun.', 'Mar.', 'Mié.', 'Jue.', 'Vie.', 'Sáb.'];
const MONTH_NAMES = ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'];

export async function renderCalendario(container) {
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  let viewMode = 'day';

  function formatDayHeader(date) {
    const d = new Date(date);
    return {
      dayName: DAY_NAMES_SHORT[d.getDay()],
      dayNum: d.getDate(),
      month: MONTH_NAMES[d.getMonth()],
      year: d.getFullYear()
    };
  }

  function getDateStr(date) {
    return date.toISOString().slice(0, 10);
  }

  function getWeekDates(baseDate) {
    const d = new Date(baseDate);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const dd = new Date(monday);
      dd.setDate(monday.getDate() + i);
      dates.push(dd);
    }
    return dates;
  }

  function computeTotalHours(classes) {
    let total = 0;
    classes.forEach(c => {
      if (c.time_start && c.time_end) {
        const [sh, sm] = c.time_start.split(':').map(Number);
        const [eh, em] = c.time_end.split(':').map(Number);
        total += (eh * 60 + em - sh * 60 - sm) / 60;
      }
    });
    return total.toFixed(2);
  }

  function shortDateLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${DAY_NAMES_SHORT[d.getDay()].toLowerCase()} ${d.getDate()} ${MONTH_NAMES[d.getMonth()].toLowerCase()}`;
  }

  // Enrollments cache: classId → [enrollment, ...]
  let enrollmentsCache = {};

  // ======== MAIN RENDER ========
  async function render() {
    const dateStr = getDateStr(currentDate);
    let fromDate, toDate;
    if (viewMode === 'day') {
      fromDate = toDate = dateStr;
    } else {
      const weekDates = getWeekDates(currentDate);
      fromDate = getDateStr(weekDates[0]);
      toDate = getDateStr(weekDates[6]);
    }

    const classes = await fetchClassesInRange(fromDate, toDate);

    // Fetch enrollments for day view classes (safe — never blocks render)
    enrollmentsCache = {};
    let rentalReservations = [];
    if (viewMode === 'day') {
      const dayClasses = classes.filter(c => c.date === dateStr);
      try {
        const enrollPromises = dayClasses.map(c =>
          fetchClassEnrollments(c.id)
            .then(e => ({ classId: c.id, enrollments: e }))
            .catch(() => ({ classId: c.id, enrollments: [] }))
        );
        const results = await Promise.all(enrollPromises);
        results.forEach(r => { enrollmentsCache[r.classId] = r.enrollments; });
      } catch (err) {
        console.warn('Could not fetch enrollments:', err);
      }
      // Fetch equipment rental reservations overlapping this day
      try {
        rentalReservations = await fetchEquipmentReservationsOverlapping(dateStr);
      } catch (err) {
        console.warn('Could not fetch rental reservations:', err);
      }
    }

    const { dayName, dayNum, month, year } = formatDayHeader(currentDate);
    const totalHours = computeTotalHours(viewMode === 'day' ? classes : classes.filter(c => c.date === dateStr));

    const topNav = `
      <div class="cal-top-bar">
        <div class="cal-top-left">
          <button class="cal-nav-arrow" id="cal-prev" title="Anterior">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="cal-nav-arrow" id="cal-next" title="Siguiente">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>
          </button>
          <div class="cal-date-display">
            <span class="cal-date-year">${year}</span>
            <span class="cal-date-main">${dayName}, ${dayNum} ${month}</span>
          </div>
          <button class="cal-today-btn" id="cal-today">Hoy</button>
        </div>
        <div class="cal-top-right">
          <span class="cal-hours-total">${totalHours} <small>HORAS</small></span>
          <div class="cal-view-toggle">
            <button class="cal-view-btn ${viewMode === 'day' ? 'active' : ''}" data-view="day">Día</button>
            <button class="cal-view-btn ${viewMode === 'week' ? 'active' : ''}" data-view="week">Semana</button>
          </div>
          <button class="cal-action-btn cal-add-btn" id="cal-add-session" title="Nueva sesión">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>`;

    let content = '';
    if (viewMode === 'day') {
      content = renderDayView(classes, dateStr, rentalReservations);
    } else {
      content = renderWeekView(classes, currentDate);
    }

    container.innerHTML = topNav + content;
    bindEvents(container, classes, rentalReservations);
    if (viewMode === 'day') initDragAndDrop(container, classes);
  }

  // ======== DAY VIEW ========
  function renderDayView(classes, dateStr, rentalReservations = []) {
    const dayClasses = classes.filter(c => c.date === dateStr);
    const hasClasses = dayClasses.length > 0;
    const hasRentals = rentalReservations.length > 0;

    if (!hasClasses && !hasRentals) {
      return `
        <div class="cal-day-content">
          <div class="cal-empty-day">
            <p>No hay sesiones ni alquileres programados para este día</p>
          </div>
        </div>`;
    }

    const classCards = dayClasses.map(c => renderSessionCard(c)).join('');
    const rentalCards = rentalReservations.map(r => renderRentalCard(r)).join('');

    return `
      <div class="cal-day-content">
        ${classCards}
        ${hasRentals ? `
          <div class="cal-rentals-section">
            <div class="cal-rentals-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              <span>Alquileres de material (${rentalReservations.length})</span>
            </div>
            ${rentalCards}
          </div>` : ''}
      </div>`;
  }

  // ======== WEEK VIEW ========
  function renderWeekView(classes, baseDate) {
    const weekDates = getWeekDates(baseDate);
    const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const todayStr = getDateStr(new Date());

    let html = '<div class="cal-week-grid">';
    weekDates.forEach((d, i) => {
      const ds = getDateStr(d);
      const dayClasses = classes.filter(c => c.date === ds);
      const isToday = ds === todayStr;

      html += `
        <div class="cal-week-day ${isToday ? 'is-today' : ''}" data-date="${ds}">
          <div class="cal-week-day-header">
            <span class="cal-week-day-name">${dayNames[i]}</span>
            <span class="cal-week-day-num">${d.getDate()}</span>
          </div>
          <div class="cal-week-day-body">
            ${dayClasses.map(c => `
              <div class="cal-week-slot" data-id="${c.id}" style="border-left-color: ${TYPE_COLORS[c.type] || '#0f2f39'}">
                <span class="cal-week-slot-time">${c.time_start?.slice(0, 5)}</span>
                <span class="cal-week-slot-title">${TYPE_LABELS[c.type] || c.title}</span>
                <span class="cal-week-slot-cap">${c.enrolled_count || 0}/${c.max_students}</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    });
    html += '</div>';
    return html;
  }

  // ======== SESSION CARD ========
  function renderSessionCard(c) {
    const color = TYPE_COLORS[c.type] || '#0f2f39';
    const label = TYPE_LABELS[c.type] || c.title;
    const timeStart = c.time_start?.slice(0, 5) || '--:--';
    const timeEnd = c.time_end?.slice(0, 5) || '--:--';
    const enrollments = enrollmentsCache[c.id] || [];
    const hasCachedEnrollments = c.id in enrollmentsCache;
    const enrolled = hasCachedEnrollments ? enrollments.length : (c.enrolled_count || 0);
    const max = c.max_students || 0;

    // Build enrolled clients list
    let clientsHtml = '';
    enrollments.forEach(e => {
      const name = e.guest_name || e.family_members?.full_name || e.profiles?.full_name || 'Sin nombre';
      const isPaid = e.status === 'paid' || e.status === 'completed';
      const isPartial = e.status === 'partial';
      const isAttended = e.status === 'completed';
      const isNoShow = e.status === 'no_show';
      const payClass = isPaid ? 'paid' : isPartial ? 'partial' : 'unpaid';
      const attendClass = isAttended ? 'attended' : isNoShow ? 'noshow' : '';
      const statusClass = `${payClass} ${attendClass}`.trim();

      clientsHtml += `
        <div class="cal-client-row ${statusClass}" draggable="true" data-enrollment-id="${e.id}" data-class-id="${c.id}" data-client-name="${name}" data-item-type="enrollment">
          <div class="cal-client-drag">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
          </div>
          <label class="cal-client-attendance" title="${isAttended ? 'Asistió' : isNoShow ? 'No se presentó' : 'Marcar asistencia'}">
            <input type="checkbox" class="cal-attendance-check" data-eid="${e.id}" data-type="enrollment" ${isAttended ? 'checked' : ''} />
            <span class="cal-attendance-icon"></span>
          </label>
          <span class="cal-client-name">${name}</span>
          <span class="cal-client-pay-icon" title="${isPaid ? 'Pagado' : isPartial ? 'Anticipo pagado' : 'Pendiente de pago'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </span>
        </div>`;
    });

    return `
      <div class="cal-session-card" data-id="${c.id}" data-type="${c.type}">
        <div class="cal-session-header" style="background: ${color}">
          <div class="cal-session-header-left">
            <span class="cal-session-time">${timeStart} - ${timeEnd}</span>
            <span class="cal-session-title">${label}</span>
          </div>
          <div class="cal-session-header-right">
            <span class="cal-session-cap-label">Capacidad</span>
            <span class="cal-session-cap">${enrolled} / ${max}
              <button class="cal-session-visibility" data-id="${c.id}" title="${c.published ? 'Publicada' : 'No publicada'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  ${c.published
                    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                    : '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
                  }
                </svg>
              </button>
            </span>
          </div>
        </div>
        <div class="cal-session-notes-row" data-id="${c.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/></svg>
          <span>Añadir notas de sesión</span>
        </div>
        <div class="cal-clients-list" data-class-id="${c.id}">
          ${clientsHtml}
        </div>
        <div class="cal-card-footer">
          <button class="cal-add-client-btn book-session-btn" data-id="${c.id}" title="Añadir cliente">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <div class="cal-card-footer-actions">
            <button class="cal-session-action-btn edit-session-btn" data-id="${c.id}" title="Editar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="cal-session-action-btn delete-session-btn danger" data-id="${c.id}" title="Eliminar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>`;
  }

  // ======== RENTAL CARD ========
  const RENTAL_STATUS_LABELS = { pending: 'Pendiente', confirmed: 'Confirmada', active: 'Activa', returned: 'Devuelto', cancelled: 'Cancelada' };
  const RENTAL_STATUS_COLORS = { pending: '#f59e0b', confirmed: '#0ea5e9', active: '#22c55e', returned: '#64748b', cancelled: '#ef4444' };
  const DURATION_KEY_LABELS = { '1h': '1 hora', '2h': '2 horas', '4h': '4 horas', '1d': '1 día', '1w': '1 semana', '2w': '2 semanas', '1m': '1 mes' };

  function renderRentalCard(r) {
    const equipName = r.rental_equipment?.name || 'Material';
    const clientName = r.guest_name || 'Sin nombre';
    const status = r.status || 'pending';
    const statusLabel = RENTAL_STATUS_LABELS[status] || status;
    const statusColor = RENTAL_STATUS_COLORS[status] || '#64748b';
    const durationLabel = DURATION_KEY_LABELS[r.duration_key] || r.duration_key || '';
    const totalAmount = Number(r.total_amount || 0);
    const depositPaid = Number(r.deposit_paid || 0);
    const isAttended = status === 'returned';
    const isPaid = totalAmount > 0 ? depositPaid >= totalAmount : depositPaid > 0;
    const isPartial = !isPaid && depositPaid > 0;
    const payClass = isPaid ? 'paid' : isPartial ? 'partial' : 'unpaid';
    const attendClass = isAttended ? 'attended' : '';
    const statusClass = `${payClass} ${attendClass}`.trim();

    return `
      <div class="cal-session-card cal-rental-card" data-rental-id="${r.id}">
        <div class="cal-session-header" style="background:#0ea5e9;cursor:pointer">
          <div class="cal-session-header-left">
            <span class="cal-session-time">${r.date_start} → ${r.date_end}</span>
            <span class="cal-session-title">${equipName}</span>
          </div>
          <div class="cal-session-header-right">
            <span class="cal-session-cap-label">${durationLabel}</span>
            <span class="cal-session-cap">
              <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.75rem;background:${statusColor};color:#fff">${statusLabel}</span>
            </span>
          </div>
        </div>
        <div class="cal-clients-list" data-rental-id="${r.id}">
          <div class="cal-client-row ${statusClass}" draggable="true" data-rental-id="${r.id}" data-client-name="${clientName}" data-item-type="rental" data-total-amount="${totalAmount}">
            <div class="cal-client-drag">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
            </div>
            <label class="cal-client-attendance" title="${isAttended ? 'Devuelto' : 'Marcar devuelto'}">
              <input type="checkbox" class="cal-attendance-check" data-rid="${r.id}" data-type="rental" ${isAttended ? 'checked' : ''} />
              <span class="cal-attendance-icon"></span>
            </label>
            <span class="cal-client-name">${clientName}</span>
            ${r.size ? `<span class="cal-client-badge blue">Talla: ${r.size}</span>` : ''}
            <span class="cal-client-price">${totalAmount.toFixed(2)}€</span>
            <span class="cal-client-pay-icon" title="${isPaid ? 'Pagado' : isPartial ? 'Anticipo pagado' : 'Pendiente de pago'}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            </span>
          </div>
        </div>
      </div>`;
  }

  // ======== DRAG AND DROP ========
  function initDragAndDrop(container, classes) {
    const clientRows = container.querySelectorAll('.cal-client-row[draggable]');
    const dropZones = container.querySelectorAll('.cal-clients-list');

    clientRows.forEach(row => {
      row.addEventListener('dragstart', (e) => {
        const dragData = {
          itemType: row.dataset.itemType, // 'enrollment' or 'rental'
          enrollmentId: row.dataset.enrollmentId || null,
          rentalId: row.dataset.rentalId || null,
          fromClassId: row.dataset.classId || null,
          clientName: row.dataset.clientName,
        };
        e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        row.classList.add('dragging');
        // Highlight valid drop zones (class lists only, not same source)
        dropZones.forEach(zone => {
          if (zone.dataset.classId && zone.dataset.classId !== row.dataset.classId) {
            zone.classList.add('drop-target');
          }
        });
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        dropZones.forEach(zone => zone.classList.remove('drop-target', 'drop-hover'));
        container.querySelector('.cal-day-content')?.classList.remove('drop-outside-active');
      });
    });

    dropZones.forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drop-hover');
      });

      zone.addEventListener('dragleave', () => {
        zone.classList.remove('drop-hover');
      });

      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('drop-hover', 'drop-target');

        let data;
        try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }

        const toClassId = zone.dataset.classId;

        // Only enrollments can be moved between classes
        if (data.itemType === 'enrollment' && toClassId) {
          if (!data.enrollmentId || toClassId === data.fromClassId) return;
          const toClass = classes.find(c => c.id === toClassId);
          const toEnrollments = enrollmentsCache[toClassId] || [];
          if (toClass && toEnrollments.length >= toClass.max_students) {
            showToast('La sesión destino está llena', 'error');
            return;
          }
          try {
            await moveEnrollment(data.enrollmentId, toClassId);
            showToast(`${data.clientName} movido correctamente`, 'success');
            render();
          } catch (err) {
            showToast('Error al mover: ' + err.message, 'error');
          }
        }
        // If dragging a rental into a class drop zone — ignore (can't mix)
      });
    });

    // Drop outside any zone → delete the item
    const dayContent = container.querySelector('.cal-day-content');
    if (dayContent) {
      dayContent.addEventListener('dragover', (e) => {
        // Only show delete hint if not over a drop zone
        if (!e.target.closest('.cal-clients-list')) {
          e.preventDefault();
          dayContent.classList.add('drop-outside-active');
        }
      });
      dayContent.addEventListener('dragleave', (e) => {
        if (!dayContent.contains(e.relatedTarget)) {
          dayContent.classList.remove('drop-outside-active');
        }
      });
      dayContent.addEventListener('drop', async (e) => {
        dayContent.classList.remove('drop-outside-active');
        if (e.target.closest('.cal-clients-list')) return; // handled above
        e.preventDefault();
        let data;
        try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }

        if (data.itemType === 'rental' && data.rentalId) {
          if (!confirm(`¿Eliminar la reserva de alquiler de ${data.clientName}?`)) return;
          try {
            await updateEquipmentReservationStatus(data.rentalId, 'cancelled');
            showToast(`Alquiler de ${data.clientName} cancelado`, 'success');
            render();
          } catch (err) { showToast('Error: ' + err.message, 'error'); }
        } else if (data.itemType === 'enrollment' && data.enrollmentId) {
          if (!confirm(`¿Eliminar la inscripción de ${data.clientName}?`)) return;
          try {
            await deleteEnrollment(data.enrollmentId);
            showToast(`${data.clientName} eliminado de la sesión`, 'success');
            render();
          } catch (err) { showToast('Error: ' + err.message, 'error'); }
        }
      });
    }
  }

  // ======== EVENTS ========
  function bindEvents(container, classes, rentalReservations = []) {
    container.querySelector('#cal-prev')?.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() + (viewMode === 'day' ? -1 : -7));
      render();
    });
    container.querySelector('#cal-next')?.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() + (viewMode === 'day' ? 1 : 7));
      render();
    });
    container.querySelector('#cal-today')?.addEventListener('click', () => {
      currentDate = new Date(); currentDate.setHours(0, 0, 0, 0); render();
    });

    container.querySelectorAll('.cal-view-btn').forEach(btn => {
      btn.addEventListener('click', () => { viewMode = btn.dataset.view; render(); });
    });

    container.querySelector('#cal-add-session')?.addEventListener('click', () => openNewSessionModal());

    // Click on session header → show enrollments
    container.querySelectorAll('.cal-session-header').forEach(header => {
      const card = header.closest('.cal-session-card');
      const id = card?.dataset.id;
      header.addEventListener('click', async (e) => {
        if (e.target.closest('.cal-session-visibility')) return;
        if (!id) return;
        const cls = classes.find(c => c.id === id);
        if (cls) await showEnrollments(cls);
      });
    });

    // Client row pay icon click → toggle payment status (enrollment or rental)
    container.querySelectorAll('.cal-client-pay-icon').forEach(icon => {
      icon.style.cursor = 'pointer';
      icon.addEventListener('click', async (e) => {
        e.stopPropagation();
        const row = icon.closest('.cal-client-row');
        if (!row) return;
        const itemType = row.dataset.itemType;
        const isPaid = row.classList.contains('paid');

        if (itemType === 'enrollment') {
          const eid = row.dataset.enrollmentId;
          const newStatus = isPaid ? 'confirmed' : 'paid';
          try {
            await updateEnrollmentStatus(eid, newStatus);
            showToast(isPaid ? 'Marcado como pendiente' : 'Marcado como pagado', 'success');
            render();
          } catch (err) { showToast('Error: ' + err.message, 'error'); }
        } else if (itemType === 'rental') {
          const rid = row.dataset.rentalId;
          const reservation = rentalReservations.find(r => r.id === rid);
          const rTotal = Number(reservation?.total_amount || 0);
          const rDeposit = Number(reservation?.deposit_paid || 0);
          const rentalIsPaid = rTotal > 0 ? rDeposit >= rTotal : rDeposit > 0;
          try {
            if (rentalIsPaid) {
              await markEquipmentReservationUnpaid(rid);
              showToast('Marcado como pendiente', 'success');
            } else {
              await markEquipmentReservationPaid(rid, Math.max(rTotal, 0.01));
              showToast('Marcado como pagado', 'success');
            }
            render();
          } catch (err) { showToast('Error: ' + err.message, 'error'); }
        }
      });
    });

    // Attendance checkbox → mark as completed/returned or revert
    container.querySelectorAll('.cal-attendance-check').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        e.stopPropagation();
        const checked = cb.checked;
        const itemType = cb.dataset.type;

        if (itemType === 'enrollment') {
          const eid = cb.dataset.eid;
          try {
            if (checked) {
              // Prevent marking attendance if class hasn't started
              const row = cb.closest('.cal-client-row');
              const classId = row?.dataset.classId;
              const cls = classes.find(c => c.id === classId);
              if (cls) {
                const classStart = new Date(`${cls.date}T${cls.time_start || '00:00'}`);
                if (classStart > new Date()) {
                  cb.checked = false;
                  showToast('No puedes marcar asistencia antes de que empiece la clase', 'error');
                  return;
                }
              }
              // Mark as attended (completed)
              await updateEnrollmentStatus(eid, 'completed');
              showToast('Asistencia confirmada', 'success');
            } else {
              // Revert attendance — preserve payment status
              const payments = await fetchPayments('enrollment', eid);
              const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
              let newStatus = 'confirmed';
              if (totalPaid > 0) {
                // Determine paid vs partial using class price
                const row = cb.closest('.cal-client-row');
                const classId = row?.dataset.classId;
                const cls = classes.find(c => c.id === classId);
                const expectedPrice = cls ? Number(cls.price) || 0 : 0;
                newStatus = (expectedPrice > 0 && totalPaid >= expectedPrice) ? 'paid' : 'partial';
              }
              await updateEnrollmentStatus(eid, newStatus);
              showToast('Asistencia revertida', 'success');
            }
            render();
          } catch (err) { showToast('Error: ' + err.message, 'error'); cb.checked = !checked; }
        } else if (itemType === 'rental') {
          const rid = cb.dataset.rid;
          // checked = returned (finalized), unchecked = active
          const newStatus = checked ? 'returned' : 'active';
          try {
            await updateEquipmentReservationStatus(rid, newStatus);
            showToast(checked ? 'Material devuelto — finalizado' : 'Marcado como activo', 'success');
            render();
          } catch (err) { showToast('Error: ' + err.message, 'error'); cb.checked = !checked; }
        }
      });
    });

    // Click on client row → open detail panel
    container.querySelectorAll('.cal-client-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.cal-client-pay-icon') || e.target.closest('.cal-client-attendance') || e.target.closest('.cal-client-drag')) return;
        const itemType = row.dataset.itemType;
        const clientName = row.dataset.clientName;

        if (itemType === 'enrollment') {
          const eid = row.dataset.enrollmentId;
          const classId = row.dataset.classId;
          const cls = classes.find(c => c.id === classId);
          if (cls && eid) openEnrollmentDetail(cls, eid, clientName, row.classList.contains('paid'));
        } else if (itemType === 'rental') {
          const rid = row.dataset.rentalId;
          const reservation = rentalReservations.find(r => r.id === rid);
          if (reservation) openRentalDetail(reservation);
        }
      });
    });

    // Book session (manual reservation)
    container.querySelectorAll('.book-session-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cls = classes.find(c => c.id === btn.dataset.id);
        if (cls) openBookingPanel(cls);
      });
    });

    container.querySelectorAll('.edit-session-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cls = classes.find(c => c.id === btn.dataset.id);
        if (cls) openEditSessionModal(cls);
      });
    });

    container.querySelectorAll('.delete-session-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar esta sesión?')) return;
        try {
          await deleteClass(btn.dataset.id);
          showToast('Sesión eliminada', 'success');
          render();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      });
    });

    // Click on rental card header → open rental detail panel
    container.querySelectorAll('.cal-rental-card .cal-session-header').forEach(header => {
      header.addEventListener('click', () => {
        const card = header.closest('.cal-rental-card');
        const rentalId = card?.dataset.rentalId;
        const reservation = rentalReservations.find(r => r.id === rentalId);
        if (reservation) openRentalDetail(reservation);
      });
    });

    container.querySelectorAll('.cal-week-day-header').forEach(header => {
      header.addEventListener('click', () => {
        const ds = header.closest('.cal-week-day')?.dataset.date;
        if (ds) { currentDate = new Date(ds + 'T00:00:00'); viewMode = 'day'; render(); }
      });
    });

    container.querySelectorAll('.cal-week-slot').forEach(slot => {
      slot.addEventListener('click', async () => {
        const cls = classes.find(c => c.id === slot.dataset.id);
        if (cls) await showEnrollments(cls);
      });
    });
  }

  // ======== ENROLLMENTS MODAL ========
  async function showEnrollments(cls) {
    try {
      const enrollments = await fetchClassEnrollments(cls.id);
      const listHtml = enrollments.length
        ? `<div class="enrollment-list">${enrollments.map(e => `
            <div style="padding:10px 0;border-bottom:1px solid var(--color-line,#eee);display:flex;justify-content:space-between;align-items:center">
              <strong>${e.family_members?.full_name || e.profiles?.full_name || 'Usuario'}</strong>
              <span class="admin-badge" data-status="${e.status}">${e.status}</span>
            </div>`).join('')}</div>`
        : '<p style="color:#888;margin-top:12px">No hay inscritos</p>';

      const label = TYPE_LABELS[cls.type] || cls.title;
      openModal(`${label} — ${formatDate(cls.date)} ${cls.time_start?.slice(0, 5)}`, `
        <div style="display:flex;gap:16px;margin-bottom:16px">
          <div><strong>Inscritos:</strong> ${cls.enrolled_count || 0}/${cls.max_students}</div>
          <div><strong>Publicada:</strong> ${cls.published ? 'Sí' : 'No'}</div>
        </div>
        ${listHtml}
      `);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  }

  // ======== BOOKING PANEL (MANUAL RESERVATION) ========
  async function openBookingPanel(cls) {
    const color = TYPE_COLORS[cls.type] || '#0f2f39';
    const label = TYPE_LABELS[cls.type] || cls.title;
    const price = Number(cls.price) || 0;

    // Fetch same-type sessions for the week
    const weekDates = getWeekDates(new Date(cls.date + 'T00:00:00'));
    const weekFrom = getDateStr(weekDates[0]);
    const weekTo = getDateStr(weekDates[6]);
    const weekClasses = await fetchClassesInRange(weekFrom, weekTo);
    const sameTypeWeek = weekClasses.filter(c => c.type === cls.type);

    // State
    let bookingWeekOffset = 0;
    let sessionQuantities = {}; // classId → quantity
    sessionQuantities[cls.id] = 1;
    let persons = [{ id: Date.now(), nombre: '', apellidos: '', edad: '', sabeNadar: '', lesion: 'no', lesionDetalle: '', tallaNeopreno: '', nivelSurf: 'principiante', profileId: null, profileName: null, familyMemberId: null, sessions: [cls.id] }];

    function getTotalQuantity() {
      return Object.values(sessionQuantities).reduce((s, v) => s + v, 0);
    }

    // Calculate total using pack pricing: ALL sessions across ALL persons count as one pack
    function getTotalPrice() {
      const totalSessions = persons.reduce((s, p) => s + p.sessions.length, 0);
      return getPackPrice(cls.type, totalSessions, price);
    }

    // Get unit price label for display
    function getUnitPriceLabel() {
      const tiers = PACK_PRICING[cls.type];
      return tiers ? `${tiers[1]}€` : `${price}€`;
    }

    function renderPanel() {
      const totalQty = getTotalQuantity();
      const totalPrice = getTotalPrice();

      // Build week session grid
      const currentWeekDates = getWeekDatesForOffset(cls.date, bookingWeekOffset);
      const cwFrom = getDateStr(currentWeekDates[0]);
      const cwTo = getDateStr(currentWeekDates[6]);
      const weekLabel = `${currentWeekDates[0].getDate()} ${MONTH_NAMES[currentWeekDates[0].getMonth()].toLowerCase()} - ${currentWeekDates[6].getDate()} ${MONTH_NAMES[currentWeekDates[6].getMonth()].toLowerCase()}`;

      let sessionGridHtml = '<div class="bk-sessions-grid">';
      currentWeekDates.forEach(wd => {
        const ds = getDateStr(wd);
        const daySessions = sameTypeWeek.filter(c => c.date === ds);
        const dayLabel = `${DAY_NAMES_SHORT[wd.getDay()].toLowerCase()} ${wd.getDate()} / ${wd.getMonth() + 1}`;

        sessionGridHtml += `<div class="bk-session-col">
          <div class="bk-session-col-header">${dayLabel}</div>`;

        if (daySessions.length) {
          daySessions.forEach(s => {
            const qty = sessionQuantities[s.id] || 0;
            const avail = (s.max_students || 0) - (s.enrolled_count || 0);
            const isSelected = qty > 0;
            sessionGridHtml += `
              <div class="bk-session-slot ${isSelected ? 'selected' : ''}">
                <div class="bk-slot-info">
                  <span class="bk-slot-time">${s.time_start?.slice(0, 5)} - ${s.time_end?.slice(0, 5)}</span>
                  <span class="bk-slot-avail">Disponible: ${avail}</span>
                </div>
                <div class="bk-slot-counter">
                  <button class="bk-counter-btn minus" data-sid="${s.id}" ${qty <= 0 ? 'disabled' : ''}>−</button>
                  <span class="bk-counter-val">${qty}</span>
                  <button class="bk-counter-btn plus" data-sid="${s.id}" ${qty >= avail ? 'disabled' : ''}>+</button>
                </div>
              </div>`;
          });
        } else {
          sessionGridHtml += '<div class="bk-session-empty">—</div>';
        }

        sessionGridHtml += '</div>';
      });
      sessionGridHtml += '</div>';

      // Build persons list
      let personsHtml = '';
      persons.forEach((p, idx) => {
        const assignedTags = p.sessions.map(sid => {
          const s = sameTypeWeek.find(c => c.id === sid) || weekClasses.find(c => c.id === sid);
          if (!s) return '';
          const tagLabel = `${shortDateLabel(s.date)} ${s.time_start?.slice(0, 5)}-${s.time_end?.slice(0, 5)}`;
          return `<span class="bk-session-tag">${tagLabel} <button class="bk-tag-remove" data-pid="${p.id}" data-sid="${sid}">×</button></span>`;
        }).join('');

        // Available sessions to add (those with qty > 0 and not yet assigned to this person)
        const availableSessions = Object.keys(sessionQuantities)
          .filter(sid => sessionQuantities[sid] > 0 && !p.sessions.includes(sid))
          .map(sid => {
            const s = sameTypeWeek.find(c => c.id === sid) || weekClasses.find(c => c.id === sid);
            if (!s) return '';
            return `<option value="${sid}">${shortDateLabel(s.date)} ${s.time_start?.slice(0, 5)}</option>`;
          }).join('');

        personsHtml += `
          <div class="bk-person-card" data-pid="${p.id}">
            <div class="bk-person-header">
              <span class="bk-person-number">Persona ${idx + 1}</span>
              <div class="bk-person-header-actions">
                <button class="bk-link-client-btn" data-pid="${p.id}" title="Vincular cliente existente">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                </button>
                <button class="bk-remove-person-btn" data-pid="${p.id}" title="Eliminar persona">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
              </div>
            </div>
            ${p.profileId
              ? `<div class="bk-linked-client">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                  <span>Vinculado: <strong>${p.profileName}</strong>${p.familyMemberId ? ' <small style="color:#0ea5e9">(familiar)</small>' : ''}</span>
                  <button class="bk-unlink-btn" data-pid="${p.id}">×</button>
                </div>`
              : `<div class="bk-person-fields">
                  <div class="bk-field">
                    <label class="bk-field-label">Nombre *</label>
                    <input type="text" class="bk-field-input bk-nombre" data-pid="${p.id}" value="${p.nombre}" placeholder="Nombre" />
                  </div>
                  <div class="bk-field">
                    <label class="bk-field-label">Apellidos *</label>
                    <input type="text" class="bk-field-input bk-apellidos" data-pid="${p.id}" value="${p.apellidos}" placeholder="Apellidos" />
                  </div>
                  <div class="bk-field">
                    <label class="bk-field-label">Edad</label>
                    <input type="number" class="bk-field-input bk-edad" data-pid="${p.id}" value="${p.edad}" placeholder="Edad" min="1" max="99" />
                  </div>
                  <div class="bk-field">
                    <label class="bk-field-label">¿Sabe nadar?</label>
                    <select class="bk-field-input bk-nadar" data-pid="${p.id}">
                      <option value="" ${!p.sabeNadar ? 'selected' : ''}>Seleccionar</option>
                      <option value="si" ${p.sabeNadar === 'si' ? 'selected' : ''}>Sí</option>
                      <option value="no" ${p.sabeNadar === 'no' ? 'selected' : ''}>No</option>
                    </select>
                  </div>
                  <div class="bk-field">
                    <label class="bk-field-label">¿Tiene lesión?</label>
                    <select class="bk-field-input bk-lesion" data-pid="${p.id}">
                      <option value="no" ${p.lesion === 'no' ? 'selected' : ''}>No</option>
                      <option value="si" ${p.lesion === 'si' ? 'selected' : ''}>Sí</option>
                    </select>
                  </div>
                  <div class="bk-field bk-lesion-detalle-wrap" data-pid="${p.id}" style="display:${p.lesion === 'si' ? '' : 'none'}">
                    <label class="bk-field-label">¿Cuál?</label>
                    <input type="text" class="bk-field-input bk-lesion-detalle" data-pid="${p.id}" value="${p.lesionDetalle}" placeholder="Describe la lesión" />
                  </div>
                  <div class="bk-field">
                    <label class="bk-field-label">Talla neopreno</label>
                    <select class="bk-field-input bk-talla" data-pid="${p.id}">
                      <option value="" ${!p.tallaNeopreno ? 'selected' : ''}>Seleccionar</option>
                      <option value="XXS" ${p.tallaNeopreno === 'XXS' ? 'selected' : ''}>XXS</option>
                      <option value="XS" ${p.tallaNeopreno === 'XS' ? 'selected' : ''}>XS</option>
                      <option value="S" ${p.tallaNeopreno === 'S' ? 'selected' : ''}>S</option>
                      <option value="M" ${p.tallaNeopreno === 'M' ? 'selected' : ''}>M</option>
                      <option value="L" ${p.tallaNeopreno === 'L' ? 'selected' : ''}>L</option>
                      <option value="XL" ${p.tallaNeopreno === 'XL' ? 'selected' : ''}>XL</option>
                      <option value="XXL" ${p.tallaNeopreno === 'XXL' ? 'selected' : ''}>XXL</option>
                    </select>
                  </div>
                  <div class="bk-field">
                    <label class="bk-field-label">Nivel de surf</label>
                    <select class="bk-field-input bk-nivel" data-pid="${p.id}">
                      <option value="principiante" ${p.nivelSurf === 'principiante' ? 'selected' : ''}>Principiante (0-6 clases)</option>
                      <option value="intermedio" ${p.nivelSurf === 'intermedio' ? 'selected' : ''}>Intermedio (7-15 clases)</option>
                      <option value="avanzado" ${p.nivelSurf === 'avanzado' ? 'selected' : ''}>Avanzado (+15 clases)</option>
                    </select>
                  </div>
                </div>`
            }
            <div class="bk-person-sessions">
              <label class="bk-field-label">Sesiones asignadas*</label>
              <div class="bk-session-tags">
                ${assignedTags}
                ${availableSessions ? `
                  <select class="bk-add-session-select" data-pid="${p.id}">
                    <option value="">+ Añadir sesión</option>
                    ${availableSessions}
                  </select>` : ''}
              </div>
            </div>
          </div>`;
      });

      // Full panel
      const panelHtml = `
        <div class="bk-overlay bk-overlay-fullscreen" id="bk-overlay">
          <div class="bk-panel bk-panel-fullscreen">
            <div class="bk-panel-header" style="background: ${color}">
              <button class="bk-close-btn" id="bk-close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div class="bk-header-left">
                <span class="bk-header-title">${label}</span>
              </div>
              <div class="bk-header-right">
                <div class="bk-header-total">
                  <small>TOTAL</small>
                  <span>${totalPrice.toFixed(2)}€</span>
                </div>
                <button class="bk-confirm-btn" id="bk-confirm">CONFIRMAR</button>
              </div>
            </div>

            <div class="bk-panel-body">
              <div class="bk-section">
                <h3 class="bk-section-title">Opciones de Reserva</h3>
                <div class="bk-options-card">
                  <div class="bk-options-row">
                    <div class="bk-option">
                      <label class="bk-field-label">Fecha</label>
                      <div class="bk-option-value">${cls.date.split('-').reverse().join('/')}</div>
                    </div>
                    <div class="bk-option">
                      <label class="bk-field-label">Cantidad</label>
                      <div class="bk-option-number">${totalQty}</div>
                    </div>
                    <div class="bk-option">
                      <label class="bk-field-label">Personas</label>
                      <div class="bk-option-number">${persons.length}</div>
                    </div>
                  </div>

                  <div class="bk-sessions-section">
                    <label class="bk-field-label" style="margin-bottom:8px">Por favor, selecciona las sesiones:</label>
                    <div class="bk-sessions-nav">
                      <button class="bk-sessions-nav-arrow" id="bk-week-prev">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                      </button>
                      <span class="bk-sessions-week-label">${weekLabel}</span>
                      <button class="bk-sessions-nav-arrow" id="bk-week-next">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>
                      </button>
                    </div>
                    ${sessionGridHtml}
                  </div>
                </div>
              </div>

              <div class="bk-section">
                <h3 class="bk-section-title">Datos del Grupo</h3>
                ${personsHtml}
                <button class="bk-add-person-btn" id="bk-add-person">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Añadir Persona
                </button>
              </div>
            </div>
          </div>
        </div>`;

      // Remove existing panel
      document.getElementById('bk-overlay')?.remove();
      document.body.insertAdjacentHTML('beforeend', panelHtml);
      bindPanelEvents();
    }

    function getWeekDatesForOffset(baseDateStr, offset) {
      const base = new Date(baseDateStr + 'T00:00:00');
      base.setDate(base.getDate() + offset * 7);
      return getWeekDates(base);
    }

    function bindPanelEvents() {
      const overlay = document.getElementById('bk-overlay');
      if (!overlay) return;

      // Close
      overlay.querySelector('#bk-close').addEventListener('click', () => {
        overlay.remove();
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });

      // Session counter buttons
      overlay.querySelectorAll('.bk-counter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const sid = btn.dataset.sid;
          const current = sessionQuantities[sid] || 0;
          if (btn.classList.contains('plus')) {
            const newQty = current + 1;
            sessionQuantities[sid] = newQty;

            // Ensure we have enough persons for this session qty
            while (persons.length < newQty) {
              persons.push({
                id: Date.now() + persons.length,
                nombre: '', apellidos: '', edad: '', sabeNadar: '',
                lesion: 'no', lesionDetalle: '', tallaNeopreno: '',
                nivelSurf: 'principiante', profileId: null, profileName: null,
                familyMemberId: null, sessions: []
              });
            }

            // Assign this session to the first N persons (N = newQty)
            for (let i = 0; i < persons.length; i++) {
              if (i < newQty) {
                if (!persons[i].sessions.includes(sid)) persons[i].sessions.push(sid);
              } else {
                // Remove from persons beyond the qty
                persons[i].sessions = persons[i].sessions.filter(s => s !== sid);
              }
            }
          } else {
            const newQty = Math.max(0, current - 1);
            sessionQuantities[sid] = newQty;
            if (newQty === 0) {
              delete sessionQuantities[sid];
              // Remove from all persons
              persons.forEach(p => {
                p.sessions = p.sessions.filter(s => s !== sid);
              });
            } else {
              // Keep session only for the first N persons
              for (let i = 0; i < persons.length; i++) {
                if (i < newQty) {
                  if (!persons[i].sessions.includes(sid)) persons[i].sessions.push(sid);
                } else {
                  persons[i].sessions = persons[i].sessions.filter(s => s !== sid);
                }
              }
            }
            // Remove persons that have no sessions left (keep at least 1)
            persons = persons.filter((p, i) => i === 0 || p.sessions.length > 0);
          }
          renderPanel();
        });
      });

      // Week navigation
      overlay.querySelector('#bk-week-prev')?.addEventListener('click', async () => {
        bookingWeekOffset--;
        const wd = getWeekDatesForOffset(cls.date, bookingWeekOffset);
        const moreClasses = await fetchClassesInRange(getDateStr(wd[0]), getDateStr(wd[6]));
        moreClasses.filter(c => c.type === cls.type).forEach(c => {
          if (!sameTypeWeek.find(s => s.id === c.id)) sameTypeWeek.push(c);
        });
        renderPanel();
      });
      overlay.querySelector('#bk-week-next')?.addEventListener('click', async () => {
        bookingWeekOffset++;
        const wd = getWeekDatesForOffset(cls.date, bookingWeekOffset);
        const moreClasses = await fetchClassesInRange(getDateStr(wd[0]), getDateStr(wd[6]));
        moreClasses.filter(c => c.type === cls.type).forEach(c => {
          if (!sameTypeWeek.find(s => s.id === c.id)) sameTypeWeek.push(c);
        });
        renderPanel();
      });

      // Add person
      overlay.querySelector('#bk-add-person')?.addEventListener('click', () => {
        const selectedSessions = Object.keys(sessionQuantities).filter(sid => sessionQuantities[sid] > 0);
        persons.push({
          id: Date.now(),
          nombre: '',
          apellidos: '',
          edad: '',
          sabeNadar: '',
          lesion: 'no',
          lesionDetalle: '',
          tallaNeopreno: '',
          nivelSurf: 'principiante',
          profileId: null,
          profileName: null,
          familyMemberId: null,
          sessions: selectedSessions.length ? [selectedSessions[0]] : []
        });
        renderPanel();
      });

      // Remove person
      overlay.querySelectorAll('.bk-remove-person-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (persons.length <= 1) {
            showToast('Debe haber al menos una persona', 'error');
            return;
          }
          persons = persons.filter(p => String(p.id) !== btn.dataset.pid);
          renderPanel();
        });
      });

      // Field inputs (save on change)
      overlay.querySelectorAll('.bk-nombre').forEach(input => {
        input.addEventListener('input', () => {
          const p = persons.find(p => String(p.id) === input.dataset.pid);
          if (p) p.nombre = input.value;
        });
      });
      overlay.querySelectorAll('.bk-apellidos').forEach(input => {
        input.addEventListener('input', () => {
          const p = persons.find(p => String(p.id) === input.dataset.pid);
          if (p) p.apellidos = input.value;
        });
      });
      overlay.querySelectorAll('.bk-edad').forEach(input => {
        input.addEventListener('input', () => {
          const p = persons.find(p => String(p.id) === input.dataset.pid);
          if (p) p.edad = input.value;
        });
      });
      overlay.querySelectorAll('.bk-nadar').forEach(sel => {
        sel.addEventListener('change', () => {
          const p = persons.find(p => String(p.id) === sel.dataset.pid);
          if (p) p.sabeNadar = sel.value;
        });
      });
      overlay.querySelectorAll('.bk-lesion').forEach(sel => {
        sel.addEventListener('change', () => {
          const p = persons.find(p => String(p.id) === sel.dataset.pid);
          if (p) p.lesion = sel.value;
          const wrap = overlay.querySelector(`.bk-lesion-detalle-wrap[data-pid="${sel.dataset.pid}"]`);
          if (wrap) wrap.style.display = sel.value === 'si' ? '' : 'none';
        });
      });
      overlay.querySelectorAll('.bk-lesion-detalle').forEach(input => {
        input.addEventListener('input', () => {
          const p = persons.find(p => String(p.id) === input.dataset.pid);
          if (p) p.lesionDetalle = input.value;
        });
      });
      overlay.querySelectorAll('.bk-talla').forEach(sel => {
        sel.addEventListener('change', () => {
          const p = persons.find(p => String(p.id) === sel.dataset.pid);
          if (p) p.tallaNeopreno = sel.value;
        });
      });
      overlay.querySelectorAll('.bk-nivel').forEach(sel => {
        sel.addEventListener('change', () => {
          const p = persons.find(p => String(p.id) === sel.dataset.pid);
          if (p) p.nivelSurf = sel.value;
        });
      });

      // Remove session tag from person
      overlay.querySelectorAll('.bk-tag-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = persons.find(p => String(p.id) === btn.dataset.pid);
          if (p) {
            p.sessions = p.sessions.filter(s => s !== btn.dataset.sid);
            renderPanel();
          }
        });
      });

      // Add session to person
      overlay.querySelectorAll('.bk-add-session-select').forEach(select => {
        select.addEventListener('change', () => {
          if (!select.value) return;
          const p = persons.find(p => String(p.id) === select.dataset.pid);
          if (p && !p.sessions.includes(select.value)) {
            p.sessions.push(select.value);
            renderPanel();
          }
        });
      });

      // Link client
      overlay.querySelectorAll('.bk-link-client-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          openClientSearchForPerson(btn.dataset.pid);
        });
      });

      // Unlink client
      overlay.querySelectorAll('.bk-unlink-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = persons.find(p => String(p.id) === btn.dataset.pid);
          if (p) {
            p.profileId = null;
            p.profileName = null;
            p.familyMemberId = null;
            renderPanel();
          }
        });
      });

      // Confirm → go to checkout
      overlay.querySelector('#bk-confirm')?.addEventListener('click', () => {
        // Validate
        for (const p of persons) {
          if (!p.profileId && !p.nombre.trim()) {
            showToast('Rellena el nombre de todas las personas o vincúlalas a un cliente', 'error');
            return;
          }
          if (!p.sessions.length) {
            showToast('Asigna al menos una sesión a cada persona', 'error');
            return;
          }
        }
        openCheckoutPanel();
      });
    }

    // ======== CHECKOUT PANEL ========
    async function openCheckoutPanel() {
      const totalQty = getTotalQuantity();
      const subtotal = getTotalPrice();

      // Checkout state
      let discountType = 'percent';
      let discountValue = 0;
      let contactSource = 'persona_1';
      let contactData = { nombre: '', apellidos: '', email: '', telefono: '', pais: '', idioma: 'Español', profileId: null };
      let cobrarAnticipo = false;
      let paymentMethod = null;
      let enviarConfirmacion = true;
      let crearInvitacion = false;
      let ocultarPrecios = false;
      let anticipoAmount = 0;

      // Credit/bono system: maps personId → { useCredit: bool, bono: bonoObj|null }
      let personCredits = {};

      // Prefill contact from first person (async if linked to profile)
      async function prefillContactFromPerson(p) {
        // For family members, use the parent profile ID for contact details
        const profileId = p.profileId;
        if (profileId) {
          contactData.profileId = profileId;
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', profileId)
              .single();
            if (profile) {
              contactData.nombre = (profile.full_name || '').trim();
              contactData.apellidos = (profile.last_name || '').trim();
              contactData.telefono = profile.phone || '';
              // Fetch email via RPC
              try {
                const { data: email } = await supabase.rpc('get_user_email', { p_user_id: profileId });
                if (email) contactData.email = email;
              } catch {}
            }
          } catch {}
        } else {
          contactData.nombre = p.nombre;
          contactData.apellidos = p.apellidos;
        }
      }
      if (persons[0]) {
        await prefillContactFromPerson(persons[0]);
      }

      // Fetch active bonos for all linked persons
      async function loadPersonCredits() {
        for (const p of persons) {
          if (p.profileId && !personCredits[p.id]) {
            try {
              const { data: bonos } = await supabase
                .from('bonos')
                .select('*')
                .eq('user_id', p.profileId)
                .eq('class_type', cls.type)
                .eq('status', 'active')
                .gt('expires_at', new Date().toISOString());
              // Find bonos with available credits, enrich with expected price
              const allBonos = (bonos || []).filter(b => b.used_credits < b.total_credits).map(b => {
                const expectedPrice = getPackPrice(b.class_type, b.total_credits, Number(cls.price) || 0);
                // If total_paid is 0 but bono was bought online (has order_id), at least the deposit was paid
                const deposit = DEPOSIT[b.class_type] || 15;
                const paid = Number(b.total_paid || 0) || (b.order_id ? deposit : 0);
                return { ...b, totalPaidReal: paid, expectedPrice, pendingAmount: Math.max(0, expectedPrice - paid), isFullyPaid: paid >= expectedPrice };
              });
              const totalRemaining = allBonos.reduce((sum, b) => sum + (b.total_credits - b.used_credits), 0);
              // Default: pick the first bono with enough credits
              const bestBono = allBonos.find(b => (b.total_credits - b.used_credits) >= p.sessions.length) || allBonos[0] || null;
              personCredits[p.id] = {
                useCredit: totalRemaining >= p.sessions.length,
                bono: bestBono,
                selectedBonoId: bestBono?.id || null,
                allBonos,
                availableCredits: totalRemaining,
              };
            } catch { personCredits[p.id] = { useCredit: false, bono: null, availableCredits: 0 }; }
          }
        }
      }
      await loadPersonCredits();

      // Count how many sessions are covered by credits
      function getCreditSessions() {
        let count = 0;
        for (const p of persons) {
          const pc = personCredits[p.id];
          if (pc?.useCredit && pc.bono) count += p.sessions.length;
        }
        return count;
      }

      function getTotalSessions() {
        return persons.reduce((s, p) => s + p.sessions.length, 0);
      }

      function allCoveredByCredits() {
        return getCreditSessions() > 0 && getCreditSessions() >= getTotalSessions();
      }

      function getDiscount() {
        if (discountType === 'percent') return subtotal * (discountValue / 100);
        return discountValue;
      }

      function getTotal() {
        return Math.max(0, subtotal - getDiscount());
      }

      function getTax() {
        return getTotal() * 0.21; // IVA included
      }

      function renderCheckout() {
        const discount = getDiscount();
        const total = getTotal();
        const taxIncluded = (total * 21 / 121).toFixed(2); // IVA included in price

        // Person options for contact selector
        const personOptions = persons.map((p, i) => {
          const name = p.profileId ? p.profileName : `${p.nombre} ${p.apellidos}`.trim();
          return `<option value="persona_${i + 1}" ${contactSource === `persona_${i + 1}` ? 'selected' : ''}>Persona ${i + 1}${name ? ' — ' + name : ''}</option>`;
        }).join('');

        const checkoutHtml = `
          <div class="bk-panel-body">
            <div class="bk-checkout-layout">
              <!-- LEFT: Contact Data -->
              <div>
                <div class="bk-section">
                  <div class="bk-contact-card">
                    <div class="bk-contact-top">
                      <h4 style="margin:0">Responsable de la reserva</h4>
                      <select class="bk-contact-select" id="bk-contact-source" style="margin-top:10px">
                        ${personOptions}
                        <option value="otra" ${contactSource === 'otra' ? 'selected' : ''}>Otra persona</option>
                      </select>
                    </div>
                    <div style="position:relative;margin-bottom:16px">
                      <input type="text" class="bk-contact-search" id="bk-contact-search" placeholder="Buscar cliente existente…" style="width:100%" />
                    </div>
                    ${contactData.profileId ? `<div style="padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:16px;display:flex;align-items:center;gap:8px">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      <span style="font-size:.82rem;color:#065f46;font-weight:600">Cliente vinculado</span>
                    </div>` : ''}

                    <div class="bk-contact-fields">
                      <div class="bk-contact-field">
                        <label>Nombre <span class="required">*</span></label>
                        <input type="text" id="bk-co-nombre" value="${contactData.nombre}" placeholder="Nombre" />
                      </div>
                      <div class="bk-contact-field">
                        <label>Apellidos <span class="required">*</span></label>
                        <input type="text" id="bk-co-apellidos" value="${contactData.apellidos}" placeholder="Apellidos" />
                      </div>
                      <div class="bk-contact-field full-width">
                        <label>Email <span class="required">*</span></label>
                        <input type="email" id="bk-co-email" value="${contactData.email}" placeholder="email@ejemplo.com" />
                      </div>
                      <div class="bk-contact-field">
                        <label>Teléfono</label>
                        <div class="bk-phone-row">
                          <input type="text" class="bk-phone-prefix" value="+34" id="bk-co-prefix" />
                          <input type="tel" id="bk-co-telefono" value="${contactData.telefono}" placeholder="600 000 000" style="flex:1" />
                        </div>
                      </div>
                      <div class="bk-contact-field">
                        <label>País de origen</label>
                        <select id="bk-co-pais">
                          <option value="">Seleccionar</option>
                          <option value="ES" ${contactData.pais === 'ES' ? 'selected' : ''}>España</option>
                          <option value="FR" ${contactData.pais === 'FR' ? 'selected' : ''}>Francia</option>
                          <option value="DE" ${contactData.pais === 'DE' ? 'selected' : ''}>Alemania</option>
                          <option value="UK" ${contactData.pais === 'UK' ? 'selected' : ''}>Reino Unido</option>
                          <option value="PT" ${contactData.pais === 'PT' ? 'selected' : ''}>Portugal</option>
                          <option value="IT" ${contactData.pais === 'IT' ? 'selected' : ''}>Italia</option>
                          <option value="OTHER" ${contactData.pais === 'OTHER' ? 'selected' : ''}>Otro</option>
                        </select>
                      </div>
                      <div class="bk-contact-field">
                        <label>Idioma</label>
                        <select id="bk-co-idioma">
                          <option value="Español" ${contactData.idioma === 'Español' ? 'selected' : ''}>Español</option>
                          <option value="English" ${contactData.idioma === 'English' ? 'selected' : ''}>English</option>
                          <option value="Français" ${contactData.idioma === 'Français' ? 'selected' : ''}>Français</option>
                          <option value="Deutsch" ${contactData.idioma === 'Deutsch' ? 'selected' : ''}>Deutsch</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- RIGHT: Purchase Summary -->
              <div>
                <div class="bk-purchase-card">
                  <div class="bk-purchase-header" style="background: ${color}">
                    <h4>Su Compra</h4>
                  </div>
                  <div class="bk-purchase-body">
                    <div class="bk-purchase-item">
                      <div class="bk-purchase-item-row">
                        <div>
                          <div class="bk-purchase-item-name">${label}</div>
                          <div class="bk-purchase-item-meta">${persons.length} persona(s), ${totalQty} sesión(es)</div>
                        </div>
                        <div class="bk-purchase-item-price">${subtotal.toFixed(2)}€</div>
                      </div>
                      ${persons.map((p, i) => {
                        const name = p.profileId ? p.profileName : `${p.nombre} ${p.apellidos}`.trim() || `Persona ${i + 1}`;
                        return `<div class="bk-purchase-person-detail">
                          <span>${name}: ${p.sessions.length} sesión(es)</span>
                        </div>`;
                      }).join('')}
                      <div class="bk-purchase-item-actions">
                        <a class="bk-link-edit" id="bk-edit-booking">Editar</a>
                      </div>
                    </div>

                    ${(() => {
                      // Credit cards for persons with bonos — show ALL bonos with payment status
                      const creditSections = persons.map((p, i) => {
                        const pc = personCredits[p.id];
                        if (!pc || !pc.allBonos?.length) return '';
                        const name = p.profileId ? p.profileName : `${p.nombre} ${p.apellidos}`.trim() || `Persona ${i+1}`;

                        // Use credit toggle
                        let html = `<div style="margin-bottom:6px">
                          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 0">
                            <input type="checkbox" class="bk-use-credit" data-person-id="${p.id}" ${pc.useCredit ? 'checked' : ''} />
                            <div style="flex:1">
                              <div style="font-size:.85rem;font-weight:700;color:var(--color-navy)">${name} — usar crédito</div>
                            </div>
                          </label>
                        </div>`;

                        if (pc.useCredit) {
                          // Show all bonos to choose from
                          html += pc.allBonos.map(b => {
                            const remaining = b.total_credits - b.used_credits;
                            const paid = b.totalPaidReal;
                            const isSelected = pc.selectedBonoId === b.id;
                            const borderColor = isSelected ? (b.isFullyPaid ? '#22c55e' : '#f59e0b') : '#e2e8f0';
                            const bgColor = isSelected ? (b.isFullyPaid ? '#f0fdf4' : '#fffbeb') : '#fff';
                            return `
                            <div class="bk-bono-option" data-person-id="${p.id}" data-bono-id="${b.id}" style="padding:10px 14px;margin-bottom:6px;border:2px solid ${borderColor};background:${bgColor};border-radius:8px;cursor:pointer;transition:all .15s">
                              <div style="display:flex;justify-content:space-between;align-items:center">
                                <div>
                                  <div style="font-size:.85rem;font-weight:700;color:#0f2f39">Bono ${b.total_credits} clases</div>
                                  <div style="font-size:.75rem;color:var(--color-muted)">${remaining} créditos restantes</div>
                                </div>
                                <div style="text-align:right">
                                  ${b.isFullyPaid
                                    ? '<span style="font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:6px;background:#dcfce7;color:#166534">PAGADO</span>'
                                    : `<span style="font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:6px;background:#fef3c7;color:#92400e">PENDIENTE ${b.pendingAmount.toFixed(2)}\u20ac</span>`
                                  }
                                </div>
                              </div>
                              <div style="font-size:.72rem;margin-top:4px;color:var(--color-muted)">Pagado: ${paid.toFixed(2)}\u20ac de ${b.expectedPrice.toFixed(2)}\u20ac</div>
                            </div>`;
                          }).join('');
                        }

                        return html;
                      }).join('');
                      return creditSections ? `<div style="margin-bottom:12px"><div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-navy);margin-bottom:8px">Créditos en cuenta</div>${creditSections}</div>` : '';
                    })()}

                    <div class="bk-total-row">
                      <span>Total</span>
                      <span>${total.toFixed(2)}€</span>
                    </div>

                    <div class="bk-checkout-options" ${allCoveredByCredits() ? 'style="display:none"' : ''}>
                      <div class="bk-checkout-option">
                        <input type="checkbox" id="bk-opt-anticipo" ${cobrarAnticipo ? 'checked' : ''} />
                        <div>
                          <span class="bk-checkout-option-text">Cobrar anticipo</span>
                        </div>
                      </div>
                      <div id="bk-payment-section" style="display:${cobrarAnticipo ? 'block' : 'none'}">
                        <div class="bk-anticipo-amount-row" style="margin-bottom:10px">
                          <label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">Importe del anticipo</label>
                          <div style="display:flex;align-items:center;gap:8px">
                            <input type="number" id="bk-anticipo-amount" value="${anticipoAmount || ''}" min="0" max="${total.toFixed(2)}" step="0.01" placeholder="${total.toFixed(2)}" style="flex:1;padding:8px 10px;border:1px solid var(--color-line);border-radius:var(--radius-sm);font-size:.9rem" />
                            <span style="font-size:.85rem;color:var(--color-muted)">€ de ${total.toFixed(2)}€</span>
                          </div>
                          <div style="margin-top:6px;display:flex;gap:6px">
                            <button type="button" class="bk-anticipo-preset" data-pct="100" style="font-size:.72rem;padding:3px 8px;border:1px solid var(--color-line);border-radius:4px;background:${anticipoAmount === total ? '#e8f5e9' : '#fff'};cursor:pointer">Total</button>
                            <button type="button" class="bk-anticipo-preset" data-pct="50" style="font-size:.72rem;padding:3px 8px;border:1px solid var(--color-line);border-radius:4px;background:${anticipoAmount === Math.round(total * 50) / 100 ? '#e8f5e9' : '#fff'};cursor:pointer">50%</button>
                            <button type="button" class="bk-anticipo-preset" data-pct="30" style="font-size:.72rem;padding:3px 8px;border:1px solid var(--color-line);border-radius:4px;cursor:pointer">30%</button>
                          </div>
                        </div>
                        <label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">Método de pago</label>
                        <div class="bk-payment-methods">
                          <div class="bk-payment-method ${paymentMethod === 'efectivo' ? 'selected' : ''}" data-method="efectivo">
                            <span class="bk-payment-method-icon">💵</span>
                            <span class="bk-payment-method-label">Efectivo</span>
                          </div>
                          <div class="bk-payment-method ${paymentMethod === 'tarjeta' ? 'selected' : ''}" data-method="tarjeta">
                            <span class="bk-payment-method-icon">💳</span>
                            <span class="bk-payment-method-label">Tarjeta</span>
                          </div>
                          <div class="bk-payment-method ${paymentMethod === 'transferencia' ? 'selected' : ''}" data-method="transferencia">
                            <span class="bk-payment-method-icon">🏦</span>
                            <span class="bk-payment-method-label">Transferencia</span>
                          </div>
                          <div class="bk-payment-method ${paymentMethod === 'voucher' ? 'selected' : ''}" data-method="voucher">
                            <span class="bk-payment-method-icon">🎟️</span>
                            <span class="bk-payment-method-label">Voucher</span>
                          </div>
                        </div>
                        ${anticipoAmount > 0 ? `<div style="margin-top:8px;padding:8px 12px;background:#f0fdf4;border-radius:6px;font-size:.82rem">
                          <strong>Pendiente tras anticipo:</strong> ${(total - anticipoAmount).toFixed(2)}€
                        </div>` : ''}
                      </div>

                      <div class="bk-checkout-option">
                        <input type="checkbox" id="bk-opt-confirmacion" ${enviarConfirmacion ? 'checked' : ''} />
                        <div>
                          <span class="bk-checkout-option-text">Enviar confirmación de reserva</span>
                        </div>
                      </div>
                    </div>

                    <div class="bk-checkout-buttons">
                      <button class="bk-final-confirm-btn" id="bk-final-confirm">Confirmar</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>`;

        // Replace panel body
        const overlay = document.getElementById('bk-overlay');
        if (!overlay) return;
        const panelBody = overlay.querySelector('.bk-panel-body');
        if (panelBody) panelBody.outerHTML = checkoutHtml.trim();

        // Update header: add back button and update confirm button
        const headerLeft = overlay.querySelector('.bk-header-left');
        if (headerLeft && !overlay.querySelector('#bk-checkout-back')) {
          const backBtn = document.createElement('button');
          backBtn.className = 'bk-back-btn';
          backBtn.id = 'bk-checkout-back';
          backBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>';
          backBtn.style.cssText = 'background:none;border:none;color:#fff;cursor:pointer;padding:4px;margin-right:8px;display:flex;align-items:center';
          headerLeft.prepend(backBtn);
        }
        const headerConfirmBtn = overlay.querySelector('#bk-confirm');
        if (headerConfirmBtn) {
          headerConfirmBtn.textContent = 'PASO 2';
          headerConfirmBtn.disabled = true;
          headerConfirmBtn.style.background = '#94a3b8';
        }

        bindCheckoutEvents();
        // Back button goes to booking panel (step 1)
        overlay.querySelector('#bk-checkout-back')?.addEventListener('click', () => {
          renderPanel();
        });
      }

      function bindCheckoutEvents() {
        const overlay = document.getElementById('bk-overlay');
        if (!overlay) return;

        // Contact source selector
        overlay.querySelector('#bk-contact-source')?.addEventListener('change', async (e) => {
          contactSource = e.target.value;
          if (contactSource.startsWith('persona_')) {
            const idx = parseInt(contactSource.split('_')[1]) - 1;
            const p = persons[idx];
            if (p) {
              contactData = { nombre: '', apellidos: '', email: '', telefono: '', pais: '', idioma: 'Español', profileId: null };
              await prefillContactFromPerson(p);
            }
          } else {
            contactData = { nombre: '', apellidos: '', email: '', telefono: '', pais: '', idioma: 'Español', profileId: null };
          }
          renderCheckout();
        });

        // Contact search (for linking to existing client — adults only)
        let searchDebounce = null;
        const searchInput = overlay.querySelector('#bk-contact-search');
        searchInput?.addEventListener('input', () => {
          clearTimeout(searchDebounce);
          overlay.querySelector('.bk-contact-results')?.remove();
          searchDebounce = setTimeout(async () => {
            const term = searchInput.value.trim();
            if (term.length < 2) return;
            try {
              const profiles = await searchProfiles(term);
              if (!profiles.length) return;
              // Fetch emails for each profile via RPC
              const enriched = await Promise.all(profiles.map(async (pr) => {
                let email = '';
                try {
                  const { data } = await supabase.rpc('get_user_email', { p_user_id: pr.id });
                  email = data || '';
                } catch {}
                return { ...pr, email };
              }));
              const resultsEl = document.createElement('div');
              resultsEl.className = 'bk-contact-results';
              resultsEl.innerHTML = enriched.map(pr => `
                <button type="button" class="bk-contact-result" data-id="${pr.id}" data-name="${pr.full_name || ''}" data-email="${pr.email || ''}" data-phone="${pr.phone || ''}">
                  <strong>${pr.full_name || 'Sin nombre'}</strong>
                  <small>${pr.email || ''} ${pr.phone ? '· ' + pr.phone : ''}</small>
                </button>
              `).join('');
              searchInput.parentNode.appendChild(resultsEl);
              resultsEl.querySelectorAll('.bk-contact-result').forEach(btn => {
                btn.addEventListener('click', async () => {
                  const pid = btn.dataset.id;
                  contactData.profileId = pid;
                  // Fetch full profile to get all fields
                  try {
                    const { data: fullProfile } = await supabase.from('profiles').select('*').eq('id', pid).single();
                    if (fullProfile) {
                      contactData.nombre = (fullProfile.full_name || '').trim();
                      contactData.apellidos = (fullProfile.last_name || '').trim();
                      contactData.telefono = fullProfile.phone || '';
                    }
                  } catch {}
                  contactData.email = btn.dataset.email || '';
                  searchInput.value = '';
                  resultsEl.remove();
                  renderCheckout();
                  showToast(`Cliente vinculado: ${btn.dataset.name || btn.dataset.email}`, 'success');
                });
              });
            } catch (err) { /* silent */ }
          }, 400);
        });

        // Save contact fields on input
        ['bk-co-nombre', 'bk-co-apellidos', 'bk-co-email', 'bk-co-telefono'].forEach(id => {
          overlay.querySelector(`#${id}`)?.addEventListener('input', (e) => {
            const key = id.replace('bk-co-', '');
            contactData[key] = e.target.value;
          });
        });
        overlay.querySelector('#bk-co-pais')?.addEventListener('change', (e) => { contactData.pais = e.target.value; });
        overlay.querySelector('#bk-co-idioma')?.addEventListener('change', (e) => { contactData.idioma = e.target.value; });

        // Use credit checkboxes
        overlay.querySelectorAll('.bk-use-credit').forEach(cb => {
          cb.addEventListener('change', (e) => {
            const pid = cb.dataset.personId;
            if (personCredits[pid]) {
              personCredits[pid].useCredit = e.target.checked;
            }
            // If all covered by credits, disable anticipo
            if (allCoveredByCredits()) {
              cobrarAnticipo = false;
              paymentMethod = null;
            }
            renderCheckout();
          });
        });

        // Bono selection (choose which bono to use)
        overlay.querySelectorAll('.bk-bono-option').forEach(opt => {
          opt.addEventListener('click', () => {
            const pid = opt.dataset.personId;
            const bonoId = opt.dataset.bonoId;
            if (personCredits[pid]) {
              personCredits[pid].selectedBonoId = bonoId;
              personCredits[pid].bono = personCredits[pid].allBonos?.find(b => b.id === bonoId) || personCredits[pid].bono;
            }
            renderCheckout();
          });
        });

        // Cobrar anticipo toggle
        overlay.querySelector('#bk-opt-anticipo')?.addEventListener('change', (e) => {
          cobrarAnticipo = e.target.checked;
          if (!cobrarAnticipo) paymentMethod = null;
          renderCheckout();
        });

        // Anticipo amount
        overlay.querySelector('#bk-anticipo-amount')?.addEventListener('input', (e) => {
          anticipoAmount = parseFloat(e.target.value) || 0;
          // Don't re-render on every keystroke, just update the pending display
        });
        overlay.querySelector('#bk-anticipo-amount')?.addEventListener('change', (e) => {
          anticipoAmount = parseFloat(e.target.value) || 0;
          renderCheckout();
        });
        overlay.querySelectorAll('.bk-anticipo-preset').forEach(btn => {
          btn.addEventListener('click', () => {
            const pct = parseInt(btn.dataset.pct);
            anticipoAmount = Math.round(getTotal() * pct) / 100;
            renderCheckout();
          });
        });

        // Payment methods
        overlay.querySelectorAll('.bk-payment-method').forEach(el => {
          el.addEventListener('click', () => {
            paymentMethod = el.dataset.method;
            renderCheckout();
          });
        });

        // Checkbox options
        overlay.querySelector('#bk-opt-confirmacion')?.addEventListener('change', (e) => { enviarConfirmacion = e.target.checked; });

        // Back to booking (edit)
        overlay.querySelector('#bk-edit-booking')?.addEventListener('click', (e) => {
          e.preventDefault();
          renderPanel();
        });

        // Final confirm
        overlay.querySelector('#bk-final-confirm')?.addEventListener('click', async () => {
          if (!contactData.nombre.trim()) { showToast('El nombre de contacto es obligatorio', 'error'); return; }
          if (!contactData.email.trim()) { showToast('El email de contacto es obligatorio', 'error'); return; }
          if (cobrarAnticipo && !paymentMethod) { showToast('Selecciona un método de pago para el anticipo', 'error'); return; }
          if (cobrarAnticipo && !anticipoAmount) {
            // Default to full amount if not specified
            anticipoAmount = getTotal();
          }

          const btn = overlay.querySelector('#bk-final-confirm');
          btn.disabled = true;
          btn.textContent = 'Guardando…';

          try {
            // Link contact profile to first person if available from search
            if (contactData.profileId && !persons[0].profileId) {
              persons[0].profileId = contactData.profileId;
              persons[0].profileName = contactData.nombre;
            }

            // Create client accounts for new persons (not linked to existing client)
            for (let pi = 0; pi < persons.length; pi++) {
              const p = persons[pi];
              if (!p.profileId && p.nombre.trim()) {
                // First person uses contact email; others are guest-only
                const personEmail = (pi === 0 && contactData.email) ? contactData.email : null;
                if (personEmail) {
                  try {
                    const newClient = await createClientFromAdmin({
                      full_name: `${p.nombre} ${p.apellidos}`.trim(),
                      email: personEmail,
                      phone: (pi === 0 && contactData.telefono) ? contactData.telefono : null,
                    });
                    if (newClient?.id) {
                      p.profileId = newClient.id;
                      p.profileName = newClient.full_name;
                    }
                  } catch (profileErr) {
                    console.warn('Could not create client for', p.nombre, profileErr.message);
                    // Continue without profile — will use guest_name instead
                  }
                }
              }
            }

            // Create enrollments — the DB trigger auto-updates enrolled_count
            for (const p of persons) {
              const pc = personCredits[p.id];
              const usingCredit = pc?.useCredit && pc.bono;

              for (const sid of p.sessions) {
                const enrollData = {
                  class_id: sid,
                  created_at: new Date().toISOString(),
                };

                if (usingCredit) {
                  // Credit from bono — use selected bono
                  const selectedBono = pc.allBonos?.find(b => b.id === pc.selectedBonoId) || pc.bono;
                  enrollData.bono_id = selectedBono.id;
                  // If bono has pending payment (e.g. only 15€ deposit paid), mark as partial (orange)
                  enrollData.status = selectedBono.isFullyPaid ? 'paid' : 'partial';
                } else {
                  enrollData.status = (cobrarAnticipo && anticipoAmount >= getTotal()) ? 'paid' : (cobrarAnticipo && anticipoAmount > 0) ? 'partial' : 'confirmed';
                }

                if (p.profileId) {
                  enrollData.user_id = p.profileId;
                  if (p.familyMemberId) {
                    enrollData.family_member_id = p.familyMemberId;
                    enrollData.guest_name = p.profileName;
                  }
                } else {
                  enrollData.guest_name = `${p.nombre} ${p.apellidos}`.trim() || 'Invitado';
                }
                await createEnrollment(enrollData);
              }

              // Consume bono credits
              if (usingCredit) {
                const selectedBono = pc.allBonos?.find(b => b.id === pc.selectedBonoId) || pc.bono;
                const sessionsUsed = p.sessions.length;
                await supabase.from('bonos').update({
                  used_credits: selectedBono.used_credits + sessionsUsed,
                  updated_at: new Date().toISOString(),
                }).eq('id', selectedBono.id);
              }
            }

            const total = getTotal();
            const reservationData = {
              id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
              createdAt: new Date(),
              status: cobrarAnticipo ? (anticipoAmount >= total ? 'paid' : anticipoAmount > 0 ? 'partial' : 'confirmed') : 'confirmed',
              total: subtotal,
              discount: getDiscount(),
              totalFinal: total,
              anticipoAmount: cobrarAnticipo ? anticipoAmount : 0,
              pending: cobrarAnticipo ? Math.max(0, total - anticipoAmount) : total,
              paymentMethod,
              cobrarAnticipo,
              crearInvitacion,
              ocultarPrecios,
              enviarConfirmacion,
              contact: { ...contactData },
              persons: persons.map(p => ({...p})),
              personCredits: JSON.parse(JSON.stringify(personCredits)),
              sessions: Object.keys(sessionQuantities).map(sid => {
                const s = sameTypeWeek.find(c => c.id === sid) || weekClasses.find(c => c.id === sid);
                return s ? {...s} : null;
              }).filter(Boolean),
              activityType: cls.type,
              activityLabel: label,
              activityColor: color,
              payments: [],
            };

            showToast('Reserva confirmada', 'success');
            openReservationDetail(reservationData, overlay);
          } catch (err) {
            showToast('Error: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Confirmar';
          }
        });
      }

      renderCheckout();
    }

    // ======== RESERVATION DETAIL VIEW ========
    function openReservationDetail(res, overlay) {
      const now = res.createdAt;
      const dateStr = `${DAY_NAMES_FULL[now.getDay()].toLowerCase()}, ${now.getDate()} de ${MONTH_NAMES[now.getMonth()].toLowerCase().replace('.', '')} de ${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const shortId = res.id.slice(0, 24);
      const statusLabel = res.status === 'paid' ? 'Pagado' : 'Confirmado';
      const statusColor = res.status === 'paid' ? '#166534' : '#0ea5e9';
      const pendingColor = res.pending > 0 ? '#b91c1c' : '#166534';
      let activeTab = 'resumen';

      // Session dates for check-in/out
      const sessionDates = res.sessions.map(s => s.date).sort();
      const checkIn = sessionDates[0] || '';
      const checkOut = sessionDates[sessionDates.length - 1] || '';

      function getInitial(name) {
        return (name || '?')[0].toUpperCase();
      }

      function formatDetailDate(ds) {
        if (!ds) return '';
        const d = new Date(ds + 'T00:00:00');
        return `${DAY_NAMES_SHORT[d.getDay()].toLowerCase()}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()].toLowerCase()}`;
      }

      function renderDetail() {
        // Build persons + sessions table
        let personsHtml = '';
        res.persons.forEach(p => {
          const name = p.profileId ? p.profileName : `${p.nombre} ${p.apellidos}`.trim();
          const initial = getInitial(name);

          // Get sessions for this person
          const personSessions = p.sessions.map(sid => {
            return res.sessions.find(s => s.id === sid);
          }).filter(Boolean);

          personsHtml += `
            <div class="rv-person-card">
              <div class="rv-person-header">
                <div class="rv-person-avatar" style="background:${res.activityColor}">${initial}</div>
                <div class="rv-person-info">
                  <span class="rv-person-name">${name}</span>
                  <span class="rv-lang-badge">${res.contact.idioma || 'Español'}</span>
                </div>
                <button class="rv-person-menu-btn" title="Opciones">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                </button>
              </div>
              <div class="rv-person-actions">
                <button class="rv-icon-btn" title="WhatsApp"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#25d366" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg></button>
                <button class="rv-icon-btn" title="Llamar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></button>
                <button class="rv-icon-btn" title="Email"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></button>
                <button class="rv-icon-btn" title="Añadir sesión"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg></button>
              </div>
              <table class="rv-sessions-table">
                <thead>
                  <tr><th>Fechas</th><th>Producto</th><th></th></tr>
                </thead>
                <tbody>
                  ${personSessions.map(s => `
                    <tr>
                      <td>${formatDetailDate(s.date)} / ${s.time_start?.slice(0,5)} a ${s.time_end?.slice(0,5)}</td>
                      <td>
                        <span class="rv-product-icon">⚡</span>
                        <span class="rv-product-qty">1</span>
                        <span class="rv-product-name">${TYPE_LABELS[s.type] || s.title}</span>
                      </td>
                      <td class="rv-session-row-actions">
                        <button class="rv-icon-btn small" title="Eliminar"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
                        <button class="rv-icon-btn small" title="Editar"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button class="rv-icon-btn small" title="Expandir"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`;
        });

        // Tabs content
        let tabContent = '';
        if (activeTab === 'resumen') {
          // Build bonos section for linked persons
          let bonosHtml = '';
          const linkedPersons = res.persons.filter(p => p.profileId);
          if (linkedPersons.length > 0 || res.personCredits) {
            let bonoCards = '';
            for (const p of res.persons) {
              const pc = res.personCredits?.[p.id];
              if (!pc || !pc.allBonos?.length) continue;
              const name = p.profileName || `${p.nombre} ${p.apellidos}`.trim();
              bonoCards += pc.allBonos.map(b => {
                const remaining = b.total_credits - b.used_credits;
                const isSelected = pc.selectedBonoId === b.id && pc.useCredit;
                const paidPct = b.expectedPrice > 0 ? Math.min(100, (b.totalPaidReal / b.expectedPrice) * 100) : 0;
                return `
                  <div class="rv-bono-card ${isSelected ? 'rv-bono-active' : ''}" data-person-id="${p.id}" data-bono-id="${b.id}">
                    <div class="rv-bono-header">
                      <span class="rv-bono-name">${name}</span>
                      <span class="rv-bono-badge ${isSelected ? 'rv-bono-badge-active' : ''}">${isSelected ? 'En uso' : 'Disponible'}</span>
                    </div>
                    <div class="rv-bono-details">
                      <span>${TYPE_LABELS[b.class_type] || b.class_type} · ${remaining}/${b.total_credits} clases</span>
                    </div>
                    <div class="rv-bono-pay-row">
                      <div class="rv-bono-bar"><div class="rv-bono-bar-fill" style="width:${paidPct}%;background:${b.isFullyPaid ? '#22c55e' : '#f59e0b'}"></div></div>
                      <span class="rv-bono-pay-label">${b.totalPaidReal.toFixed(2)}€ / ${b.expectedPrice.toFixed(2)}€</span>
                      ${!b.isFullyPaid ? `<button class="rv-bono-pay-btn" data-bono-id="${b.id}" data-pending="${b.pendingAmount.toFixed(2)}" data-person-id="${p.id}">Pagar ${b.pendingAmount.toFixed(2)}€</button>` : '<span style="color:#166534;font-size:.75rem;font-weight:600">PAGADO</span>'}
                    </div>
                  </div>`;
              }).join('');
            }

            // Credit balance
            let creditHtml = '';
            for (const p of res.persons) {
              if (!p.profileId) continue;
              // We'll load this async, but show placeholder
              creditHtml += `<div class="rv-credit-row" data-profile-id="${p.profileId}" data-person-name="${p.profileName || p.nombre}"></div>`;
            }

            if (bonoCards || creditHtml) {
              bonosHtml = `
                <div class="rv-info-card" style="margin-top:16px">
                  <h3 style="font-family:'Space Grotesk',sans-serif;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb">Bonos y Saldo</h3>
                  ${bonoCards}
                  <div id="rv-credit-balances">${creditHtml}</div>
                </div>`;
            }
          }

          tabContent = `
            <div class="rv-summary-header">
              <h2 class="rv-title">Resumen de la reserva <span class="rv-status-badge" style="background:${statusColor}15;color:${statusColor}">${statusLabel}</span></h2>
            </div>
            <div class="rv-info-card">
              <div class="rv-info-top">
                <div class="rv-info-top-left">
                  <div class="rv-info-id">Reserva ${shortId}</div>
                  <div class="rv-info-created">Creada el ${dateStr} · Por ADMIN</div>
                </div>
                <div class="rv-info-top-right">
                  <div class="rv-info-stat">
                    <label>Total</label>
                    <span class="rv-info-amount">${res.totalFinal.toFixed(2)}€</span>
                  </div>
                  <div class="rv-info-stat">
                    <label>Pendiente</label>
                    <span class="rv-info-amount" style="color:${pendingColor}">${res.pending.toFixed(2)}€</span>
                  </div>
                  <button class="rv-add-payment-btn" id="rv-add-payment">+ Añadir pago</button>
                </div>
              </div>
              <div class="rv-info-bottom">
                <div class="rv-info-detail">
                  <label>Reservado por</label>
                  <div>
                    <strong>${res.contact.nombre} ${res.contact.apellidos}</strong>
                    <span class="rv-lang-badge">${res.contact.idioma || 'Español'}</span>
                  </div>
                  <div class="rv-contact-links">
                    ${res.contact.telefono ? `<span class="rv-contact-link"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#25d366" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg> +34${res.contact.telefono}</span>` : ''}
                    ${res.contact.email ? `<span class="rv-contact-link"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> ${res.contact.email}</span>` : ''}
                  </div>
                </div>
                <div class="rv-info-detail">
                  <label>Check in / Check out</label>
                  <div class="rv-check-dates">
                    <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${formatDetailDate(checkIn)}</span>
                    <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${formatDetailDate(checkOut)}</span>
                  </div>
                </div>
                <div class="rv-info-detail">
                  <label>Personas</label>
                  <div class="rv-persons-count">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    ${res.persons.length}
                  </div>
                </div>
              </div>
            </div>
            ${bonosHtml}
            ${personsHtml}`;
        } else if (activeTab === 'datos_comprador') {
          tabContent = `
            <h2 class="rv-title">Datos del Comprador</h2>
            <div class="rv-info-card" style="padding:24px">
              <div class="bk-contact-fields">
                <div class="bk-contact-field"><label>Nombre</label><input type="text" value="${res.contact.nombre}" readonly /></div>
                <div class="bk-contact-field"><label>Apellidos</label><input type="text" value="${res.contact.apellidos}" readonly /></div>
                <div class="bk-contact-field"><label>Email</label><input type="email" value="${res.contact.email}" readonly /></div>
                <div class="bk-contact-field"><label>Teléfono</label><input type="tel" value="${res.contact.telefono}" readonly /></div>
                <div class="bk-contact-field"><label>País</label><input type="text" value="${res.contact.pais}" readonly /></div>
                <div class="bk-contact-field"><label>Idioma</label><input type="text" value="${res.contact.idioma}" readonly /></div>
              </div>
            </div>`;
        } else if (activeTab === 'datos_internos') {
          tabContent = `
            <h2 class="rv-title">Datos Internos</h2>
            <div class="rv-info-card" style="padding:24px">
              <div class="bk-contact-fields">
                <div class="bk-contact-field"><label>ID Reserva</label><input type="text" value="${res.id}" readonly /></div>
                <div class="bk-contact-field"><label>Creada</label><input type="text" value="${dateStr}" readonly /></div>
                <div class="bk-contact-field"><label>Estado</label><input type="text" value="${statusLabel}" readonly /></div>
                <div class="bk-contact-field"><label>Origen</label><input type="text" value="Manual (Admin)" readonly /></div>
                <div class="bk-contact-field full-width">
                  <label>Notas internas</label>
                  <textarea class="rv-notes-textarea" id="rv-notes" rows="4" placeholder="Añadir notas internas sobre esta reserva…"></textarea>
                </div>
              </div>
            </div>`;
        } else if (activeTab === 'pagos') {
          const METHOD_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', voucher: 'Voucher', saldo: 'Saldo a favor', online: 'Online' };
          const allPayments = [...(res.payments || [])];
          if (res.cobrarAnticipo && res.anticipoAmount > 0) {
            allPayments.unshift({ amount: res.anticipoAmount, method: res.paymentMethod, date: res.createdAt.toISOString(), creditUsed: 0 });
          }
          const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0);

          let paymentsListHtml = '';
          if (allPayments.length) {
            paymentsListHtml = allPayments.map(p => {
              const d = new Date(p.date);
              const dateLabel = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
              return `
                <div class="rv-pay-row">
                  <span>${dateLabel} · ${METHOD_LABELS[p.method] || p.method}${p.creditUsed > 0 ? ` (${p.creditUsed.toFixed(2)}€ saldo)` : ''}</span>
                  <strong style="color:#166534">+${p.amount.toFixed(2)}€</strong>
                </div>`;
            }).join('');
          } else {
            paymentsListHtml = '<p style="font-size:.85rem;color:#6b7280">No hay pagos registrados</p>';
          }

          tabContent = `
            <h2 class="rv-title">Pagos</h2>
            <div class="rv-info-card" style="padding:24px">
              <div class="rv-payments-summary">
                <div class="rv-pay-row"><span>Total reserva</span><strong>${res.totalFinal.toFixed(2)}€</strong></div>
                ${res.discount > 0 ? `<div class="rv-pay-row"><span>Descuento</span><span style="color:#b91c1c">-${res.discount.toFixed(2)}€</span></div>` : ''}
                <div class="rv-pay-row" style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:4px"><span>Total pagado</span><strong style="color:#166534">${totalPaid.toFixed(2)}€</strong></div>
                <div class="rv-pay-row total"><span>Pendiente</span><strong style="color:${pendingColor}">${res.pending.toFixed(2)}€</strong></div>
              </div>
              <div style="margin-top:16px;padding-top:12px;border-top:1px dashed #e5e7eb">
                <h4 style="font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin:0 0 8px">Historial de pagos</h4>
                ${paymentsListHtml}
              </div>
              <button class="rv-add-payment-btn" id="rv-add-payment-tab" style="margin-top:16px">+ Añadir pago</button>
            </div>`;
        } else if (activeTab === 'mensajes') {
          tabContent = `
            <h2 class="rv-title">Mensajes</h2>
            <div class="rv-info-card" style="padding:24px">
              <div class="rv-empty-state">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                <p>No hay mensajes enviados</p>
                <button class="rv-add-payment-btn" style="margin-top:8px">Enviar mensaje</button>
              </div>
            </div>`;
        } else if (activeTab === 'historico') {
          tabContent = `
            <h2 class="rv-title">Histórico</h2>
            <div class="rv-info-card" style="padding:24px">
              <div class="rv-timeline">
                <div class="rv-timeline-item">
                  <div class="rv-timeline-dot" style="background:#22c55e"></div>
                  <div class="rv-timeline-content">
                    <strong>Reserva creada</strong>
                    <span>${dateStr}</span>
                    <small>Por ADMIN · Manual</small>
                  </div>
                </div>
                ${res.cobrarAnticipo ? `
                <div class="rv-timeline-item">
                  <div class="rv-timeline-dot" style="background:#0ea5e9"></div>
                  <div class="rv-timeline-content">
                    <strong>Pago registrado (${res.paymentMethod})</strong>
                    <span>${dateStr}</span>
                    <small>${res.totalFinal.toFixed(2)}€</small>
                  </div>
                </div>` : ''}
              </div>
            </div>`;
        }

        const detailHtml = `
          <div class="rv-layout">
            <nav class="rv-sidebar">
              <a class="rv-nav-item ${activeTab === 'resumen' ? 'active' : ''}" data-tab="resumen">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                Resumen
              </a>
              <div class="rv-nav-group">Cliente</div>
              <a class="rv-nav-item ${activeTab === 'datos_comprador' ? 'active' : ''}" data-tab="datos_comprador">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4-4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Datos del comprador
              </a>
              <div class="rv-nav-group">Gestión</div>
              <a class="rv-nav-item ${activeTab === 'datos_internos' ? 'active' : ''}" data-tab="datos_internos">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Datos internos
              </a>
              <a class="rv-nav-item ${activeTab === 'pagos' ? 'active' : ''}" data-tab="pagos">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                Pagos
              </a>
              <a class="rv-nav-item" data-tab="agencia">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                Agencia
              </a>
              <a class="rv-nav-item ${activeTab === 'mensajes' ? 'active' : ''}" data-tab="mensajes">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Mensajes
              </a>
              <a class="rv-nav-item ${activeTab === 'historico' ? 'active' : ''}" data-tab="historico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Histórico
              </a>
            </nav>

            <main class="rv-main">
              ${tabContent}
            </main>

            <aside class="rv-actions">
              <button class="rv-action-link danger" id="rv-cancel">
                <span>Cancelar</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </button>
              <button class="rv-action-link" id="rv-ampliar">
                <span>Ampliar</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button class="rv-action-link" id="rv-send-email">
                <span>Enviar Email</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
              <button class="rv-action-link" id="rv-share">
                <span>Compartir</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
              <button class="rv-action-link" id="rv-download">
                <span>Descargar</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <div class="rv-actions-separator"></div>
              <div class="rv-other-details">
                <div class="rv-other-title">Otros Detalles</div>
                <div class="rv-other-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  Manual
                </div>
              </div>
            </aside>
          </div>`;

        // Replace panel content
        const panel = overlay.querySelector('.bk-panel');
        if (!panel) return;

        // Update header
        const panelHeader = panel.querySelector('.bk-panel-header');
        if (panelHeader) {
          panelHeader.innerHTML = `
            <button class="bk-close-btn" id="rv-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div class="bk-header-left">
              <span class="bk-header-title">Ficha de Reserva</span>
            </div>`;
          panelHeader.style.background = res.activityColor;
          // Remove confirm button area
          const headerRight = panelHeader.querySelector('.bk-header-right');
          if (headerRight) headerRight.remove();
        }

        // Replace body
        const panelBody = panel.querySelector('.bk-panel-body');
        if (panelBody) {
          panelBody.outerHTML = `<div class="bk-panel-body" style="padding:0">${detailHtml}</div>`;
        }

        // Make panel fullscreen for reservation detail
        panel.classList.add('bk-panel-fullscreen');
        overlay.classList.add('bk-overlay-fullscreen');

        bindDetailEvents(overlay, res);
      }

      function bindDetailEvents(overlay, res) {
        // Close
        overlay.querySelector('#rv-close')?.addEventListener('click', () => {
          overlay.remove();
          render();
        });

        // Tab navigation
        overlay.querySelectorAll('.rv-nav-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = item.dataset.tab;
            if (tab) {
              activeTab = tab;
              renderDetail(); // renderDetail() already calls bindDetailEvents()
            }
          });
        });

        // Add payment buttons
        overlay.querySelector('#rv-add-payment')?.addEventListener('click', () => openAddPaymentModal(res, overlay));
        overlay.querySelector('#rv-add-payment-tab')?.addEventListener('click', () => openAddPaymentModal(res, overlay));

        // Bono card clicks — toggle selection
        overlay.querySelectorAll('.rv-bono-card').forEach(card => {
          card.addEventListener('click', (e) => {
            if (e.target.closest('.rv-bono-pay-btn')) return; // Don't toggle on pay button click
            const pid = card.dataset.personId;
            const bid = card.dataset.bonoId;
            const pc = res.personCredits?.[pid];
            if (!pc) return;
            if (pc.selectedBonoId === bid && pc.useCredit) {
              pc.useCredit = false;
              pc.selectedBonoId = null;
            } else {
              pc.useCredit = true;
              pc.selectedBonoId = bid;
              pc.bono = pc.allBonos?.find(b => b.id === bid) || pc.bono;
            }
            renderDetail(); // renderDetail() already calls bindDetailEvents()
          });
        });

        // Bono pay buttons
        overlay.querySelectorAll('.rv-bono-pay-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const bonoId = btn.dataset.bonoId;
            const pending = parseFloat(btn.dataset.pending) || 0;
            const pid = btn.dataset.personId;
            openBonoPayModal(res, overlay, pid, bonoId, pending);
          });
        });

        // Load credit balances for linked persons
        overlay.querySelectorAll('.rv-credit-row').forEach(async (row) => {
          const profileId = row.dataset.profileId;
          const personName = row.dataset.personName;
          try {
            const { data } = await supabase.from('profiles').select('credit_balance').eq('id', profileId).single();
            const balance = Number(data?.credit_balance || 0);
            if (balance > 0) {
              row.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px dashed #e5e7eb;margin-top:8px">
                  <div>
                    <span style="font-size:.82rem;color:#0f2f39;font-weight:600">${personName}</span>
                    <span style="font-size:.78rem;color:#6b7280"> — Saldo a favor: </span>
                    <strong style="color:#166534">${balance.toFixed(2)}€</strong>
                  </div>
                  <button class="rv-use-credit-btn rv-add-payment-btn" data-profile-id="${profileId}" data-balance="${balance}" data-person-name="${personName}" style="font-size:.75rem;padding:5px 12px">Usar saldo</button>
                </div>`;
              row.querySelector('.rv-use-credit-btn')?.addEventListener('click', () => {
                openUseCreditModal(res, overlay, profileId, balance, personName);
              });
            }
          } catch {}
        });

        // Cancel reservation
        overlay.querySelector('#rv-cancel')?.addEventListener('click', () => {
          if (confirm('¿Cancelar esta reserva? Esta acción no se puede deshacer.')) {
            showToast('Reserva cancelada', 'success');
            overlay.remove();
            render();
          }
        });

        // Send email
        overlay.querySelector('#rv-send-email')?.addEventListener('click', () => {
          showToast('Funcionalidad de email próximamente', 'success');
        });

        // Share
        overlay.querySelector('#rv-share')?.addEventListener('click', () => {
          navigator.clipboard?.writeText(`Reserva ${res.id} — ${res.activityLabel} — ${res.totalFinal.toFixed(2)}€`);
          showToast('Enlace copiado al portapapeles', 'success');
        });

        // Download
        overlay.querySelector('#rv-download')?.addEventListener('click', () => {
          showToast('Descarga disponible próximamente', 'success');
        });

        // Ampliar
        overlay.querySelector('#rv-ampliar')?.addEventListener('click', () => {
          showToast('Función de ampliar próximamente', 'success');
        });
      }

      function openAddPaymentModal(res, overlayRef) {
        // Check for persons with credit balance
        const personsWithCredit = res.persons.filter(p => p.profileId);
        let creditOptionHtml = '';
        if (personsWithCredit.length) {
          creditOptionHtml = `
            <div style="margin-top:8px;padding-top:12px;border-top:1px dashed #e5e7eb">
              <label style="display:flex;align-items:center;gap:8px;font-size:.85rem;cursor:pointer">
                <input type="checkbox" class="rv-pay-use-credit-cb" style="width:16px;height:16px;accent-color:#0f2f39" />
                Usar saldo a favor del cliente
              </label>
              <div class="rv-credit-info-el" style="display:none;margin-top:8px;font-size:.82rem;color:#065f46;background:#ecfdf5;padding:8px 12px;border-radius:6px"></div>
            </div>`;
        }

        // Create a high z-index modal instead of using openModal (which renders behind the overlay)
        const modal = document.createElement('div');
        modal.className = 'bk-overlay';
        modal.style.zIndex = '10001';
        modal.innerHTML = `
          <div class="bk-panel" style="max-width:480px;margin:auto;border-radius:12px;overflow:hidden">
            <div class="bk-panel-header" style="background:#0f2f39;padding:16px 20px">
              <button class="bk-close-btn rv-pay-modal-close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div class="bk-header-left"><span class="bk-header-title" style="font-size:1rem">Añadir Pago</span></div>
            </div>
            <div style="padding:24px">
              <form class="rv-payment-form-el trip-form">
                <label>Importe</label>
                <input type="number" class="rv-pay-amount-el" name="amount" step="0.01" value="${res.pending.toFixed(2)}" required />
                <label>Método de pago</label>
                <select name="method" required>
                  <option value="">Seleccionar…</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="voucher">Voucher</option>
                  <option value="saldo">Saldo a favor</option>
                </select>
                ${creditOptionHtml}
                <label>Notas</label>
                <input type="text" name="notes" placeholder="Opcional" />
                <button type="submit" class="btn red" style="margin-top:12px">Registrar Pago</button>
              </form>
            </div>
          </div>`;
        document.body.appendChild(modal);

        modal.querySelector('.rv-pay-modal-close')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        // Load credit balance for "saldo" option
        let clientCreditBalance = 0;
        let clientProfileId = null;
        if (personsWithCredit.length) {
          const firstLinked = personsWithCredit[0];
          clientProfileId = firstLinked.profileId;
          supabase.from('profiles').select('credit_balance').eq('id', clientProfileId).single().then(({ data }) => {
            clientCreditBalance = Number(data?.credit_balance || 0);
            const creditInfo = modal.querySelector('.rv-credit-info-el');
            if (creditInfo) creditInfo.textContent = `Saldo disponible: ${clientCreditBalance.toFixed(2)}€`;
          });

          modal.querySelector('.rv-pay-use-credit-cb')?.addEventListener('change', (e) => {
            const infoEl = modal.querySelector('.rv-credit-info-el');
            if (infoEl) infoEl.style.display = e.target.checked ? 'block' : 'none';
            if (e.target.checked) {
              const amountInput = modal.querySelector('.rv-pay-amount-el');
              const currentAmount = parseFloat(amountInput.value) || 0;
              const creditToUse = Math.min(clientCreditBalance, currentAmount);
              if (creditToUse > 0) {
                const infoEl2 = modal.querySelector('.rv-credit-info-el');
                if (infoEl2) infoEl2.textContent = `Saldo disponible: ${clientCreditBalance.toFixed(2)}€ — Se aplicarán ${creditToUse.toFixed(2)}€`;
              }
            }
          });
        }

        modal.querySelector('.rv-payment-form-el')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const amount = parseFloat(fd.get('amount')) || 0;
          const method = fd.get('method');
          const useCredit = modal.querySelector('.rv-pay-use-credit-cb')?.checked;

          if (!method && !useCredit) { showToast('Selecciona un método', 'error'); return; }

          let creditUsed = 0;
          if (useCredit && clientCreditBalance > 0 && clientProfileId) {
            creditUsed = Math.min(clientCreditBalance, amount);
            const newBalance = clientCreditBalance - creditUsed;
            await supabase.from('profiles').update({ credit_balance: newBalance }).eq('id', clientProfileId);
          }

          const effectiveMethod = creditUsed >= amount ? 'saldo' : (method || 'saldo');
          res.pending = Math.max(0, res.pending - amount);
          if (res.pending <= 0) res.status = 'paid';
          res.payments.push({ amount, method: effectiveMethod, creditUsed, date: new Date().toISOString() });

          modal.remove();
          showToast(`Pago de ${amount.toFixed(2)}€ registrado${creditUsed > 0 ? ` (${creditUsed.toFixed(2)}€ de saldo)` : ` (${effectiveMethod})`}`, 'success');
          renderDetail(); // renderDetail() already calls bindDetailEvents()
        });
      }

      function openBonoPayModal(res, overlayRef, personId, bonoId, pendingAmount) {
        const pc = res.personCredits?.[personId];
        const bono = pc?.allBonos?.find(b => b.id === bonoId);
        if (!bono) return;

        // Create a high z-index modal instead of using openModal (which renders behind the overlay)
        const modal = document.createElement('div');
        modal.className = 'bk-overlay';
        modal.style.zIndex = '10001';
        modal.innerHTML = `
          <div class="bk-panel" style="max-width:480px;margin:auto;border-radius:12px;overflow:hidden">
            <div class="bk-panel-header" style="background:#f59e0b;padding:16px 20px">
              <button class="bk-close-btn rv-bono-modal-close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div class="bk-header-left"><span class="bk-header-title" style="font-size:1rem">Pagar Bono</span></div>
            </div>
            <div style="padding:24px">
              <form class="rv-bono-pay-form-el trip-form">
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:14px">
                  <div style="font-size:.82rem;color:#92400e"><strong>${TYPE_LABELS[bono.class_type] || bono.class_type}</strong> · ${bono.total_credits} clases</div>
                  <div style="font-size:.82rem;color:#92400e;margin-top:4px">Pagado: ${bono.totalPaidReal.toFixed(2)}€ / ${bono.expectedPrice.toFixed(2)}€ · <strong>Debe: ${pendingAmount.toFixed(2)}€</strong></div>
                </div>
                <label>Importe</label>
                <input type="number" name="amount" step="0.01" value="${pendingAmount.toFixed(2)}" required />
                <label>Método de pago</label>
                <select name="method" required>
                  <option value="">Seleccionar…</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="voucher">Voucher</option>
                  <option value="saldo">Saldo a favor</option>
                </select>
                <button type="submit" class="btn red" style="margin-top:12px">Registrar Pago del Bono</button>
              </form>
            </div>
          </div>`;
        document.body.appendChild(modal);

        modal.querySelector('.rv-bono-modal-close')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        modal.querySelector('.rv-bono-pay-form-el')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const amount = parseFloat(fd.get('amount')) || 0;
          const method = fd.get('method');
          if (!method) { showToast('Selecciona un método', 'error'); return; }

          const btn = e.target.querySelector('button[type="submit"]');
          btn.disabled = true; btn.textContent = 'Procesando…';

          try {
            // Update bono total_paid in DB
            const newPaid = bono.totalPaidReal + amount;
            await supabase.from('bonos').update({
              total_paid: newPaid,
              updated_at: new Date().toISOString(),
            }).eq('id', bonoId);

            // If paying with saldo, deduct from profile
            if (method === 'saldo') {
              const person = res.persons.find(p => p.id === personId);
              if (person?.profileId) {
                const { data: profile } = await supabase.from('profiles').select('credit_balance').eq('id', person.profileId).single();
                const currentBalance = Number(profile?.credit_balance || 0);
                await supabase.from('profiles').update({ credit_balance: Math.max(0, currentBalance - amount) }).eq('id', person.profileId);
              }
            }

            // Create payment record
            await createPayment({
              reservation_type: 'enrollment',
              reference_id: bonoId,
              amount,
              payment_method: method,
              concept: `Pago bono ${TYPE_LABELS[bono.class_type] || bono.class_type}`,
            });

            // Update local bono data
            bono.totalPaidReal = newPaid;
            bono.pendingAmount = Math.max(0, bono.expectedPrice - newPaid);
            bono.isFullyPaid = newPaid >= bono.expectedPrice;

            modal.remove();
            showToast(`Pago de ${amount.toFixed(2)}€ registrado para el bono`, 'success');
            renderDetail();
            if (overlayRef) bindDetailEvents(overlayRef, res);
          } catch (err) {
            showToast('Error: ' + err.message, 'error');
            btn.disabled = false; btn.textContent = 'Registrar Pago del Bono';
          }
        });
      }

      function openUseCreditModal(res, overlayRef, profileId, balance, personName) {
        // Create a high z-index modal instead of using openModal (which renders behind the overlay)
        const modal = document.createElement('div');
        modal.className = 'bk-overlay';
        modal.style.zIndex = '10001';
        modal.innerHTML = `
          <div class="bk-panel" style="max-width:480px;margin:auto;border-radius:12px;overflow:hidden">
            <div class="bk-panel-header" style="background:#166534;padding:16px 20px">
              <button class="bk-close-btn rv-credit-modal-close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div class="bk-header-left"><span class="bk-header-title" style="font-size:1rem">Usar Saldo a Favor</span></div>
            </div>
            <div style="padding:24px">
              <form class="rv-use-credit-form-el trip-form">
                <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:14px">
                  <div style="font-size:.85rem;color:#065f46"><strong>${personName}</strong></div>
                  <div style="font-size:.9rem;color:#065f46;margin-top:4px">Saldo disponible: <strong>${balance.toFixed(2)}€</strong></div>
                </div>
                <label>Importe a aplicar</label>
                <input type="number" name="amount" step="0.01" value="${Math.min(balance, res.pending).toFixed(2)}" max="${balance.toFixed(2)}" required />
                <p style="font-size:.78rem;color:#6b7280;margin:4px 0 0">Pendiente de la reserva: ${res.pending.toFixed(2)}€</p>
                <button type="submit" class="btn red" style="margin-top:12px">Aplicar Saldo</button>
              </form>
            </div>
          </div>`;
        document.body.appendChild(modal);

        modal.querySelector('.rv-credit-modal-close')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        modal.querySelector('.rv-use-credit-form-el')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const amount = parseFloat(new FormData(e.target).get('amount')) || 0;
          if (amount > balance) { showToast('El importe supera el saldo disponible', 'error'); return; }
          if (amount <= 0) { showToast('Introduce un importe válido', 'error'); return; }

          const btn = e.target.querySelector('button[type="submit"]');
          btn.disabled = true; btn.textContent = 'Aplicando…';

          try {
            await supabase.from('profiles').update({ credit_balance: Math.max(0, balance - amount) }).eq('id', profileId);

            res.pending = Math.max(0, res.pending - amount);
            if (res.pending <= 0) res.status = 'paid';
            res.payments.push({ amount, method: 'saldo', creditUsed: amount, date: new Date().toISOString() });

            modal.remove();
            showToast(`${amount.toFixed(2)}€ de saldo aplicados a la reserva`, 'success');
            renderDetail();
            if (overlayRef) bindDetailEvents(overlayRef, res);
          } catch (err) {
            showToast('Error: ' + err.message, 'error');
            btn.disabled = false; btn.textContent = 'Aplicar Saldo';
          }
        });
      }

      renderDetail();
    }

    function openClientSearchForPerson(pid) {
      const searchOverlay = document.createElement('div');
      searchOverlay.className = 'bk-search-overlay';
      searchOverlay.innerHTML = `
        <div class="bk-search-dialog">
          <div class="bk-search-dialog-header">
            <h3>Vincular Cliente</h3>
            <button class="bk-search-close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="bk-search-body">
            <input type="text" class="bk-search-input" placeholder="Buscar por nombre o email…" autofocus />
            <div class="bk-search-results"></div>
          </div>
        </div>`;

      document.body.appendChild(searchOverlay);

      const input = searchOverlay.querySelector('.bk-search-input');
      const resultsEl = searchOverlay.querySelector('.bk-search-results');

      let debounce = null;
      input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(async () => {
          const term = input.value.trim();
          if (term.length < 2) {
            resultsEl.innerHTML = '<p class="bk-search-hint">Escribe al menos 2 caracteres</p>';
            return;
          }
          resultsEl.innerHTML = '<p class="bk-search-hint">Buscando…</p>';
          try {
            // Search profiles AND family_members in parallel
            const safeTerm = term.replace(/[%_\\]/g, '');
            const [profiles, familyDirectHits] = await Promise.all([
              searchProfiles(term),
              supabase.from('family_members').select('id, full_name, birth_date, user_id')
                .ilike('full_name', `%${safeTerm}%`).limit(10)
                .then(r => r.data || []).catch(() => []),
            ]);

            // Fetch family members for each profile found
            const profileIds = profiles.map(pr => pr.id);
            const familyPromises = profiles.map(pr =>
              supabase.from('family_members').select('id, full_name, birth_date').eq('user_id', pr.id).order('created_at')
                .then(r => ({ userId: pr.id, members: r.data || [] }))
                .catch(() => ({ userId: pr.id, members: [] }))
            );
            const familyResults = await Promise.all(familyPromises);
            const familyMap = {};
            familyResults.forEach(r => { familyMap[r.userId] = r.members; });

            // For direct family hits not already under a found profile, fetch their parent
            const extraParentIds = [...new Set(familyDirectHits.filter(m => !profileIds.includes(m.user_id)).map(m => m.user_id))];
            let extraParents = {};
            if (extraParentIds.length) {
              const { data: parents } = await supabase.from('profiles').select('id, full_name, phone').in('id', extraParentIds);
              if (parents) parents.forEach(p => { extraParents[p.id] = p; });
              // Also fetch their family members
              for (const parentId of extraParentIds) {
                if (!familyMap[parentId]) {
                  const { data: members } = await supabase.from('family_members').select('id, full_name, birth_date').eq('user_id', parentId).order('created_at');
                  familyMap[parentId] = members || [];
                }
              }
            }

            // Build combined results: profiles first, then extra parents from direct family hits
            const allProfiles = [...profiles];
            for (const parentId of extraParentIds) {
              if (extraParents[parentId] && !allProfiles.find(p => p.id === parentId)) {
                allProfiles.push(extraParents[parentId]);
              }
            }

            if (!allProfiles.length) {
              resultsEl.innerHTML = '<p class="bk-search-hint">No se encontraron clientes</p>';
              return;
            }

            resultsEl.innerHTML = allProfiles.map(pr => {
              const members = familyMap[pr.id] || [];
              let html = `
              <button class="bk-search-result" data-id="${pr.id}" data-name="${pr.full_name || ''}" data-type="profile">
                <div>
                  <strong>${pr.full_name || 'Sin nombre'}</strong>
                  <small style="color:#888;display:block">${pr.phone ? pr.phone : ''}</small>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>
              </button>`;
              if (members.length) {
                html += members.map(m => {
                  const age = m.birth_date ? new Date().getFullYear() - new Date(m.birth_date).getFullYear() : null;
                  return `
                  <button class="bk-search-result" data-id="${pr.id}" data-name="${m.full_name}" data-family-id="${m.id}" data-type="family" style="padding-left:36px;border-left:3px solid #0ea5e9">
                    <div>
                      <small style="color:#0ea5e9;font-weight:600">↳ Familiar de ${pr.full_name || 'cuenta'}</small>
                      <strong style="display:block">${m.full_name}</strong>
                      ${age ? `<small style="color:#888">${age} años</small>` : ''}
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>
                  </button>`;
                }).join('');
              }
              return html;
            }).join('');

            resultsEl.querySelectorAll('.bk-search-result').forEach(btn => {
              btn.addEventListener('click', () => {
                const p = persons.find(p => String(p.id) === pid);
                if (p) {
                  p.profileId = btn.dataset.id;
                  p.profileName = btn.dataset.name;
                  p.familyMemberId = btn.dataset.familyId || null;
                  p.nombre = '';
                  p.apellidos = '';
                }
                searchOverlay.remove();
                renderPanel();
              });
            });
          } catch (err) {
            resultsEl.innerHTML = `<p class="bk-search-hint" style="color:#b91c1c">Error: ${err.message}</p>`;
          }
        }, 300);
      });

      searchOverlay.querySelector('.bk-search-close').addEventListener('click', () => searchOverlay.remove());
      searchOverlay.addEventListener('click', (e) => {
        if (e.target === searchOverlay) searchOverlay.remove();
      });
    }

    renderPanel();
  }

  // ======== NEW SESSION MODAL ========
  function openNewSessionModal() {
    const dateStr = getDateStr(currentDate);
    const typeOptions = Object.entries(TYPE_LABELS)
      .map(([val, label]) => `<option value="${val}">${label}</option>`)
      .join('');

    const dayCheckboxes = DAY_NAMES_FULL.map((name, i) => {
      const checked = i === currentDate.getDay() ? 'checked' : '';
      return `<label class="cal-day-checkbox">
        <input type="checkbox" name="repeat_days" value="${i}" ${checked} />
        <span>${name.slice(0, 3)}</span>
      </label>`;
    }).join('');

    const defaultCapacities = { grupal: 6, individual: 1, yoga: 10, paddle: 8, surfskate: 8 };

    openModal('Nueva Sesión', `
      <div class="cal-modal-type-selector" style="display:flex;gap:8px;margin-bottom:16px">
        <button class="tar-tab-btn active" data-modal-type="clase" type="button">Clase</button>
        <button class="tar-tab-btn" data-modal-type="material" type="button">Alquiler de Material</button>
      </div>
      <div id="ns-clase-form">
        <form id="new-session-form" class="trip-form">
          <label>Actividad</label>
          <select name="type" id="ns-type" required>${typeOptions}</select>
          <label>Hora de Inicio</label>
          <input type="time" name="time_start" value="10:00" required />
          <label>Hora de Fin</label>
          <input type="time" name="time_end" value="11:30" required />
          <label>Capacidad Máxima</label>
          <input type="number" name="max_students" id="ns-capacity" value="6" min="1" required />
          <label>Días de repetición</label>
          <div class="cal-days-grid">${dayCheckboxes}</div>
          <label>Repetir hasta</label>
          <input type="date" name="repeat_until" value="${getEndOfMonthStr(currentDate)}" required />
          <label>Instructor</label>
          <input type="text" name="instructor" placeholder="Opcional" />
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <input type="checkbox" name="published" style="width:auto" />
            Publicar inmediatamente
          </label>
          <button type="submit" class="btn red" style="margin-top:16px">Crear Sesiones</button>
        </form>
      </div>
      <div id="ns-material-form" style="display:none">
        <form id="new-rental-form" class="trip-form">
          <label>Material</label>
          <select name="equipment_id" id="nr-equipment" required>
            <option value="">Cargando material...</option>
          </select>
          <div id="nr-size-wrap" style="display:none">
            <label>Talla</label>
            <select name="size" id="nr-size"></select>
          </div>
          <label>Tarifa</label>
          <select name="duration_key" id="nr-duration" required>
            <option value="">Selecciona un material primero</option>
          </select>
          <div id="nr-custom-price-wrap" style="display:none;margin-top:8px">
            <label>Precio personalizado (€)</label>
            <input type="number" name="custom_price" id="nr-custom-price" step="0.01" min="0" value="0" />
          </div>
          <label>Nombre del cliente</label>
          <input type="text" name="guest_name" placeholder="Nombre completo" required />
          <label>Teléfono / Email (opcional)</label>
          <input type="text" name="guest_contact" placeholder="Teléfono o email" />
          <label>Fecha inicio</label>
          <input type="date" name="date_start" value="${dateStr}" required />
          <label>Fecha fin</label>
          <input type="date" name="date_end" value="${dateStr}" required />
          <label>Cantidad</label>
          <input type="number" name="quantity" value="1" min="1" required />
          <div id="nr-price-summary" style="margin-top:12px;padding:12px;background:#f0fdf4;border-radius:8px;font-weight:600;display:none"></div>
          <button type="submit" class="btn red" style="margin-top:16px">Crear Reserva de Material</button>
        </form>
      </div>
    `);

    // Tab switching between Clase and Material
    document.querySelectorAll('[data-modal-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-modal-type]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const isClase = btn.dataset.modalType === 'clase';
        document.getElementById('ns-clase-form').style.display = isClase ? '' : 'none';
        document.getElementById('ns-material-form').style.display = isClase ? 'none' : '';
      });
    });

    // Load equipment for rental form — store data in JS map (not data attributes, avoids JSON parsing issues)
    const equipmentMap = {};
    (async () => {
      try {
        const equipment = await fetchEquipment();
        const sel = document.getElementById('nr-equipment');
        if (!sel) return;
        equipment.filter(e => e.active).forEach(e => { equipmentMap[e.id] = e; });
        sel.innerHTML = '<option value="">— Selecciona material —</option>' +
          equipment.filter(e => e.active).map(e => `<option value="${e.id}">${e.name}</option>`).join('');
      } catch (err) { console.warn('Error loading equipment:', err); }
    })();

    const DURATION_LABELS = { '1h': '1 hora', '2h': '2 horas', '4h': '4 horas', '1d': '1 día', '1w': '1 semana', '2w': '2 semanas', '1m': '1 mes' };

    // When equipment changes, update durations + sizes
    document.getElementById('nr-equipment')?.addEventListener('change', (e) => {
      const eqId = e.target.value;
      const eq = equipmentMap[eqId];
      if (!eq) return;
      const pricing = eq.pricing || {};
      const type = eq.type;
      const sizes = eq.sizes || [];
      const deposit = Number(eq.deposit) || 0;

      // Duration options
      const durSel = document.getElementById('nr-duration');
      const entries = Object.entries(pricing).filter(([, p]) => Number(p) > 0);
      durSel.innerHTML = entries.map(([key, price]) =>
        `<option value="${key}" data-price="${price}">${DURATION_LABELS[key] || key} — ${price}€</option>`
      ).join('') + '<option value="custom">Precio personalizado</option>';

      // Size selector
      const sizeWrap = document.getElementById('nr-size-wrap');
      if (type === 'con_talla' && sizes.length) {
        sizeWrap.style.display = '';
        document.getElementById('nr-size').innerHTML = sizes.map(s => `<option value="${s}">${s}</option>`).join('');
      } else {
        sizeWrap.style.display = 'none';
      }

      updateRentalPriceSummary(deposit);
    });

    // Duration change — show/hide custom price
    document.getElementById('nr-duration')?.addEventListener('change', (e) => {
      const isCustom = e.target.value === 'custom';
      document.getElementById('nr-custom-price-wrap').style.display = isCustom ? '' : 'none';
      const eqId = document.getElementById('nr-equipment')?.value;
      const deposit = Number(equipmentMap[eqId]?.deposit) || 0;
      updateRentalPriceSummary(deposit);
    });

    document.getElementById('nr-custom-price')?.addEventListener('input', () => {
      const eqId = document.getElementById('nr-equipment')?.value;
      updateRentalPriceSummary(Number(equipmentMap[eqId]?.deposit) || 0);
    });

    function updateRentalPriceSummary(deposit) {
      const durSel = document.getElementById('nr-duration');
      const summary = document.getElementById('nr-price-summary');
      if (!durSel || !summary) return;
      let price = 0;
      if (durSel.value === 'custom') {
        price = parseFloat(document.getElementById('nr-custom-price')?.value) || 0;
      } else {
        const durOpt = durSel.selectedOptions[0];
        price = Number(durOpt?.dataset.price) || 0;
      }
      const qty = parseInt(document.querySelector('#new-rental-form [name="quantity"]')?.value) || 1;
      const total = price * qty;
      summary.style.display = total > 0 ? '' : 'none';
      summary.innerHTML = `Total: ${total}€${deposit > 0 ? ` · Depósito: ${deposit}€` : ''}`;
    }

    // Auto-update capacity when type changes (class form)
    document.getElementById('ns-type')?.addEventListener('change', (e) => {
      const t = e.target.value;
      document.getElementById('ns-capacity').value = defaultCapacities[t] || 8;
    });

    // Class session form submit
    document.getElementById('new-session-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const type = fd.get('type');
      const timeStart = fd.get('time_start');
      const timeEnd = fd.get('time_end');
      const maxStudents = parseInt(fd.get('max_students'));
      const instructor = fd.get('instructor') || null;
      const published = e.target.published.checked;
      const repeatUntil = fd.get('repeat_until');
      const repeatDays = fd.getAll('repeat_days').map(Number);

      if (!repeatDays.length) { showToast('Selecciona al menos un día', 'error'); return; }

      const dates = [];
      const start = new Date(getDateStr(currentDate) + 'T00:00:00');
      const end = new Date(repeatUntil + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (repeatDays.includes(d.getDay())) dates.push(getDateStr(new Date(d)));
      }

      if (!dates.length) { showToast('No hay fechas que coincidan', 'error'); return; }

      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = `Creando ${dates.length} sesiones…`;

      try {
        for (const date of dates) {
          await upsertClass({
            title: TYPE_LABELS[type], type, level: 'todos', date,
            time_start: timeStart, time_end: timeEnd,
            max_students: maxStudents, instructor, price: 0, published,
            location: 'Playa de Roche', status: 'scheduled',
          });
        }
        closeModal();
        showToast(`${dates.length} sesiones creadas`, 'success');
        render();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear Sesiones';
      }
    });

    // Rental reservation form submit
    document.getElementById('new-rental-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const equipmentId = fd.get('equipment_id');
      if (!equipmentId) { showToast('Selecciona un material', 'error'); return; }

      const durKey = fd.get('duration_key');
      let totalPrice = 0;
      if (durKey === 'custom') {
        totalPrice = parseFloat(fd.get('custom_price')) || 0;
      } else {
        const durOpt = document.getElementById('nr-duration')?.selectedOptions[0];
        totalPrice = Number(durOpt?.dataset.price) || 0;
      }

      const qty = parseInt(fd.get('quantity')) || 1;
      totalPrice *= qty;

      const eqId = document.getElementById('nr-equipment')?.value;
      const deposit = Number(equipmentMap[eqId]?.deposit) || 0;

      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando reserva…';

      try {
        await createEquipmentReservation({
          equipment_id: equipmentId,
          guest_name: fd.get('guest_name')?.trim() || null,
          guest_email: null,
          guest_phone: fd.get('guest_contact')?.trim() || null,
          date_start: fd.get('date_start'),
          date_end: fd.get('date_end'),
          duration_key: durKey === 'custom' ? 'custom' : durKey,
          size: fd.get('size') || null,
          quantity: qty,
          total_amount: totalPrice,
          deposit_paid: deposit,
          status: 'confirmed',
        });
        closeModal();
        showToast('Reserva de material creada', 'success');
        render();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear Reserva de Material';
      }
    });
  }

  // ======== RENTAL DETAIL PANEL (fullscreen ficha) ========
  function openRentalDetail(r) {
    const equipName = r.rental_equipment?.name || 'Material';
    const clientName = r.guest_name || 'Sin nombre';
    const clientEmail = r.guest_email || '—';
    const clientPhone = r.guest_phone || '—';
    let currentStatus = r.status || 'pending';
    const durationLabel = DURATION_KEY_LABELS[r.duration_key] || r.duration_key || '—';
    const totalAmount = Number(r.total_amount || 0);
    let currentDepositPaid = Number(r.deposit_paid || 0);
    const idShort = (r.id || '').slice(0, 24);
    const createdAt = r.created_at ? new Date(r.created_at).toLocaleString('es-ES') : '—';
    let rdActiveTab = 'resumen';
    let payments = null; // lazy loaded

    const overlay = document.createElement('div');
    overlay.className = 'bk-overlay bk-overlay-fullscreen';
    document.body.appendChild(overlay);

    function getStatusLabel() { return RENTAL_STATUS_LABELS[currentStatus] || currentStatus; }
    function getStatusColor() {
      const c = { pending: '#f59e0b', confirmed: '#0ea5e9', active: '#22c55e', returned: '#64748b', cancelled: '#ef4444' };
      return c[currentStatus] || '#64748b';
    }
    function getStatusBg() {
      const c = { pending: '#fef3c7', confirmed: '#e0f2fe', active: '#dcfce7', returned: '#f1f5f9', cancelled: '#fee2e2' };
      return c[currentStatus] || '#f1f5f9';
    }
    function getPending() { return Math.max(0, totalAmount - currentDepositPaid); }
    function isPaidFn() { return totalAmount > 0 ? currentDepositPaid >= totalAmount : currentDepositPaid > 0; }

    function renderRdPanel() {
      const statusLabel = getStatusLabel();
      const statusColor = getStatusColor();
      const statusBg = getStatusBg();
      const pending = getPending();
      const paid = isPaidFn();
      const pendingColor = pending > 0 ? '#b91c1c' : '#166534';

      let tabContent = '';
      if (rdActiveTab === 'resumen') {
        tabContent = `
          <div class="rv-summary-header">
            <h2 class="rv-title">Resumen de la reserva <span class="rv-status-badge" style="background:${statusBg};color:${statusColor}">${statusLabel}</span></h2>
          </div>
          <div class="rv-info-card">
            <div class="rv-info-top">
              <div class="rv-info-top-left">
                <div class="rv-info-id">Reserva ${idShort}</div>
                <div style="font-size:.82rem;color:var(--color-muted);margin-top:2px">Creada el ${createdAt} · Por Admin</div>
              </div>
              <div class="rv-info-top-right">
                <div class="rv-info-stat"><label>Total</label><span class="rv-info-amount">${totalAmount.toFixed(2)}€</span></div>
                <div class="rv-info-stat"><label>Pendiente</label><span class="rv-info-amount" style="color:${pendingColor}">${pending.toFixed(2)}€</span></div>
                ${pending > 0 ? `<button class="btn rd-add-payment-btn" style="padding:6px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;font-size:.82rem;cursor:pointer;font-weight:600;color:#0f2f39">Añadir pago</button>` : ''}
              </div>
            </div>
            <div class="rv-info-bottom" style="border-top:1px solid #f1f5f9;padding-top:16px">
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
                <div>
                  <div style="font-size:.72rem;text-transform:uppercase;color:var(--color-muted);font-weight:600;letter-spacing:.5px;margin-bottom:4px">Reservado por</div>
                  <strong style="font-size:.95rem">${clientName}</strong>
                  ${clientPhone !== '—' ? `<div style="font-size:.82rem;color:var(--color-muted);margin-top:2px">${clientPhone}</div>` : ''}
                  ${clientEmail !== '—' ? `<div style="font-size:.82rem;color:var(--color-muted)">${clientEmail}</div>` : ''}
                </div>
                <div>
                  <div style="font-size:.72rem;text-transform:uppercase;color:var(--color-muted);font-weight:600;letter-spacing:.5px;margin-bottom:4px">Check in / Check out</div>
                  <div style="display:flex;align-items:center;gap:6px;font-size:.9rem">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <input type="date" id="rd-date-start" value="${r.date_start?.slice(0, 10) || ''}" style="padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:.85rem;font-family:inherit" />
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;font-size:.9rem;margin-top:4px">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <input type="date" id="rd-date-end" value="${r.date_end?.slice(0, 10) || ''}" style="padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:.85rem;font-family:inherit" />
                  </div>
                </div>
                <div>
                  <div style="font-size:.72rem;text-transform:uppercase;color:var(--color-muted);font-weight:600;letter-spacing:.5px;margin-bottom:4px">Material</div>
                  <div style="font-size:.9rem">${equipName}</div>
                  ${r.size ? `<div style="font-size:.82rem;color:var(--color-muted)">Talla: ${r.size}</div>` : ''}
                  ${r.quantity > 1 ? `<div style="font-size:.82rem;color:var(--color-muted)">Cant: ${r.quantity}</div>` : ''}
                </div>
              </div>
            </div>
          </div>
          <div class="rv-person-card">
            <div class="rv-person-header">
              <div class="rv-person-avatar" style="background:#0ea5e9">${(clientName || '?')[0].toUpperCase()}</div>
              <div class="rv-person-info"><span class="rv-person-name">${clientName}</span></div>
              ${clientPhone !== '—' ? `<a class="rv-person-action" href="https://wa.me/${clientPhone.replace(/[^0-9+]/g, '')}" target="_blank" title="WhatsApp"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg></a>` : ''}
              ${clientPhone !== '—' ? `<a class="rv-person-action" href="tel:${clientPhone}" title="Llamar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></a>` : ''}
              ${clientEmail !== '—' ? `<a class="rv-person-action" href="mailto:${clientEmail}" title="Email"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></a>` : ''}
            </div>
            <table class="rv-sessions-table">
              <thead><tr><th>Fechas</th><th>Producto</th><th>Duración</th></tr></thead>
              <tbody>
                <tr>
                  <td>${r.date_start?.slice(0, 10) || '—'} → ${r.date_end?.slice(0, 10) || '—'}</td>
                  <td><strong>${equipName}</strong></td>
                  <td>${durationLabel}</td>
                </tr>
              </tbody>
            </table>
          </div>`;
      } else if (rdActiveTab === 'datos') {
        tabContent = `
          <h2 class="rv-title">Datos del comprador</h2>
          <div class="rv-info-card" style="padding:24px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
              <div class="rv-info-detail"><label>Nombre</label><strong>${clientName}</strong></div>
              <div class="rv-info-detail"><label>Email</label><div>${clientEmail}</div></div>
              <div class="rv-info-detail"><label>Teléfono</label><div>${clientPhone}</div></div>
              <div class="rv-info-detail"><label>Estado reserva</label><div style="color:${statusColor}">${statusLabel}</div></div>
            </div>
          </div>
          ${r.notes ? `<h3 class="rv-title" style="margin-top:16px">Notas</h3><div class="rv-info-card" style="padding:16px"><p style="margin:0">${r.notes}</p></div>` : ''}`;
      } else if (rdActiveTab === 'pagos') {
        const paymentsList = payments || [];
        const totalPaid = paymentsList.reduce((s, p) => s + Number(p.amount || 0), 0);
        const displayDeposit = Math.max(currentDepositPaid, totalPaid);
        const displayPending = Math.max(0, totalAmount - displayDeposit);
        tabContent = `
          <h2 class="rv-title">Pagos</h2>
          <div class="rv-info-card" style="padding:0;overflow:hidden">
            <div style="display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #f1f5f9">
              <div style="padding:16px;text-align:center"><div style="font-size:.72rem;text-transform:uppercase;color:var(--color-muted);margin-bottom:4px">Subtotal</div><div style="font-size:1.1rem;font-weight:600">${totalAmount.toFixed(2)}€</div></div>
              <div style="padding:16px;text-align:center"><div style="font-size:.72rem;text-transform:uppercase;color:var(--color-muted);margin-bottom:4px">Descuento</div><div style="font-size:1.1rem;font-weight:600;color:#f59e0b">0.00€</div></div>
              <div style="padding:16px;text-align:center"><div style="font-size:.72rem;text-transform:uppercase;color:var(--color-muted);margin-bottom:4px">Total</div><div style="font-size:1.1rem;font-weight:600">${totalAmount.toFixed(2)}€</div></div>
              <div style="padding:16px;text-align:center"><div style="font-size:.72rem;text-transform:uppercase;color:var(--color-muted);margin-bottom:4px">Pendiente</div><div style="font-size:1.1rem;font-weight:600;color:${displayPending > 0 ? '#b91c1c' : '#166534'}">${displayPending.toFixed(2)}€</div></div>
            </div>
            ${paymentsList.length ? `
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:#f8fafc">
                <th style="padding:10px 16px;text-align:left;font-size:.72rem;text-transform:uppercase;color:var(--color-muted);font-weight:600">Concepto</th>
                <th style="padding:10px 16px;text-align:left;font-size:.72rem;text-transform:uppercase;color:var(--color-muted);font-weight:600">Tipo</th>
                <th style="padding:10px 16px;text-align:left;font-size:.72rem;text-transform:uppercase;color:var(--color-muted);font-weight:600">Fecha</th>
                <th style="padding:10px 16px;text-align:right;font-size:.72rem;text-transform:uppercase;color:var(--color-muted);font-weight:600">Total</th>
                <th style="padding:10px 16px;width:60px"></th>
              </tr></thead>
              <tbody>${paymentsList.map(p => `
                <tr style="border-top:1px solid #f1f5f9">
                  <td style="padding:10px 16px"><span style="display:inline-block;width:8px;height:100%;background:#22c55e;border-radius:2px;margin-right:8px"></span>${p.concept || 'Pago'}</td>
                  <td style="padding:10px 16px;text-transform:capitalize">${p.payment_method}</td>
                  <td style="padding:10px 16px">${new Date(p.payment_date).toLocaleString('es-ES')}</td>
                  <td style="padding:10px 16px;text-align:right;font-weight:600">${Number(p.amount).toFixed(2)}€</td>
                  <td style="padding:10px 16px;text-align:right"><button class="rd-delete-payment" data-pid="${p.id}" style="background:none;border:none;cursor:pointer;color:#b91c1c" title="Eliminar pago"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button></td>
                </tr>`).join('')}
              </tbody>
            </table>` : `<div style="padding:24px;text-align:center;color:var(--color-muted)">No hay pagos registrados</div>`}
          </div>
          <button class="btn rd-add-payment-btn" style="margin-top:16px;background:#22c55e;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600">Añadir pago</button>`;
        if (!payments) loadPayments();
      } else if (rdActiveTab === 'historico') {
        const timeline = [];
        if (r.created_at) timeline.push({ date: r.created_at, label: 'Reserva creada', color: '#0ea5e9' });
        if (currentStatus === 'confirmed' || currentStatus === 'active' || currentStatus === 'returned') timeline.push({ date: r.created_at, label: 'Reserva confirmada', color: '#22c55e' });
        if (currentDepositPaid > 0) timeline.push({ date: r.updated_at || r.created_at, label: `Pago registrado: ${currentDepositPaid.toFixed(2)}€`, color: '#22c55e' });
        if (currentStatus === 'active') timeline.push({ date: r.updated_at || r.created_at, label: 'Material entregado (activa)', color: '#0ea5e9' });
        if (currentStatus === 'returned') timeline.push({ date: r.updated_at || r.created_at, label: 'Material devuelto', color: '#64748b' });
        if (currentStatus === 'cancelled') timeline.push({ date: r.updated_at || r.created_at, label: 'Reserva cancelada', color: '#ef4444' });

        // Include payment records in timeline
        if (payments?.length) {
          payments.forEach(p => timeline.push({ date: p.payment_date, label: `Pago: ${Number(p.amount).toFixed(2)}€ (${p.payment_method})${p.concept ? ' — ' + p.concept : ''}`, color: '#22c55e' }));
        } else if (!payments) { loadPayments(); }

        timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

        tabContent = `
          <h2 class="rv-title">Histórico</h2>
          <div class="rv-info-card" style="padding:24px">
            <div class="rv-timeline">
              ${timeline.map(t => `
                <div class="rv-timeline-item">
                  <div class="rv-timeline-dot" style="background:${t.color}"></div>
                  <div class="rv-timeline-content">
                    <strong>${t.label}</strong>
                    <span>${new Date(t.date).toLocaleString('es-ES')}</span>
                  </div>
                </div>`).join('')}
            </div>
          </div>`;
      }

      overlay.innerHTML = `
        <div class="bk-panel bk-panel-fullscreen">
          <div class="bk-panel-header" style="background:#0ea5e9">
            <button class="bk-close-btn" id="rd-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div class="bk-header-left"><span class="bk-header-title">Ficha de Reserva</span></div>
            <div class="bk-header-right" style="display:flex;align-items:center;gap:12px">
              <div style="text-align:center"><div style="font-size:.65rem;text-transform:uppercase;opacity:.7">Total</div><div style="font-size:1.1rem;font-weight:700">${totalAmount.toFixed(2)}€</div></div>
              <div style="text-align:center"><div style="font-size:.65rem;text-transform:uppercase;opacity:.7">Pendiente</div><div style="font-size:1.1rem;font-weight:700;color:${getPending() > 0 ? '#fca5a5' : '#86efac'}">${getPending().toFixed(2)}€</div></div>
            </div>
          </div>
          <div class="bk-panel-body" style="padding:0">
            <div class="rv-layout">
              <nav class="rv-sidebar">
                <a class="rv-nav-item ${rdActiveTab === 'resumen' ? 'active' : ''}" data-tab="resumen">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  Resumen
                </a>
                <div class="rv-nav-group">Cliente</div>
                <a class="rv-nav-item ${rdActiveTab === 'datos' ? 'active' : ''}" data-tab="datos">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Datos del comprador
                </a>
                <div class="rv-nav-group">Gestión</div>
                <a class="rv-nav-item ${rdActiveTab === 'pagos' ? 'active' : ''}" data-tab="pagos">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                  Pagos
                </a>
                <a class="rv-nav-item ${rdActiveTab === 'historico' ? 'active' : ''}" data-tab="historico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Histórico
                </a>
              </nav>
              <main class="rv-main" id="rd-main">${tabContent}</main>
              <aside class="rv-actions">
                <button class="rv-action-link danger" id="rd-cancel">
                  <span>Cancelar</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </button>
                ${currentStatus === 'pending' ? `
                <button class="rv-action-link" id="rd-confirm">
                  <span>Confirmar reserva</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                </button>` : ''}
                ${currentStatus === 'confirmed' || currentStatus === 'active' ? `
                <button class="rv-action-link" id="rd-mark-returned">
                  <span>Marcar devuelto</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                </button>` : ''}
                <button class="rv-action-link rd-add-payment-btn" style="color:#22c55e">
                  <span>Añadir pago</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                </button>
                <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0">
                  <div style="font-size:.7rem;text-transform:uppercase;color:var(--color-muted);font-weight:600;letter-spacing:.5px;margin-bottom:8px">Otros detalles</div>
                  <div style="display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--color-muted)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Manual
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>`;

      bindRdEvents();
    }

    async function loadPayments() {
      try {
        payments = await fetchPayments('rental', r.id);
        renderRdPanel();
      } catch (err) { console.warn('Error loading payments:', err); }
    }

    function openAddPaymentModal() {
      const pending = getPending();
      const modal = document.createElement('div');
      modal.className = 'bk-overlay';
      modal.style.zIndex = '10001';
      modal.innerHTML = `
        <div class="bk-panel" style="max-width:480px;margin:auto;border-radius:12px;overflow:hidden">
          <div class="bk-panel-header" style="background:#22c55e;padding:16px 20px">
            <button class="bk-close-btn" id="pay-modal-close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div class="bk-header-left"><span class="bk-header-title" style="font-size:1rem">Añadir pago</span></div>
          </div>
          <div style="padding:24px">
            <form id="add-payment-form">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
                <div>
                  <label style="display:block;font-size:.75rem;text-transform:uppercase;font-weight:600;color:var(--color-muted);margin-bottom:6px">Concepto</label>
                  <input type="text" name="concept" placeholder="Alquiler material" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.9rem;font-family:inherit" />
                </div>
                <div>
                  <label style="display:block;font-size:.75rem;text-transform:uppercase;font-weight:600;color:var(--color-muted);margin-bottom:6px">Tipo</label>
                  <select name="payment_method" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.9rem;font-family:inherit;background:#fff">
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="voucher">Voucher</option>
                  </select>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
                <div>
                  <label style="display:block;font-size:.75rem;text-transform:uppercase;font-weight:600;color:var(--color-muted);margin-bottom:6px">Fecha</label>
                  <input type="datetime-local" name="payment_date" value="${new Date().toISOString().slice(0, 16)}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.9rem;font-family:inherit" />
                </div>
                <div>
                  <label style="display:block;font-size:.75rem;text-transform:uppercase;font-weight:600;color:var(--color-muted);margin-bottom:6px">Total (€)</label>
                  <input type="number" name="amount" step="0.01" min="0" value="${pending.toFixed(2)}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.9rem;font-family:inherit" required />
                </div>
              </div>
              <button type="submit" style="width:100%;padding:12px;background:#22c55e;color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer">Guardar pago</button>
            </form>
          </div>
        </div>`;
      document.body.appendChild(modal);

      modal.querySelector('#pay-modal-close')?.addEventListener('click', () => modal.remove());
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

      modal.querySelector('#add-payment-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const amount = parseFloat(fd.get('amount'));
        if (!amount || amount <= 0) { showToast('Introduce un importe válido', 'error'); return; }
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = 'Guardando...';
        try {
          await createPayment({
            reservation_type: 'rental',
            reference_id: r.id,
            amount,
            payment_method: fd.get('payment_method'),
            concept: fd.get('concept')?.trim() || null,
            payment_date: fd.get('payment_date') ? new Date(fd.get('payment_date')).toISOString() : new Date().toISOString(),
          });
          // Update deposit_paid on the reservation
          currentDepositPaid = Math.min(currentDepositPaid + amount, totalAmount);
          await markEquipmentReservationPaid(r.id, currentDepositPaid);
          payments = null; // force reload
          modal.remove();
          showToast('Pago registrado', 'success');
          renderRdPanel();
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
          btn.disabled = false; btn.textContent = 'Guardar pago';
        }
      });
    }

    function bindRdEvents() {
      // Close
      overlay.querySelector('#rd-close')?.addEventListener('click', () => { overlay.remove(); render(); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); render(); } });

      // Tab navigation
      overlay.querySelectorAll('.rv-nav-item[data-tab]').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const tab = item.dataset.tab;
          if (tab) { rdActiveTab = tab; renderRdPanel(); }
        });
      });

      // Cancel
      overlay.querySelector('#rd-cancel')?.addEventListener('click', async () => {
        if (!confirm('¿Cancelar esta reserva de alquiler?')) return;
        try {
          await updateEquipmentReservationStatus(r.id, 'cancelled');
          currentStatus = 'cancelled';
          showToast('Reserva cancelada', 'success');
          renderRdPanel();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      });

      // Confirm
      overlay.querySelector('#rd-confirm')?.addEventListener('click', async () => {
        try {
          await updateEquipmentReservationStatus(r.id, 'confirmed');
          currentStatus = 'confirmed';
          showToast('Reserva confirmada', 'success');
          renderRdPanel();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      });

      // Mark returned
      overlay.querySelector('#rd-mark-returned')?.addEventListener('click', async () => {
        try {
          await updateEquipmentReservationStatus(r.id, 'returned');
          currentStatus = 'returned';
          showToast('Material devuelto', 'success');
          renderRdPanel();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      });

      // Add payment buttons (multiple on page)
      overlay.querySelectorAll('.rd-add-payment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); openAddPaymentModal(); });
      });

      // Delete payment
      overlay.querySelectorAll('.rd-delete-payment').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este pago?')) return;
          try {
            const pid = btn.dataset.pid;
            const payment = payments?.find(p => p.id === pid);
            await deletePayment(pid);
            if (payment) {
              currentDepositPaid = Math.max(0, currentDepositPaid - Number(payment.amount || 0));
              await markEquipmentReservationPaid(r.id, currentDepositPaid);
            }
            payments = null;
            showToast('Pago eliminado', 'success');
            renderRdPanel();
          } catch (err) { showToast('Error: ' + err.message, 'error'); }
        });
      });

      // Date change handlers
      const dateStartInput = overlay.querySelector('#rd-date-start');
      const dateEndInput = overlay.querySelector('#rd-date-end');

      dateStartInput?.addEventListener('change', async () => {
        const newStart = dateStartInput.value;
        const currentEnd = dateEndInput.value;
        if (!newStart) return;
        try {
          const updates = { date_start: newStart };
          if (currentEnd && newStart > currentEnd) updates.date_end = newStart;
          await updateEquipmentReservation(r.id, updates);
          r.date_start = newStart;
          if (updates.date_end) r.date_end = newStart;
          showToast('Fecha actualizada', 'success');
          renderRdPanel();
        } catch (err) { showToast('Error: ' + err.message, 'error'); renderRdPanel(); }
      });

      dateEndInput?.addEventListener('change', async () => {
        const newEnd = dateEndInput.value;
        if (!newEnd) return;
        if (r.date_start && newEnd < r.date_start.slice(0, 10)) {
          showToast('La fecha fin no puede ser anterior a la de inicio', 'error'); renderRdPanel(); return;
        }
        try {
          await updateEquipmentReservation(r.id, { date_end: newEnd });
          r.date_end = newEnd;
          showToast('Fecha actualizada', 'success');
          renderRdPanel();
        } catch (err) { showToast('Error: ' + err.message, 'error'); renderRdPanel(); }
      });
    }

    renderRdPanel();
  }

  // ======== ENROLLMENT DETAIL (click on client in calendar) ========
  function openEnrollmentDetail(cls, enrollmentId, clientName, isPaid) {
    const color = TYPE_COLORS[cls.type] || '#0f2f39';
    const label = TYPE_LABELS[cls.type] || cls.title;
    const timeStart = cls.time_start?.slice(0, 5) || '--:--';
    const timeEnd = cls.time_end?.slice(0, 5) || '--:--';
    const dateLabel = shortDateLabel(cls.date);
    let currentStatus = isPaid ? 'paid' : 'confirmed';
    const packPrice = getPackPrice(cls.type, 1, Number(cls.price) || 0);
    let edActiveTab = 'resumen';

    // Find the enrollment data to get user_id
    const enrollments = enrollmentsCache[cls.id] || [];
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    const userId = enrollment?.user_id || null;

    // Client history cache
    let clientHistory = null;

    // Available bonos for "Pagar con crédito"
    let edBonos = null;

    // All user bonos for this class type (for info display)
    let edUserBonos = null;
    let edLinkedBono = null;

    // Payments tracking
    let edPayments = null;
    function getEdTotalPaid() { return (edPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0); }
    function getEdPending() { return Math.max(0, packPrice - getEdTotalPaid()); }

    const overlay = document.createElement('div');
    overlay.className = 'bk-overlay bk-overlay-fullscreen';
    document.body.appendChild(overlay);

    function getStatusLabel() { return currentStatus === 'paid' ? 'Pagado' : currentStatus === 'partial' ? 'Anticipo' : 'Pendiente'; }
    function getStatusColor() { return currentStatus === 'paid' ? '#166534' : currentStatus === 'partial' ? '#92400e' : '#b91c1c'; }
    function getStatusBg() { return currentStatus === 'paid' ? '#dcfce7' : currentStatus === 'partial' ? '#fff7ed' : '#fee2e2'; }

    function renderEdPanel() {
      const statusLabel = getStatusLabel();
      const statusColor = getStatusColor();
      const statusBg = getStatusBg();

      // Tab content
      let tabContent = '';
      if (edActiveTab === 'resumen') {
        tabContent = `
          <div class="rv-summary-header">
            <h2 class="rv-title">Reserva de ${clientName} <span class="rv-status-badge" style="background:${statusBg};color:${statusColor}">${statusLabel}</span></h2>
          </div>
          <div class="rv-info-card">
            <div class="rv-info-top">
              <div class="rv-info-top-left">
                <div class="rv-info-id">Enrollment ${enrollmentId.slice(0, 12)}...</div>
              </div>
              <div class="rv-info-top-right">
                <div class="rv-info-stat">
                  <label>Total</label>
                  <span class="rv-info-amount">${packPrice.toFixed(2)}€</span>
                </div>
                <div class="rv-info-stat">
                  <label>Estado</label>
                  <span class="rv-info-amount" style="color:${statusColor}">${statusLabel}</span>
                </div>
              </div>
            </div>
            <div class="rv-info-bottom">
              <div class="rv-info-detail"><label>Cliente</label><strong>${clientName}</strong></div>
              <div class="rv-info-detail"><label>Actividad</label><div>${label}</div></div>
              <div class="rv-info-detail"><label>Fecha y hora</label><div>${dateLabel} · ${timeStart} - ${timeEnd}</div></div>
            </div>
          </div>
          <div class="rv-person-card">
            <div class="rv-person-header">
              <div class="rv-person-avatar" style="background:${color}">${(clientName || '?')[0].toUpperCase()}</div>
              <div class="rv-person-info"><span class="rv-person-name">${clientName}</span></div>
            </div>
            <table class="rv-sessions-table">
              <thead><tr><th>Fecha</th><th>Actividad</th><th>Horario</th><th>Estado</th></tr></thead>
              <tbody>
                <tr>
                  <td>${dateLabel}</td><td>${label}</td><td>${timeStart} - ${timeEnd}</td>
                  <td><span style="padding:2px 8px;border-radius:4px;font-size:.78rem;background:${statusBg};color:${statusColor}">${statusLabel}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          ${(() => {
            // Bono & payment summary
            if (!userId) return '';
            if (edUserBonos === null) {
              loadEdUserBonos();
              return '<div class="rv-info-card" style="padding:16px;margin-top:16px"><p style="color:var(--color-muted);font-size:.85rem">Cargando información de bonos...</p></div>';
            }
            if (!edUserBonos.length) return '';

            const totalPaid = getEdTotalPaid();
            const linkedBono = edLinkedBono;

            let html = '<div style="margin-top:16px">';
            html += '<h3 style="font-family:Space Grotesk,sans-serif;font-size:.82rem;text-transform:uppercase;color:var(--color-navy);margin:0 0 10px">Bonos del cliente — ' + label + '</h3>';

            // Show each bono
            html += edUserBonos.map(b => {
              const remaining = b.total_credits - b.used_credits;
              const paid = b.totalPaidReal;
              const isLinked = enrollment?.bono_id === b.id;
              const pct = b.total_credits > 0 ? Math.round((b.used_credits / b.total_credits) * 100) : 0;
              const borderColor = isLinked ? '#0ea5e9' : '#e2e8f0';

              return '<div style="padding:12px 16px;border:' + (isLinked ? '2px' : '1px') + ' solid ' + borderColor + ';border-radius:10px;margin-bottom:8px;background:#fff">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
                  '<div><strong style="font-size:.88rem">Bono ' + b.total_credits + ' clases</strong>' +
                    (isLinked ? ' <span style="font-size:.7rem;padding:2px 8px;background:#dbeafe;color:#1d4ed8;border-radius:4px;font-weight:700">VINCULADO</span>' : '') +
                    (b.status === 'active' ? ' <span style="font-size:.7rem;padding:2px 8px;background:#dcfce7;color:#166534;border-radius:4px;font-weight:600">ACTIVO</span>' : ' <span style="font-size:.7rem;padding:2px 8px;background:#f3f4f6;color:#6b7280;border-radius:4px">' + b.status.toUpperCase() + '</span>') +
                  '</div>' +
                  '<div>' + (b.isFullyPaid
                    ? '<span style="font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:6px;background:#dcfce7;color:#166534">PAGADO</span>'
                    : '<span style="font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:6px;background:#fef3c7;color:#92400e">DEBE ' + b.pendingAmount.toFixed(2) + '\u20ac</span>'
                  ) + '</div>' +
                '</div>' +
                '<div style="display:flex;gap:16px;font-size:.78rem;color:var(--color-muted)">' +
                  '<span>Cr\u00e9ditos: ' + remaining + '/' + b.total_credits + ' restantes</span>' +
                  '<span>Pagado: ' + paid.toFixed(2) + '\u20ac de ' + b.expectedPrice.toFixed(2) + '\u20ac</span>' +
                '</div>' +
                '<div style="margin-top:6px;height:4px;background:#f1f5f9;border-radius:2px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + (b.isFullyPaid ? '#22c55e' : '#f59e0b') + ';border-radius:2px"></div></div>' +
              '</div>';
            }).join('');

            // Summary
            const totalBonosPaid = edUserBonos.reduce((s, b) => s + b.totalPaidReal, 0);
            const totalBonosExpected = edUserBonos.reduce((s, b) => s + b.expectedPrice, 0);
            const totalBonoPending = Math.max(0, totalBonosExpected - totalBonosPaid);
            const totalCreditsRemaining = edUserBonos.filter(b => b.status === 'active').reduce((s, b) => s + (b.total_credits - b.used_credits), 0);

            html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">' +
              '<div style="padding:10px;background:#f8fafc;border-radius:8px;text-align:center"><div style="font-size:.68rem;text-transform:uppercase;color:var(--color-muted);margin-bottom:2px">Cr\u00e9ditos</div><div style="font-size:1rem;font-weight:700;color:var(--color-navy)">' + totalCreditsRemaining + '</div></div>' +
              '<div style="padding:10px;background:#f8fafc;border-radius:8px;text-align:center"><div style="font-size:.68rem;text-transform:uppercase;color:var(--color-muted);margin-bottom:2px">Total pagado</div><div style="font-size:1rem;font-weight:700;color:#166534">' + totalBonosPaid.toFixed(2) + '\u20ac</div></div>' +
              '<div style="padding:10px;background:#f8fafc;border-radius:8px;text-align:center"><div style="font-size:.68rem;text-transform:uppercase;color:var(--color-muted);margin-bottom:2px">Pendiente</div><div style="font-size:1rem;font-weight:700;color:' + (totalBonoPending > 0 ? '#b91c1c' : '#166534') + '">' + totalBonoPending.toFixed(2) + '\u20ac</div></div>' +
            '</div>';

            html += '</div>';
            return html;
          })()}`;
      } else if (edActiveTab === 'datos') {
        if (!userId) {
          tabContent = `
            <h2 class="rv-title">Datos del Cliente</h2>
            <div class="rv-info-card" style="padding:24px">
              <p style="color:var(--color-muted)">Este es un cliente sin cuenta (invitado).</p>
              <p><strong>Nombre:</strong> ${clientName}</p>
            </div>`;
        } else if (clientHistory) {
          const p = clientHistory.profile;
          const enr = clientHistory.enrollments || [];
          const rentals = clientHistory.rentals || [];
          tabContent = `
            <h2 class="rv-title">Datos del Cliente</h2>
            <div class="rv-info-card" style="padding:24px">
              <div class="bk-contact-fields">
                <div class="bk-contact-field"><label>Nombre</label><input type="text" value="${p?.full_name || clientName}" readonly /></div>
                <div class="bk-contact-field"><label>Teléfono</label><input type="text" value="${p?.phone || '—'}" readonly /></div>
                <div class="bk-contact-field"><label>Rol</label><input type="text" value="${p?.role || 'client'}" readonly /></div>
                <div class="bk-contact-field"><label>Registrado</label><input type="text" value="${p?.created_at ? new Date(p.created_at).toLocaleDateString('es-ES') : '—'}" readonly /></div>
              </div>
            </div>
            ${enr.length ? `
            <h3 class="rv-title" style="margin-top:24px">Historial de Clases (${enr.length})</h3>
            <div class="rv-info-card" style="padding:0;overflow:hidden">
              <div class="table-wrap"><table>
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Horario</th><th>Estado</th></tr></thead>
                <tbody>${enr.map(e => {
                  const sc = e.surf_class || {};
                  return `<tr>
                    <td>${sc.date ? shortDateLabel(sc.date) : '—'}</td>
                    <td>${TYPE_LABELS[sc.type] || sc.type || '—'}</td>
                    <td>${sc.time_start?.slice(0,5) || '—'} - ${sc.time_end?.slice(0,5) || '—'}</td>
                    <td><span style="padding:2px 8px;border-radius:4px;font-size:.78rem;background:${e.status === 'paid' ? '#dcfce7' : '#fee2e2'};color:${e.status === 'paid' ? '#166534' : '#b91c1c'}">${e.status === 'paid' ? 'Pagado' : e.status}</span></td>
                  </tr>`;
                }).join('')}</tbody>
              </table></div>
            </div>` : ''}
            ${rentals.length ? `
            <h3 class="rv-title" style="margin-top:24px">Alquileres (${rentals.length})</h3>
            <div class="rv-info-card" style="padding:0;overflow:hidden">
              <div class="table-wrap"><table>
                <thead><tr><th>Material</th><th>Periodo</th><th>Talla</th><th>Estado</th></tr></thead>
                <tbody>${rentals.map(r => `<tr>
                  <td>${r.equipment?.name || '—'}</td>
                  <td>${r.date_start} — ${r.date_end}</td>
                  <td>${r.size || '—'}</td>
                  <td>${r.status || '—'}</td>
                </tr>`).join('')}</tbody>
              </table></div>
            </div>` : ''}`;
        } else {
          tabContent = `
            <h2 class="rv-title">Datos del Cliente</h2>
            <div class="rv-info-card" style="padding:24px">
              <p style="color:var(--color-muted)">Cargando historial del cliente...</p>
            </div>`;
          // Fetch client history
          loadClientHistory();
        }
      } else if (edActiveTab === 'pagos') {
        const paymentsList = edPayments || [];
        const totalPaid = getEdTotalPaid();
        const displayPending = getEdPending();
        tabContent = `
          <h2 class="rv-title">Pagos</h2>
          <div class="rv-info-card" style="padding:0;overflow:hidden">
            <div style="display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #f1f5f9">
              <div style="padding:16px;text-align:center"><div style="font-size:.72rem;text-transform:uppercase;color:var(--color-muted);margin-bottom:4px">Subtotal</div><div style="font-size:1.1rem;font-weight:600">${packPrice.toFixed(2)}€</div></div>
              <div style="padding:16px;text-align:center"><div style="font-size:.72rem;text-transform:uppercase;color:var(--color-muted);margin-bottom:4px">Descuento</div><div style="font-size:1.1rem;font-weight:600;color:#f59e0b">0.00€</div></div>
              <div style="padding:16px;text-align:center"><div style="font-size:.72rem;text-transform:uppercase;color:var(--color-muted);margin-bottom:4px">Total</div><div style="font-size:1.1rem;font-weight:600">${packPrice.toFixed(2)}€</div></div>
              <div style="padding:16px;text-align:center"><div style="font-size:.72rem;text-transform:uppercase;color:var(--color-muted);margin-bottom:4px">Pendiente</div><div style="font-size:1.1rem;font-weight:600;color:${displayPending > 0 ? '#b91c1c' : '#166534'}">${displayPending.toFixed(2)}€</div></div>
            </div>
            ${paymentsList.length ? `
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:#f8fafc">
                <th style="padding:10px 16px;text-align:left;font-size:.72rem;text-transform:uppercase;color:var(--color-muted);font-weight:600">Concepto</th>
                <th style="padding:10px 16px;text-align:left;font-size:.72rem;text-transform:uppercase;color:var(--color-muted);font-weight:600">Tipo</th>
                <th style="padding:10px 16px;text-align:left;font-size:.72rem;text-transform:uppercase;color:var(--color-muted);font-weight:600">Fecha</th>
                <th style="padding:10px 16px;text-align:right;font-size:.72rem;text-transform:uppercase;color:var(--color-muted);font-weight:600">Total</th>
                <th style="padding:10px 16px;width:60px"></th>
              </tr></thead>
              <tbody>${paymentsList.map(p => `
                <tr style="border-top:1px solid #f1f5f9">
                  <td style="padding:10px 16px">${p.concept || 'Pago clase'}</td>
                  <td style="padding:10px 16px;text-transform:capitalize">${p.payment_method}</td>
                  <td style="padding:10px 16px">${new Date(p.payment_date).toLocaleString('es-ES')}</td>
                  <td style="padding:10px 16px;text-align:right;font-weight:600">${Number(p.amount).toFixed(2)}€</td>
                  <td style="padding:10px 16px;text-align:right"><button class="ed-delete-payment" data-pid="${p.id}" style="background:none;border:none;cursor:pointer;color:#b91c1c" title="Eliminar pago"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button></td>
                </tr>`).join('')}
              </tbody>
            </table>` : `<div style="padding:24px;text-align:center;color:var(--color-muted)">No hay pagos registrados</div>`}
          </div>
          <button class="btn ed-add-payment-btn" style="margin-top:16px;background:#22c55e;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600">Añadir pago</button>
          ${!enrollment?.bono_id ? (() => {
            if (edBonos === null) return '<div style="margin-top:16px;padding:16px;background:#f0f9ff;border-radius:8px;color:var(--color-muted);font-size:.85rem">Cargando créditos disponibles...</div>';
            if (!edBonos.length) return '';
            const totalCredits = edBonos.reduce((s, b) => s + (b.total_credits - b.used_credits), 0);
            const bestBono = edBonos.find(b => (b.total_credits - b.used_credits) >= 1) || edBonos[0];
            const typeLabel = TYPE_LABELS[cls.type] || cls.type;
            return '<div style="margin-top:20px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px">' +
              '<h4 style="margin:0 0 8px;font-family:Space Grotesk,sans-serif;font-size:.82rem;text-transform:uppercase;color:#166534">Pagar con cr\u00e9dito</h4>' +
              '<p style="font-size:.82rem;color:#15803d;margin:0 0 12px">El cliente tiene <strong>' + totalCredits + ' cr\u00e9ditos</strong> de ' + typeLabel + ' disponibles.</p>' +
              '<button class="ed-pay-with-credit" data-bono-id="' + bestBono.id + '" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 14px;background:#fff;border:1px solid #86efac;border-radius:8px;cursor:pointer;font-family:inherit;transition:background .15s">' +
                '<div style="text-align:left"><div style="font-weight:600;font-size:.9rem;color:#0f2f39">' + typeLabel + '</div><div style="font-size:.78rem;color:var(--color-muted)">' + totalCredits + ' cr\u00e9ditos disponibles en total</div></div>' +
                '<span style="background:#22c55e;color:#fff;padding:6px 14px;border-radius:6px;font-size:.8rem;font-weight:600;white-space:nowrap">Usar 1 cr\u00e9dito</span></button>' +
            '</div>';
          })() : '<div style="margin-top:16px;padding:12px 16px;background:#f0fdf4;border-radius:8px;font-size:.85rem;color:#166534"><strong>Pagado con cr\u00e9dito</strong> — Bono vinculado: ' + (enrollment.bono_id?.slice(0, 8) || '') + '...</div>'}`;
        if (!edPayments) loadEdPayments();
        if (edBonos === null && !enrollment?.bono_id) loadEdBonos();
      } else if (edActiveTab === 'historico') {
        const timeline = [];
        if (enrollment?.created_at) timeline.push({ date: enrollment.created_at, label: 'Inscripción creada', color: '#22c55e' });
        if (edPayments?.length) {
          edPayments.forEach(p => timeline.push({ date: p.payment_date, label: `Pago: ${Number(p.amount).toFixed(2)}€ (${p.payment_method})${p.concept ? ' — ' + p.concept : ''}`, color: '#22c55e' }));
        } else if (!edPayments) { loadEdPayments(); }
        timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
        tabContent = `
          <h2 class="rv-title">Histórico</h2>
          <div class="rv-info-card" style="padding:24px">
            <div class="rv-timeline">
              ${timeline.map(t => `
                <div class="rv-timeline-item">
                  <div class="rv-timeline-dot" style="background:${t.color}"></div>
                  <div class="rv-timeline-content">
                    <strong>${t.label}</strong>
                    <span>${new Date(t.date).toLocaleString('es-ES')}</span>
                  </div>
                </div>`).join('')}
            </div>
          </div>`;
      }

      overlay.innerHTML = `
        <div class="bk-panel bk-panel-fullscreen">
          <div class="bk-panel-header" style="background:${color}">
            <button class="bk-close-btn" id="ed-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div class="bk-header-left"><span class="bk-header-title">Ficha de Reserva</span></div>
            <div class="bk-header-right" style="display:flex;align-items:center;gap:12px">
              <div style="text-align:center"><div style="font-size:.65rem;text-transform:uppercase;opacity:.7">Total</div><div style="font-size:1.1rem;font-weight:700">${packPrice.toFixed(2)}€</div></div>
              <div style="text-align:center"><div style="font-size:.65rem;text-transform:uppercase;opacity:.7">Pendiente</div><div style="font-size:1.1rem;font-weight:700;color:${getEdPending() > 0 ? '#fca5a5' : '#86efac'}">${getEdPending().toFixed(2)}€</div></div>
            </div>
          </div>
          <div class="bk-panel-body" style="padding:0">
            <div class="rv-layout">
              <nav class="rv-sidebar">
                <a class="rv-nav-item ${edActiveTab === 'resumen' ? 'active' : ''}" data-tab="resumen">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  Resumen
                </a>
                <div class="rv-nav-group">Cliente</div>
                <a class="rv-nav-item ${edActiveTab === 'datos' ? 'active' : ''}" data-tab="datos">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Datos del comprador
                </a>
                <div class="rv-nav-group">Gestión</div>
                <a class="rv-nav-item ${edActiveTab === 'pagos' ? 'active' : ''}" data-tab="pagos">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                  Pagos
                </a>
                <a class="rv-nav-item ${edActiveTab === 'historico' ? 'active' : ''}" data-tab="historico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Histórico
                </a>
              </nav>
              <main class="rv-main" id="ed-main">${tabContent}</main>
              <aside class="rv-actions">
                <button class="rv-action-link danger" id="ed-cancel">
                  <span>Cancelar</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </button>
                <button class="rv-action-link ${currentStatus === 'paid' ? '' : 'danger'}" id="ed-toggle-pay">
                  <span>${currentStatus === 'paid' ? 'Marcar pendiente' : 'Marcar pagado'}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                </button>
                <button class="rv-action-link" id="ed-move">
                  <span>Mover a otra sesión</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/></svg>
                </button>
                <button class="rv-action-link ed-add-payment-btn" style="color:#22c55e">
                  <span>Añadir pago</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                </button>
              </aside>
            </div>
          </div>
        </div>`;

      bindEdEvents();
    }

    async function loadClientHistory() {
      if (!userId) return;
      try {
        const [profileRes, enrollRes, rentalRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          supabase.from('class_enrollments').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
          supabase.from('equipment_reservations').select('*, rental_equipment(name, type)').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
        ]);

        const enrData = enrollRes.data || [];
        // Fetch class details for enrollments
        const classIds = [...new Set(enrData.filter(e => e.class_id).map(e => e.class_id))];
        let classesMap = {};
        if (classIds.length) {
          const { data: classes } = await supabase.from('surf_classes').select('*').in('id', classIds);
          if (classes) classes.forEach(c => { classesMap[c.id] = c; });
        }

        clientHistory = {
          profile: profileRes.data,
          enrollments: enrData.map(e => ({ ...e, surf_class: classesMap[e.class_id] || null })),
          rentals: (rentalRes.data || []).map(r => ({ ...r, equipment: r.rental_equipment })),
        };
        renderEdPanel();
      } catch (err) {
        console.warn('Error loading client history:', err);
      }
    }

    async function loadEdPayments() {
      try {
        edPayments = await fetchPayments('enrollment', enrollmentId);
        // Auto-update status based on payments
        const totalPaid = getEdTotalPaid();
        if (totalPaid >= packPrice && currentStatus !== 'paid') {
          currentStatus = 'paid';
          await updateEnrollmentStatus(enrollmentId, 'paid').catch(() => {});
        } else if (totalPaid > 0 && totalPaid < packPrice && currentStatus !== 'partial') {
          currentStatus = 'partial';
          await updateEnrollmentStatus(enrollmentId, 'partial').catch(() => {});
        }
        renderEdPanel();
      } catch (err) { console.warn('Error loading enrollment payments:', err); }
    }

    async function loadEdBonos() {
      if (!userId) { edBonos = []; return; }
      try {
        const { data } = await supabase
          .from('bonos')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .eq('class_type', cls.type)
          .gt('expires_at', new Date().toISOString());
        edBonos = (data || []).filter(b => b.used_credits < b.total_credits);
        renderEdPanel();
      } catch (err) { console.warn('Error loading bonos:', err); edBonos = []; }
    }

    async function loadEdUserBonos() {
      if (!userId) { edUserBonos = []; return; }
      try {
        const { data } = await supabase
          .from('bonos')
          .select('*')
          .eq('user_id', userId)
          .eq('class_type', cls.type)
          .order('created_at', { ascending: false });
        edUserBonos = (data || []).map(b => {
          const expectedPrice = getPackPrice(b.class_type, b.total_credits, Number(cls.price) || 0);
          // If total_paid is 0 but bono was bought online (has order_id), at least the deposit was paid
          const deposit = DEPOSIT[b.class_type] || 15;
          const paid = Number(b.total_paid || 0) || (b.order_id ? deposit : 0);
          return { ...b, totalPaidReal: paid, expectedPrice, pendingAmount: Math.max(0, expectedPrice - paid), isFullyPaid: paid >= expectedPrice };
        });
        // If enrollment is linked to a bono, cache it
        if (enrollment?.bono_id) {
          edLinkedBono = edUserBonos.find(b => b.id === enrollment.bono_id) || null;
        }
        renderEdPanel();
      } catch (err) { console.warn('Error loading user bonos:', err); edUserBonos = []; }
    }

    function openEdAddPaymentModal() {
      const pending = getEdPending();
      const modal = document.createElement('div');
      modal.className = 'bk-overlay';
      modal.style.zIndex = '10001';
      modal.innerHTML = `
        <div class="bk-panel" style="max-width:480px;margin:auto;border-radius:12px;overflow:hidden">
          <div class="bk-panel-header" style="background:#22c55e;padding:16px 20px">
            <button class="bk-close-btn" id="ed-pay-modal-close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div class="bk-header-left"><span class="bk-header-title" style="font-size:1rem">Añadir pago</span></div>
          </div>
          <div style="padding:24px">
            <form id="ed-add-payment-form">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
                <div>
                  <label style="display:block;font-size:.75rem;text-transform:uppercase;font-weight:600;color:var(--color-muted);margin-bottom:6px">Concepto</label>
                  <input type="text" name="concept" placeholder="Clase de surf" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.9rem;font-family:inherit" />
                </div>
                <div>
                  <label style="display:block;font-size:.75rem;text-transform:uppercase;font-weight:600;color:var(--color-muted);margin-bottom:6px">Tipo</label>
                  <select name="payment_method" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.9rem;font-family:inherit;background:#fff">
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="voucher">Voucher</option>
                  </select>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
                <div>
                  <label style="display:block;font-size:.75rem;text-transform:uppercase;font-weight:600;color:var(--color-muted);margin-bottom:6px">Fecha</label>
                  <input type="datetime-local" name="payment_date" value="${new Date().toISOString().slice(0, 16)}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.9rem;font-family:inherit" />
                </div>
                <div>
                  <label style="display:block;font-size:.75rem;text-transform:uppercase;font-weight:600;color:var(--color-muted);margin-bottom:6px">Total (€)</label>
                  <input type="number" name="amount" step="0.01" min="0" value="${pending.toFixed(2)}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.9rem;font-family:inherit" required />
                </div>
              </div>
              <button type="submit" style="width:100%;padding:12px;background:#22c55e;color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer">Guardar pago</button>
            </form>
          </div>
        </div>`;
      document.body.appendChild(modal);

      modal.querySelector('#ed-pay-modal-close')?.addEventListener('click', () => modal.remove());
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

      modal.querySelector('#ed-add-payment-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const amount = parseFloat(fd.get('amount'));
        if (!amount || amount <= 0) { showToast('Introduce un importe válido', 'error'); return; }
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = 'Guardando...';
        try {
          await createPayment({
            reservation_type: 'enrollment',
            reference_id: enrollmentId,
            amount,
            payment_method: fd.get('payment_method'),
            concept: fd.get('concept')?.trim() || null,
            payment_date: fd.get('payment_date') ? new Date(fd.get('payment_date')).toISOString() : new Date().toISOString(),
          });
          edPayments = null; // force reload
          modal.remove();
          showToast('Pago registrado', 'success');
          // Update bono total_paid if enrollment is linked to a bono
          if (enrollment?.bono_id) {
            try {
              const { data: bono } = await supabase.from('bonos').select('total_paid').eq('id', enrollment.bono_id).single();
              const bonoCurrentPaid = Number(bono?.total_paid || 0);
              await supabase.from('bonos').update({
                total_paid: bonoCurrentPaid + amount,
                updated_at: new Date().toISOString(),
              }).eq('id', enrollment.bono_id);
            } catch (err) { console.warn('Error updating bono total_paid:', err); }
          }
          // Auto-mark status based on total paid
          const newTotalPaid = getEdTotalPaid() + amount;
          if (newTotalPaid >= packPrice && currentStatus !== 'paid') {
            currentStatus = 'paid';
            await updateEnrollmentStatus(enrollmentId, 'paid').catch(() => {});
          } else if (newTotalPaid > 0 && newTotalPaid < packPrice) {
            currentStatus = 'partial';
            await updateEnrollmentStatus(enrollmentId, 'partial').catch(() => {});
          }
          await loadEdPayments();
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
          btn.disabled = false; btn.textContent = 'Guardar pago';
        }
      });
    }

    function bindEdEvents() {
      // Close
      overlay.querySelector('#ed-close')?.addEventListener('click', () => { overlay.remove(); render(); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); render(); } });

      // Tab navigation
      overlay.querySelectorAll('.rv-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const tab = item.dataset.tab;
          if (tab) { edActiveTab = tab; renderEdPanel(); }
        });
      });

      // Toggle payment
      const togglePay = async () => {
        const newStatus = currentStatus === 'paid' ? 'confirmed' : 'paid';
        try {
          await updateEnrollmentStatus(enrollmentId, newStatus);
          currentStatus = newStatus;
          showToast(newStatus === 'paid' ? 'Marcado como pagado' : 'Marcado como pendiente', 'success');
          renderEdPanel();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      };
      overlay.querySelector('#ed-toggle-pay')?.addEventListener('click', togglePay);
      overlay.querySelector('#ed-toggle-pay-tab')?.addEventListener('click', togglePay);

      // Cancel
      overlay.querySelector('#ed-cancel')?.addEventListener('click', async () => {
        if (!confirm('¿Cancelar esta reserva?')) return;
        try {
          await deleteEnrollment(enrollmentId);
          showToast('Reserva cancelada', 'success');
          overlay.remove();
          render();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      });

      // Add payment buttons (sidebar + pagos tab)
      overlay.querySelectorAll('.ed-add-payment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); openEdAddPaymentModal(); });
      });

      // Pay with credit buttons
      overlay.querySelectorAll('.ed-pay-with-credit').forEach(btn => {
        btn.addEventListener('click', async () => {
          const bonoId = btn.dataset.bonoId;
          if (!confirm('¿Usar 1 crédito de bono para pagar esta clase?')) return;
          btn.disabled = true;
          btn.style.opacity = '0.5';
          try {
            // 1. Check bono payment status to determine enrollment status
            const { data: bonoData } = await supabase.from('bonos').select('*').eq('id', bonoId).single();
            const bonoExpectedPrice = getPackPrice(cls.type, bonoData?.total_credits || 1, Number(cls.price) || 0);
            const deposit = DEPOSIT[cls.type] || 15;
            const bonoPaid = Number(bonoData?.total_paid || 0) || (bonoData?.order_id ? deposit : 0);
            const bonoFullyPaid = bonoPaid >= bonoExpectedPrice;
            const newStatus = bonoFullyPaid ? 'paid' : 'partial';

            await supabase.from('class_enrollments').update({
              bono_id: bonoId,
              status: newStatus,
              updated_at: new Date().toISOString(),
            }).eq('id', enrollmentId);
            // Update local enrollment ref
            if (enrollment) { enrollment.bono_id = bonoId; enrollment.status = newStatus; }
            currentStatus = newStatus;

            // 2. Increment used_credits on the bono
            const { data: bono } = await supabase.from('bonos').select('used_credits').eq('id', bonoId).single();
            const newUsed = (Number(bono?.used_credits) || 0) + 1;
            await supabase.from('bonos').update({
              used_credits: newUsed,
              updated_at: new Date().toISOString(),
            }).eq('id', bonoId);

            showToast('Clase pagada con crédito de bono', 'success');
            edBonos = null;
            edUserBonos = null; // force reload
            renderEdPanel();
          } catch (err) {
            showToast('Error: ' + err.message, 'error');
            btn.disabled = false;
            btn.style.opacity = '1';
          }
        });
      });

      // Delete payment buttons
      overlay.querySelectorAll('.ed-delete-payment').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este pago?')) return;
          try {
            const pid = btn.dataset.pid;
            const payment = edPayments?.find(p => p.id === pid);
            await deletePayment(pid);
            if (payment) {
              const removedAmount = Number(payment.amount || 0);
              // If removing this payment makes total < packPrice, revert to confirmed
              const remainingPaid = getEdTotalPaid() - removedAmount;
              if (remainingPaid < packPrice && currentStatus === 'paid') {
                currentStatus = 'confirmed';
                await updateEnrollmentStatus(enrollmentId, 'confirmed').catch(() => {});
              }
              // Update bono total_paid
              if (enrollment?.bono_id) {
                try {
                  const { data: bono } = await supabase.from('bonos').select('total_paid').eq('id', enrollment.bono_id).single();
                  const bonoCurrentPaid = Number(bono?.total_paid || 0);
                  await supabase.from('bonos').update({
                    total_paid: Math.max(0, bonoCurrentPaid - removedAmount),
                    updated_at: new Date().toISOString(),
                  }).eq('id', enrollment.bono_id);
                } catch (err) { console.warn('Error updating bono total_paid:', err); }
              }
            }
            edPayments = null;
            showToast('Pago eliminado', 'success');
            await loadEdPayments();
          } catch (err) { showToast('Error: ' + err.message, 'error'); }
        });
      });
    }

    renderEdPanel();
  }

  // ======== EDIT SESSION MODAL ========
  function openEditSessionModal(cls) {
    const typeOptions = Object.entries(TYPE_LABELS)
      .map(([val, label]) => `<option value="${val}" ${cls.type === val ? 'selected' : ''}>${label}</option>`)
      .join('');

    openModal('Editar Sesión', `
      <form id="edit-session-form" class="trip-form">
        <label>Actividad</label>
        <select name="type">${typeOptions}</select>
        <label>Fecha</label>
        <input type="date" name="date" value="${cls.date}" required />
        <label>Hora de Inicio</label>
        <input type="time" name="time_start" value="${cls.time_start?.slice(0, 5) || ''}" required />
        <label>Hora de Fin</label>
        <input type="time" name="time_end" value="${cls.time_end?.slice(0, 5) || ''}" required />
        <label>Capacidad Máxima</label>
        <input type="number" name="max_students" value="${cls.max_students || 8}" min="1" required />
        <label>Instructor</label>
        <input type="text" name="instructor" value="${cls.instructor || ''}" />
        <label>Precio (€)</label>
        <input type="number" name="price" step="0.01" value="${cls.price || ''}" required />
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px">
          <input type="checkbox" name="published" ${cls.published ? 'checked' : ''} style="width:auto" />
          Publicada (visible para clientes)
        </label>
        <button type="submit" class="btn red" style="margin-top:16px">Guardar</button>
      </form>
    `);

    document.getElementById('edit-session-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const obj = Object.fromEntries(fd);
      obj.published = e.target.published.checked;
      obj.id = cls.id;
      obj.title = TYPE_LABELS[obj.type] || cls.title;
      obj.level = cls.level || 'todos';
      obj.location = cls.location || 'Playa de Roche';
      obj.status = cls.status || 'scheduled';
      if (!obj.instructor) obj.instructor = null;

      try {
        await upsertClass(obj);
        closeModal();
        showToast('Sesión actualizada', 'success');
        render();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  }

  function getEndOfMonthStr(date) {
    const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return getDateStr(d);
  }

  await render();
}
