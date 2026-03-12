import { fetchUserBonos, fetchPacksForType, upgradeBono } from '/lib/bonos.js';

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

export async function renderBonos(panel, switchTab) {
  const bonos = await fetchUserBonos();

  if (!bonos.length) {
    panel.innerHTML = `
      <p style="color:var(--color-muted)">No tienes bonos de clases todavía.</p>
      <p style="font-size:.9rem">Compra un pack de clases desde nuestras páginas de servicios y tu bono aparecerá aquí.</p>`;
    return;
  }

  const active = bonos.filter(b => b.status === 'active');
  const inactive = bonos.filter(b => b.status !== 'active');

  let html = '';

  if (active.length) {
    html += active.map(b => renderBonoCard(b, false, switchTab)).join('');
  }

  if (inactive.length) {
    html += `<h4 style="margin:24px 0 12px;font-family:'Space Grotesk',sans-serif;text-transform:uppercase;font-size:.8rem;color:var(--color-muted)">Bonos anteriores</h4>`;
    html += inactive.map(b => renderBonoCard(b, true)).join('');
  }

  panel.innerHTML = html;
  bindEvents(panel, switchTab, bonos);
}

function renderBonoCard(b, dimmed, switchTab) {
  const remaining = b.total_credits - b.used_credits;
  const pct = Math.round((b.used_credits / b.total_credits) * 100);
  const isActive = b.status === 'active';

  return `
    <div class="bono-card ${dimmed ? 'bono-dimmed' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span class="bono-type-badge">${TYPE_LABELS[b.class_type] || b.class_type}</span>
        <span class="status-badge ${b.status}">${b.status === 'active' ? 'Activo' : b.status === 'exhausted' ? 'Agotado' : b.status === 'expired' ? 'Expirado' : 'Cancelado'}</span>
      </div>
      <div class="bono-counter">${b.used_credits}/${b.total_credits} clases usadas</div>
      <div class="bono-progress">
        <div class="bono-progress-bar" style="width:${pct}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-top:8px">
        <span class="meta">Caduca: ${formatDate(b.expires_at)}</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isActive ? `<button class="btn-outline-sm" data-action="upgrade-bono" data-bono-id="${b.id}" data-class-type="${b.class_type}" data-total="${b.total_credits}">Ampliar pack</button>` : ''}
          ${isActive && switchTab ? `<button class="btn red" data-action="reserve-bono" style="font-size:.8rem;padding:6px 14px">Reservar clase</button>` : ''}
        </div>
      </div>
    </div>`;
}

function bindEvents(panel, switchTab, bonos) {
  // Reserve button
  panel.querySelectorAll('[data-action="reserve-bono"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (switchTab) switchTab('calendario');
    });
  });

  // Upgrade button
  panel.querySelectorAll('[data-action="upgrade-bono"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bonoId = btn.dataset.bonoId;
      const classType = btn.dataset.classType;
      const currentTotal = Number(btn.dataset.total);
      await openUpgradeModal(panel, switchTab, bonos, bonoId, classType, currentTotal);
    });
  });
}

