import { fetchUserEnrollments, cancelEnrollment } from '/lib/booking.js';
import { formatDate, TYPE_LABELS } from '/lib/utils.js';
import { supabase } from '/lib/supabase.js';
import { ADMIN_EMAIL } from '/lib/shared-constants.js';

function formatTime(t) { return t?.slice(0, 5) || ''; }

export async function renderEnrollments(panel) {
  async function render() {
    const enrollments = await fetchUserEnrollments();

    const now = new Date();

    // Upcoming: confirmed future + cancelled future
    const upcoming = enrollments.filter(e => {
      const cls = e.surf_classes;
      if (!cls) return false;
      const classTime = new Date(cls.date + 'T' + cls.time_start);
      if (classTime <= now) return false;
      return e.status === 'confirmed' || e.status === 'cancelled';
    });

    // Past: everything else (past confirmed, past cancelled, completed, no_show, etc.)
    const past = enrollments.filter(e => {
      const cls = e.surf_classes;
      if (!cls) return true;
      const classTime = new Date(cls.date + 'T' + cls.time_start);
      if (classTime > now && (e.status === 'confirmed' || e.status === 'cancelled')) return false;
      return true;
    });

    let html = '';

    // Upcoming
    html += `<h3 style="margin-bottom:12px;font-family:'Space Grotesk',sans-serif;text-transform:uppercase;font-size:.85rem;color:var(--color-navy)">Próximas clases</h3>`;

    if (upcoming.length) {
      html += upcoming.map(e => {
        const cls = e.surf_classes;
        const isCancelled = e.status === 'cancelled';
        const canCancel = !isCancelled && new Date(cls.date + 'T' + cls.time_start) > new Date(Date.now() + 2 * 3600 * 1000);
        const attendee = e.family_members?.full_name || 'Yo';

        let statusHtml = '';
        if (isCancelled) {
          const cancelledLabel = e.cancelled_by === 'admin' ? 'Cancelada por la escuela' : 'Cancelada por mí';
          statusHtml = `<span class="status-badge cancelled" style="background:#fef2f2;color:#b91c1c">${cancelledLabel}</span>`;
        } else {
          statusHtml = `<span class="status-badge confirmed">Confirmada</span>`;
        }

        return `
          <div class="booking-card-item" style="${isCancelled ? 'opacity:.55;border-left:3px solid #ef4444;' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <div>
                <strong>${cls.title}</strong>
                <span class="bono-type-badge" style="margin-left:8px">${TYPE_LABELS[cls.type] || cls.type}</span>
              </div>
              ${statusHtml}
            </div>
            <p class="meta">${formatDate(cls.date)} · ${formatTime(cls.time_start)} — ${formatTime(cls.time_end)} ${cls.instructor ? '· ' + cls.instructor : ''}</p>
            <p class="meta">Asistente: <strong>${attendee}</strong></p>
            ${!isCancelled ? `<div style="margin-top:8px">
              <button class="btn line" data-action="cancel" data-id="${e.id}" style="font-size:.8rem;padding:6px 12px;${canCancel ? '' : 'opacity:.4;cursor:not-allowed'}" ${canCancel ? '' : 'disabled'}>
                ${canCancel ? 'Cancelar reserva' : 'No cancelable (<2h)'}
              </button>
            </div>` : ''}
          </div>`;
      }).join('');
    } else {
      html += '<p style="color:var(--color-muted)">No tienes clases próximas reservadas.</p>';
    }

    // Past / History
    if (past.length) {
      html += `
        <details style="margin-top:24px">
          <summary style="cursor:pointer;font-family:'Space Grotesk',sans-serif;text-transform:uppercase;font-size:.8rem;color:var(--color-muted);margin-bottom:12px">Historial de clases (${past.length})</summary>
          ${past.map(e => {
            const cls = e.surf_classes;
            const attendee = e.family_members?.full_name || 'Yo';
            let statusLabel = e.status === 'cancelled' ? 'Cancelada' : e.status === 'completed' ? 'Completada' : e.status === 'no_show' ? 'No asistió' : e.status;
            if (e.status === 'cancelled' && e.cancelled_by) {
              statusLabel = e.cancelled_by === 'admin' ? 'Cancelada por la escuela' : 'Cancelada por mí';
            }
            return `
              <div class="booking-card-item" style="opacity:.7">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                  <strong>${cls?.title || 'Clase'}</strong>
                  <span class="status-badge ${e.status}">${statusLabel}</span>
                </div>
                <p class="meta">${cls ? formatDate(cls.date) + ' · ' + formatTime(cls.time_start) : 'Fecha desconocida'} · ${attendee}</p>
              </div>`;
          }).join('')}
        </details>`;
    }

    panel.innerHTML = html;

    // Event: cancel
    panel.querySelectorAll('[data-action="cancel"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Cancelar esta reserva? El crédito se devolverá a tu bono.')) return;
        try {
          await cancelEnrollment(btn.dataset.id);
          // Fire-and-forget email notifications
          try {
            const { data: { user } } = await supabase.auth.getUser();
            const enrollment = enrollments.find(e => e.id === btn.dataset.id);
            const cls = enrollment?.surf_classes;
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
          alert('Error: ' + err.message);
        }
      });
    });
  }

  await render();
}
