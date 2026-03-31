import { fetchPublishedClasses, bookClass, cancelEnrollment } from '/lib/booking.js';
import { fetchActiveBonos, fetchUserBonos } from '/lib/bonos.js';
import { fetchFamilyMembers } from '/lib/family.js';
import { supabase } from '/lib/supabase.js';
import { TYPE_LABELS, showToast } from '/lib/utils.js';
import { LEVEL_OPTIONS, AUDIENCE_OPTIONS, ADMIN_EMAIL } from '/lib/shared-constants.js';

const TYPE_COLORS = {
  grupal: '#0ea5e9',
  individual: '#f59e0b',
  yoga: '#a855f7',
  paddle: '#22c55e',
  surfskate: '#ef4444',
};

const AUDIENCE_LABELS = Object.fromEntries(AUDIENCE_OPTIONS.map(a => [a.value, a.label]));

function formatTime(t) { return t?.slice(0, 5) || ''; }

function getDateRange(offset = 0) {
  const dates = [];
  const today = new Date();
  today.setDate(today.getDate() + offset);
  for (let i = 0; i < 10; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.toLocaleDateString('es-ES', { weekday: 'short' });
  const num = d.getDate();
  return `<span class="date-strip-weekday">${day}</span><span class="date-strip-num">${num}</span>`;
}

// Fetch all available classes for a date
async function fetchClassesForDate(date, level) {
  let query = supabase
    .from('surf_classes')
    .select('*')
    .eq('date', date)
    .order('time_start', { ascending: true });

  if (level && level !== 'todos') {
    query = query.or(`level.eq.${level},level.eq.todos`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('fetchClassesForDate:', error);
    return [];
  }
  return data || [];
}

export async function renderCalendar(panel) {
  let dateOffset = 0;
  let selectedDate = null;
  let filterLevel = 'principiante';
  let filterType = '';
  let allBonos = [];

  async function render() {
    try {
      // Fetch user bonos to know which types they can book
      allBonos = await fetchUserBonos();
    } catch (err) {
      console.error('Error fetching bonos:', err);
      allBonos = [];
    }
    const activeBonos = allBonos.filter(b => b.status === 'active' && b.used_credits < b.total_credits && new Date(b.expires_at) > new Date());
    const activeTypes = [...new Set(activeBonos.map(b => b.class_type))];

    const dates = getDateRange(dateOffset);
    if (!selectedDate || !dates.includes(selectedDate)) selectedDate = dates[0];

    let html = '';

    // Credits summary (always show, even if empty)
    if (activeBonos.length) {
      html += `<div class="credits-summary">
        <h3 class="credits-title">Tus créditos disponibles</h3>
        <div class="credits-grid">
          ${activeBonos.map(b => {
            const remaining = b.total_credits - b.used_credits;
            const color = TYPE_COLORS[b.class_type] || '#64748b';
            return `<div class="credit-card" style="border-left:4px solid ${color}">
              <span class="credit-type" style="color:${color}">${TYPE_LABELS[b.class_type] || b.class_type}</span>
              <span class="credit-count">${remaining} crédito${remaining !== 1 ? 's' : ''}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    } else {
      html += `<div class="no-bonos-prompt">
        <div class="no-bonos-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#FFCC01" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        </div>
        <h3>No tienes créditos de clases</h3>
        <p>Compra un pack de clases para poder reservar en el calendario.</p>
        <div class="no-bonos-links">
          <a href="/clases-de-surf-grupales/" class="btn red">Surf Grupal</a>
          <a href="/clases-de-surf-individuales/" class="btn red">Surf Individual</a>
          <a href="/clases-de-yoga/" class="btn red">Yoga</a>
          <a href="/paddle-surf/" class="btn red">Paddle Surf</a>
          <a href="/clases-de-surfskate/" class="btn red">SurfSkate</a>
        </div>
      </div>`;
    }

    // Type filter buttons
    const allTypes = Object.keys(TYPE_LABELS);
    html += `<div class="cal-filters">
      <div class="cal-filter-types">
        <button class="cal-type-btn ${!filterType ? 'active' : ''}" data-type="">Todas</button>
        ${allTypes.map(t => `<button class="cal-type-btn ${filterType === t ? 'active' : ''}" data-type="${t}" style="--type-color:${TYPE_COLORS[t]}">${TYPE_LABELS[t]}</button>`).join('')}
      </div>
      <select id="cal-filter-level" style="padding:6px 10px;border-radius:var(--radius-sm);border:1px solid var(--color-line);font-size:.85rem">
        ${LEVEL_OPTIONS.map(l => `<option value="${l.value}" ${filterLevel === l.value ? 'selected' : ''}>${l.label}</option>`).join('')}
      </select>
    </div>`;

    // Date strip
    html += `
      <div class="date-strip">
        <button class="date-strip-arrow" id="cal-prev">&lsaquo;</button>
        ${dates.map(d => `<button class="date-strip-day ${d === selectedDate ? 'active' : ''}" data-date="${d}">${formatDayLabel(d)}</button>`).join('')}
        <button class="date-strip-arrow" id="cal-next">&rsaquo;</button>
      </div>`;

    // Fetch ALL classes for this date
    let allClasses = await fetchClassesForDate(selectedDate, filterLevel);

    // Apply type filter if selected
    if (filterType) {
      allClasses = allClasses.filter(c => c.type === filterType);
    }

    // Fetch user's enrollments for these classes to show cancel option
    let userEnrollments = [];
    if (allClasses.length) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const classIds = allClasses.map(c => c.id);
          const { data } = await supabase
            .from('class_enrollments')
            .select('id, class_id, family_member_id, status, family_members(full_name)')
            .eq('user_id', user.id)
            .in('class_id', classIds)
            .in('status', ['confirmed', 'paid', 'partial']);
          userEnrollments = data || [];
        }
      } catch (err) {
        console.error('Error fetching user enrollments:', err);
      }
    }

    if (allClasses.length) {
      html += `<div class="class-slots">`;
      html += allClasses.map(c => {
        const spotsLeft = c.max_students - (c.enrolled_count || 0);
        const full = spotsLeft <= 0;
        const color = TYPE_COLORS[c.type] || '#0ea5e9';
        const bonoForType = activeBonos.find(b => b.class_type === c.type);
        const credits = bonoForType ? (bonoForType.total_credits - bonoForType.used_credits) : 0;
        const hasBono = credits > 0;

        // Check if user is already enrolled in this class
        const myEnrollments = userEnrollments.filter(e => e.class_id === c.id);
        const isEnrolled = myEnrollments.length > 0;

        let footerAction = '';
        if (isEnrolled) {
          // Show enrolled status + cancel buttons
          const cancelBtns = myEnrollments.map(e => {
            const label = e.family_member_id ? (e.family_members?.full_name || 'Familiar') : 'Mi reserva';
            return `<button class="btn line" data-action="cancel" data-enrollment-id="${e.id}" style="font-size:.78rem;padding:5px 12px;color:#b91c1c;border-color:#b91c1c">\u2715 ${label}</button>`;
          }).join(' ');
          footerAction = `
            <span class="spots-badge" style="background:#dcfce7;color:#15803d">Reservado</span>
            ${cancelBtns}`;
        } else if (full) {
          footerAction = '<span class="meta" style="color:#c0392b">Completa</span>';
        } else if (hasBono) {
          footerAction = `<button class="btn red" data-action="book" data-class-id="${c.id}" data-class-type="${c.type}" style="font-size:.8rem;padding:6px 14px">Reservar</button>`;
        } else {
          const buyLink = c.type === 'grupal' ? 'clases-de-surf-grupales' : c.type === 'individual' ? 'clases-de-surf-individuales' : c.type === 'yoga' ? 'clases-de-yoga' : c.type === 'paddle' ? 'paddle-surf' : 'clases-de-surfskate';
          footerAction = `<a href="/${buyLink}/" class="btn line" style="font-size:.8rem;padding:6px 14px">Comprar bono</a>`;
        }

        return `
          <div class="class-slot-card ${full ? 'class-slot-full' : ''} ${isEnrolled ? 'class-slot-enrolled' : ''}" style="border-left:4px solid ${color}">
            <div class="class-slot-header">
              <span class="class-slot-time">${formatTime(c.time_start)} — ${formatTime(c.time_end)}</span>
              <span class="bono-type-badge" style="background:${color};color:#fff">${TYPE_LABELS[c.type] || c.type}</span>
            </div>
            <div class="class-slot-body">
              <strong>${c.title || TYPE_LABELS[c.type]}</strong>
              ${c.instructor ? `<span class="meta">${c.instructor}</span>` : ''}
              ${c.level && c.level !== 'todos' ? `<span class="meta">Nivel: ${c.level}</span>` : ''}
              ${c.audience ? `<span class="meta">${AUDIENCE_LABELS[c.audience] || c.audience}</span>` : ''}
              ${c.location ? `<span class="meta">${c.location}</span>` : ''}
            </div>
            <div class="class-slot-footer">
              <span class="spots-badge ${full ? 'spots-full' : ''}">${c.enrolled_count || 0}/${c.max_students} plazas</span>
              ${footerAction}
            </div>
          </div>`;
      }).join('');
      html += `</div>`;
    } else {
      html += '<p style="color:var(--color-muted);margin-top:20px;text-align:center">No hay clases publicadas para esta fecha.</p>';
    }

    // Booking modal (hidden)
    html += `<div id="booking-modal" class="booking-modal" style="display:none">
      <div class="booking-modal-content">
        <h3>Reservar clase</h3>
        <div id="booking-modal-body"></div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn red" id="confirm-booking">Confirmar reserva</button>
          <button class="btn line" id="cancel-booking">Cancelar</button>
        </div>
      </div>
    </div>`;

    panel.innerHTML = html;

    // Events — type filter
    panel.querySelectorAll('.cal-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filterType = btn.dataset.type;
        render();
      });
    });

    panel.querySelector('#cal-filter-level')?.addEventListener('change', (e) => {
      filterLevel = e.target.value;
      render();
    });

    panel.querySelector('#cal-prev')?.addEventListener('click', () => {
      dateOffset = Math.max(dateOffset - 10, 0);
      render();
    });
    panel.querySelector('#cal-next')?.addEventListener('click', () => {
      dateOffset += 10;
      render();
    });

    panel.querySelectorAll('.date-strip-day').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDate = btn.dataset.date;
        render();
      });
    });

    panel.querySelectorAll('[data-action="book"]').forEach(btn => {
      btn.addEventListener('click', () => openBookingModal(btn.dataset.classId, btn.dataset.classType));
    });

    // Cancel enrollment
    panel.querySelectorAll('[data-action="cancel"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Cancelar esta reserva? El crédito se restablecerá a tu bono.')) return;
        btn.disabled = true;
        btn.textContent = 'Cancelando…';
        try {
          await cancelEnrollment(btn.dataset.enrollmentId);
          showToast('Reserva cancelada. Crédito restablecido.');
          // Fire-and-forget email notifications
          try {
            const { data: { user } } = await supabase.auth.getUser();
            const enrollmentId = btn.dataset.enrollmentId;
            const enrollment = userEnrollments.find(e => e.id === enrollmentId);
            const cls = enrollment ? allClasses.find(c => c.id === enrollment.class_id) : null;
            const customerName = user?.user_metadata?.full_name || user?.email || '';
            const emailData = {
              customerName,
              className: cls?.title || 'Clase',
              classDate: cls?.date || '',
              classTime: cls ? formatTime(cls.time_start) + ' — ' + formatTime(cls.time_end) : '',
            };
            if (user?.email) {
              supabase.functions.invoke('send-email', {
                body: { to: user.email, type: 'class_cancelled', data: emailData },
              });
            }
            // Notificar al admin
            supabase.functions.invoke('send-email', {
              body: {
                to: ADMIN_EMAIL,
                type: 'admin_class_cancelled',
                data: { ...emailData, customerEmail: user?.email || '' },
              },
            });
          } catch {}
          render();
        } catch (err) {
          alert('Error al cancelar: ' + err.message);
          btn.disabled = false;
          btn.textContent = 'Cancelar reserva';
        }
      });
    });
  }

  async function openBookingModal(classId, classType) {
    const modal = panel.querySelector('#booking-modal');
    const body = panel.querySelector('#booking-modal-body');

    let bonos, members;
    try {
      [bonos, members] = await Promise.all([
        fetchActiveBonos(classType),
        fetchFamilyMembers(),
      ]);
    } catch (err) {
      console.error('Error loading booking data:', err);
      bonos = [];
      members = [];
    }

    if (!bonos.length) {
      body.innerHTML = `
        <p>No tienes bonos activos para <strong>${TYPE_LABELS[classType] || classType}</strong>.</p>
        <p style="font-size:.9rem">Compra un pack de clases y vuelve para reservar.</p>`;
      panel.querySelector('#confirm-booking').style.display = 'none';
    } else {
      let html = `
        <p style="font-size:.9rem;color:var(--color-muted);margin-bottom:12px">Selecciona quién asistirá a esta clase:</p>
        <div id="booking-persons" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
          <label class="booking-person-check" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--color-line);border-radius:8px;cursor:pointer">
            <input type="checkbox" name="person" value="" checked>
            <div>
              <strong>Yo mismo</strong>
            </div>
          </label>
          ${members.map(m => `
            <label class="booking-person-check" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--color-line);border-radius:8px;cursor:pointer">
              <input type="checkbox" name="person" value="${m.id}">
              <div>
                <strong>${m.full_name}</strong>
                <span style="font-size:.8rem;color:var(--color-muted)">${m.level || ''}${m.wetsuit_size ? ' \u00b7 ' + m.wetsuit_size : ''}</span>
              </div>
            </label>
          `).join('')}
        </div>
        <label style="display:block">
          Usar bono:
          <select id="booking-bono" style="width:100%;padding:8px;border-radius:var(--radius-sm);border:1px solid var(--color-line);margin-top:4px">
            ${bonos.map(b => `<option value="${b.id}">${TYPE_LABELS[b.class_type]} \u2014 ${b.total_credits - b.used_credits} cr\u00e9ditos restantes</option>`).join('')}
          </select>
        </label>
        <p id="booking-credits-info" style="font-size:.85rem;margin-top:8px;color:var(--color-muted)"></p>`;
      body.innerHTML = html;
      panel.querySelector('#confirm-booking').style.display = '';

      // Live credits info update
      function updateCreditsInfo() {
        const checked = body.querySelectorAll('input[name="person"]:checked').length;
        const bonoSelect = body.querySelector('#booking-bono');
        const selectedBono = bonos.find(b => b.id === bonoSelect?.value);
        const remaining = selectedBono ? (selectedBono.total_credits - selectedBono.used_credits) : 0;
        const infoEl = body.querySelector('#booking-credits-info');
        if (infoEl) {
          if (checked > remaining) {
            infoEl.innerHTML = `<span style="color:#b91c1c">No tienes suficientes cr\u00e9ditos (${checked} necesarios, ${remaining} disponibles)</span>`;
          } else {
            infoEl.textContent = `Se usar\u00e1n ${checked} cr\u00e9dito${checked !== 1 ? 's' : ''} de ${remaining} disponibles`;
          }
        }
      }
      body.querySelectorAll('input[name="person"]').forEach(cb => cb.addEventListener('change', updateCreditsInfo));
      body.querySelector('#booking-bono')?.addEventListener('change', updateCreditsInfo);
      updateCreditsInfo();
    }

    modal.style.display = 'flex';

    panel.querySelector('#cancel-booking').onclick = () => { modal.style.display = 'none'; };

    panel.querySelector('#confirm-booking').onclick = async () => {
      const bonoId = panel.querySelector('#booking-bono')?.value;
      if (!bonoId) return;

      const checkedPersons = [...body.querySelectorAll('input[name="person"]:checked')].map(cb => cb.value);
      if (!checkedPersons.length) { alert('Selecciona al menos una persona'); return; }

      // Check credits
      const selectedBono = bonos.find(b => b.id === bonoId);
      const remaining = selectedBono ? (selectedBono.total_credits - selectedBono.used_credits) : 0;
      if (checkedPersons.length > remaining) { alert('No tienes suficientes cr\u00e9ditos'); return; }

      const confirmBtn = panel.querySelector('#confirm-booking');
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Reservando\u2026';

      try {
        for (const personValue of checkedPersons) {
          const familyMemberId = personValue || null; // empty string = self
          await bookClass(classId, bonoId, familyMemberId);
        }
        modal.style.display = 'none';
        showToast(`${checkedPersons.length} plaza${checkedPersons.length > 1 ? 's' : ''} reservada${checkedPersons.length > 1 ? 's' : ''}`);
        // Fire-and-forget email notifications
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const cls = allClasses.find(c => c.id === classId);
          const customerName = user?.user_metadata?.full_name || user?.email || '';
          const emailData = {
            customerName,
            className: cls?.title || TYPE_LABELS[classType] || classType,
            classDate: cls?.date || '',
            classTime: cls ? formatTime(cls.time_start) + ' — ' + formatTime(cls.time_end) : '',
            classType: TYPE_LABELS[classType] || classType,
            instructor: cls?.instructor || '',
            spots: checkedPersons.length,
          };
          // Email al cliente
          if (user?.email) {
            supabase.functions.invoke('send-email', {
              body: { to: user.email, type: 'class_booked', data: emailData },
            });
          }
          // Email al admin
          supabase.functions.invoke('send-email', {
            body: {
              to: ADMIN_EMAIL,
              type: 'admin_class_booked',
              data: { ...emailData, customerEmail: user?.email || '' },
            },
          });
        } catch {}
        render();
      } catch (err) {
        alert('Error al reservar: ' + err.message);
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirmar reserva';
      }
    };
  }

  await render();
}