async function openUpgradeModal(panel, switchTab, bonos, bonoId, classType, currentTotal) {
  // Fetch all packs for this activity type
  const packs = await fetchPacksForType(classType);
  if (!packs.length) {
    alert('No hay tarifas disponibles para este tipo de actividad.');
    return;
  }

  // Find the price the client paid for their current pack (closest match)
  const currentPack = packs.find(p => p.sessions === currentTotal);
  const currentPrice = currentPack ? Number(currentPack.price) : interpolatePrice(packs, currentTotal);

  // Filter packs with more sessions than current
  const upgrades = packs.filter(p => p.sessions > currentTotal);

  if (!upgrades.length) {
    alert('Ya tienes el pack más grande disponible.');
    return;
  }

  // Build modal
  const overlay = document.createElement('div');
  overlay.className = 'bono-upgrade-overlay';
  overlay.innerHTML = `
    <div class="bono-upgrade-modal">
      <div class="bono-upgrade-header">
        <h3>Ampliar Pack — ${TYPE_LABELS[classType] || classType}</h3>
        <button class="bono-upgrade-close">&times;</button>
      </div>
      <div class="bono-upgrade-body">
        <p class="bono-upgrade-current">Tu pack actual: <strong>${currentTotal} sesiones</strong> (${currentPrice.toFixed(2)}€)</p>
        <div class="bono-upgrade-options">
          ${upgrades.map(p => {
            const diff = Number(p.price) - currentPrice;
            const perSession = (Number(p.price) / p.sessions).toFixed(2);
            return `
              <button class="bono-upgrade-option" data-sessions="${p.sessions}" data-diff="${diff.toFixed(2)}">
                <div class="bono-upgrade-option-top">
                  <span class="bono-upgrade-sessions">${p.sessions} sesiones</span>
                  ${p.featured ? '<span class="bono-upgrade-featured">Popular</span>' : ''}
                </div>
                <div class="bono-upgrade-option-price">
                  <span class="bono-upgrade-total">${Number(p.price).toFixed(2)}€</span>
                  <span class="bono-upgrade-per">${perSession}€/sesión</span>
                </div>
                <div class="bono-upgrade-diff">Pagas solo: <strong>${diff.toFixed(2)}€</strong></div>
              </button>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Close
  overlay.querySelector('.bono-upgrade-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  // Select upgrade
  overlay.querySelectorAll('.bono-upgrade-option').forEach(opt => {
    opt.addEventListener('click', async () => {
      const newSessions = Number(opt.dataset.sessions);
      const diff = opt.dataset.diff;

      if (!confirm(`¿Ampliar tu pack a ${newSessions} sesiones? Diferencia a pagar: ${diff}€`)) return;

      opt.disabled = true;
      opt.style.opacity = '0.5';
      try {
        await upgradeBono(bonoId, newSessions);
        overlay.remove();
        // Re-render the bonos tab
        const freshBonos = await fetchUserBonos();
        panel.innerHTML = '';
        const active = freshBonos.filter(b => b.status === 'active');
        const inactive = freshBonos.filter(b => b.status !== 'active');
        let html = '';
        if (active.length) html += active.map(b => renderBonoCard(b, false, switchTab)).join('');
        if (inactive.length) {
          html += `<h4 style="margin:24px 0 12px;font-family:'Space Grotesk',sans-serif;text-transform:uppercase;font-size:.8rem;color:var(--color-muted)">Bonos anteriores</h4>`;
          html += inactive.map(b => renderBonoCard(b, true)).join('');
        }
        panel.innerHTML = html;
        bindEvents(panel, switchTab, freshBonos);
      } catch (err) {
        alert('Error al ampliar: ' + err.message);
        opt.disabled = false;
        opt.style.opacity = '1';
      }
    });
  });
}

// Interpolate price when client's current sessions don't match an exact pack
function interpolatePrice(packs, sessions) {
  if (!packs.length) return 0;
  // Find exact match
  const exact = packs.find(p => p.sessions === sessions);
  if (exact) return Number(exact.price);
  // Find surrounding packs
  const sorted = [...packs].sort((a, b) => a.sessions - b.sessions);
  const lower = sorted.filter(p => p.sessions < sessions).pop();
  const upper = sorted.find(p => p.sessions > sessions);
  if (lower && upper) {
    // Linear interpolation
    const ratio = (sessions - lower.sessions) / (upper.sessions - lower.sessions);
    return Number(lower.price) + ratio * (Number(upper.price) - Number(lower.price));
  }
  if (lower) {
    // Extrapolate from last tier
    const perSession = Number(lower.price) / lower.sessions;
    return Number(lower.price) + (sessions - lower.sessions) * perSession;
  }
  if (upper) return Number(upper.price);
  return 0;
}
