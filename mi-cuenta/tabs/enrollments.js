import { fetchUserEnrollments, cancelEnrollment } from '/lib/booking.js';

const TYPE_LABELS = {
  grupal: 'Surf Grupal',
  individual: 'Surf Individual',
  yoga: 'Yoga',
  paddle: 'Paddle Surf',
  surfskate: 'SurfSkate',
};

function formatDate(d) {
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(t) { return t?.slice(0, 5) || ''; }

export async function renderEnrollments(panel) {
  async function render() {
    const enrollments = await fetchUserEnrollments();

    const now = new Date();
    const upcoming = enrollments.filter(e => {
      if (e.status !== 'confirmed') return false;
      const cls = e.surf_classes;
      if (!cls) return false;
      return new Date(cls.date + 'T' + cls.time_start) > now;
    });

    const past = enrollments.filter(e => {
      const cls = e.surf_classes;
      if (!cls) return true;
      return e.status !== 'confirmed' || new Date(cls.date + 'T' + cls.time_start) <= now;
    });

    let html = '';

    // Upcoming
    html += `<h3 style="margin-bottom:12px;font-family:'Space Grotesk',sans-serif;text-transform:uppercase;font-size:.85rem;color:var(--color-navy)">Próximas clases</h3>`;

    if (upcoming.length) {
      html += upcoming.map(e => {
        const cls = e.surf_classes;
        const canCancel = new Date(cls.date + 'T' + cls.time_start) > new Date(Date.now() + 2 * 3600 * 1000);
        const attendee = e.family_members?.full_name || 'Yo';
        return `
          <div class="booking-card-item">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <div>
                <strong>${cls.title}</strong>
                <span class="bono-type-badge" style="margin-left:8px">${TYPE_LABELS[cls.type] || cls.type}</span>
              </div>
              <span class="status-badge confirmed">Confirmada</span>
            </div>
            <p class="meta">${formatDate(cls.date)} · ${formatTime(cls.time_start)} — ${formatTime(cls.time_end)} ${cls.instructor ? '· ' + cls.instructor : ''}</p>
            <p class="meta">Asistente: <strong>${attendee}</strong></p>
            <div style="margin-top:8px">
              <button class="btn line" data-action="cancel" data-id="${e.id}" style="font-size:.8rem;padding:6px 12px;${canCancel ? '' : 'opacity:.4;cursor:not-allowed'}" ${canCancel ? '' : 'disabled'}>
                ${canCancel ? 'Cancelar reserva' : 'No cancelable (<2h)'}
              </button>
            </div>
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
            const statusLabel = e.status === 'cancelled' ? 'Cancelada' : e.status === 'completed' ? 'Completada' : e.status === 'no_show' ? 'No asistió' : e.status;
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
          render();
        } catch (err) {
          alert('Error: ' + err.message);
        }
      });
    });
  }

  await render();
}
