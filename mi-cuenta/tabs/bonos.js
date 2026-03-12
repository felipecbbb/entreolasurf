import { fetchUserBonos, fetchPacksForType, upgradeBono } from '/lib/bonos.js';
import { supabase } from '/lib/supabase.js';

const TYPE_LABELS = {
  grupal: 'Surf Grupal',
  individual: 'Surf Individual',
  yoga: 'Yoga',
  paddle: 'Paddle Surf',
  surfskate: 'SurfSkate',
};

const PACK_PRICING = {
  grupal:     [0, 35, 65, 90, 115, 135, 155, 165],
  individual: [0, 69, 130, 177, 220, 250],
  yoga:       [0, 20, 35, 48, 60, 70, 75],
  paddle:     [0, 49, 95, 135, 170, 205, 240],
  surfskate:  [0, 30, 55, 78, 95, 115, 130],
};

const DEPOSIT = { grupal: 15, individual: 15, yoga: 15, paddle: 15, surfskate: 15 };

function getPackPrice(type, sessionCount) {
  if (sessionCount <= 0) return 0;
  const tiers = PACK_PRICING[type];
  if (!tiers) return 0;
  if (sessionCount < tiers.length) return tiers[sessionCount];
  const maxTier = tiers.length - 1;
  const maxPrice = tiers[maxTier];
  const perSession = maxPrice / maxTier;
  return maxPrice + (sessionCount - maxTier) * perSession;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPrice(n) {
  return Number(n).toFixed(2).replace('.', ',') + '€';
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

  // Payment info
  const expectedPrice = getPackPrice(b.class_type, b.total_credits);
  const deposit = DEPOSIT[b.class_type] || 15;
  const paid = Number(b.total_paid || 0) || (b.order_id ? deposit : 0);
  const pending = Math.max(0, expectedPrice - paid);
  const isFullyPaid = paid >= expectedPrice;
  const payPct = expectedPrice > 0 ? Math.min(100, Math.round((paid / expectedPrice) * 100)) : 100;

  return `
    <div class="bono-card ${dimmed ? 'bono-dimmed' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span class="bono-type-badge">${TYPE_LABELS[b.class_type] || b.class_type}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="status-badge ${b.status}">${b.status === 'active' ? 'Activo' : b.status === 'exhausted' ? 'Agotado' : b.status === 'expired' ? 'Expirado' : 'Cancelado'}</span>
          ${isFullyPaid
            ? '<span class="bono-pay-badge bono-pay-ok">Pagado</span>'
            : `<span class="bono-pay-badge bono-pay-pending">Debe ${formatPrice(pending)}</span>`}
        </div>
      </div>
      <div class="bono-counter">${b.used_credits}/${b.total_credits} clases usadas</div>
      <div class="bono-progress">
        <div class="bono-progress-bar" style="width:${pct}%"></div>
      </div>

      <div class="bono-payment-info">
        <div class="bono-payment-row">
          <span>Pagado</span>
          <span style="font-weight:600;color:#065f46">${formatPrice(paid)} de ${formatPrice(expectedPrice)}</span>
        </div>
        <div class="bono-payment-bar">
          <div class="bono-payment-bar-fill" style="width:${payPct}%;background:${isFullyPaid ? '#22c55e' : '#f59e0b'}"></div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-top:10px">
        <span class="meta">Caduca: ${formatDate(b.expires_at)}</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isActive && !isFullyPaid ? `<button class="btn bono-pay-btn" data-action="pay-bono" data-bono-id="${b.id}" data-pending="${pending.toFixed(2)}" data-class-type="${b.class_type}" data-total-credits="${b.total_credits}" data-paid="${paid.toFixed(2)}">Pagar ${formatPrice(pending)}</button>` : ''}
          ${isActive ? `<button class="btn-outline-sm" data-action="upgrade-bono" data-bono-id="${b.id}" data-class-type="${b.class_type}" data-total="${b.total_credits}" data-total-paid="${b.total_paid || 0}">Ampliar pack</button>` : ''}
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
      const totalPaid = Number(btn.dataset.totalPaid) || 0;
      await openUpgradeModal(panel, switchTab, bonos, bonoId, classType, currentTotal, totalPaid);
    });
  });

  // Pay bono button
  panel.querySelectorAll('[data-action="pay-bono"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const bonoId = btn.dataset.bonoId;
      const pending = Number(btn.dataset.pending);
      const classType = btn.dataset.classType;
      const totalCredits = Number(btn.dataset.totalCredits);
      const paid = Number(btn.dataset.paid);
      openPayBonoModal(panel, switchTab, bonos, bonoId, classType, totalCredits, paid, pending);
    });
  });
}

async function openUpgradeModal(panel, switchTab, bonos, bonoId, classType, currentTotal, totalPaid) {
  // Fetch all packs for this activity type (returns { packs, deposit, extraClassPrice })
  const result = await fetchPacksForType(classType);
  const packs = result.packs || result;
  const extraClassPrice = result.extraClassPrice || 0;
  // totalPaid = everything the client has paid so far (deposit + any admin payments)
  const alreadyPaid = totalPaid || Number(result.deposit) || 15;

  if (!packs.length) {
    alert('No hay tarifas disponibles para este tipo de actividad.');
    return;
  }

  // Filter packs with more sessions than current
  const upgrades = packs.filter(p => p.sessions > currentTotal);

  // If no larger packs AND no extra class price configured, nothing to offer
  if (!upgrades.length && !extraClassPrice) {
    alert('Ya tienes el pack más grande disponible.');
    return;
  }

  // Find max pack for reference
  const maxPack = packs.length ? packs[packs.length - 1] : null;
  const maxSessions = maxPack ? maxPack.sessions : currentTotal;

  // Build extra class options (1 to 5 extra classes beyond max pack)
  const extraOptions = [];
  if (extraClassPrice > 0 && currentTotal >= maxSessions) {
    for (let i = 1; i <= 5; i++) {
      const extraSessions = currentTotal + i;
      const extraCost = extraClassPrice * i;
      extraOptions.push({ sessions: extraSessions, extraCount: i, cost: extraCost });
    }
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
        <p class="bono-upgrade-current">Tu pack actual: <strong>${currentTotal} sesiones</strong> · Ya pagado: ${alreadyPaid.toFixed(2)}€</p>
        ${upgrades.length ? `
          <p style="font-size:.82rem;color:#166534;margin:0 0 16px;padding:8px 12px;background:#f0fdf4;border-radius:8px">Se descuentan los ${alreadyPaid.toFixed(2)}€ que ya llevas pagados.</p>
          <div class="bono-upgrade-options">
            ${upgrades.map(p => {
              const newPrice = Number(p.price);
              const diff = newPrice - alreadyPaid;
              const perSession = (newPrice / p.sessions).toFixed(2);
              return `
                <button class="bono-upgrade-option" data-sessions="${p.sessions}" data-diff="${diff.toFixed(2)}" data-mode="pack">
                  <div class="bono-upgrade-option-top">
                    <span class="bono-upgrade-sessions">${p.sessions} sesiones</span>
                    ${p.featured ? '<span class="bono-upgrade-featured">Popular</span>' : ''}
                  </div>
                  <div class="bono-upgrade-option-price">
                    <span class="bono-upgrade-total">${newPrice.toFixed(2)}€</span>
                    <span class="bono-upgrade-per">${perSession}€/sesion</span>
                  </div>
                  <div class="bono-upgrade-diff">Pagas: <strong>${diff.toFixed(2)}€</strong> <span style="font-size:.75rem;color:var(--color-muted)">(${newPrice.toFixed(2)}€ - ${alreadyPaid.toFixed(2)}€ pagado)</span></div>
                </button>`;
            }).join('')}
          </div>` : ''}
        ${extraOptions.length ? `
          ${upgrades.length ? '<hr style="margin:20px 0;border:none;border-top:1px solid var(--color-line,#e5e7eb)">' : ''}
          <h4 style="font-family:'Space Grotesk',sans-serif;font-size:.85rem;font-weight:700;color:var(--color-navy);margin:0 0 12px">Clases extra · ${extraClassPrice.toFixed(2)}€/clase</h4>
          <p style="font-size:.82rem;color:var(--color-muted);margin:0 0 12px">Anade clases sueltas a tu bono al precio especial de ${extraClassPrice.toFixed(2)}€ por clase.</p>
          <div class="bono-upgrade-options">
            ${extraOptions.map(o => `
              <button class="bono-upgrade-option" data-sessions="${o.sessions}" data-diff="${o.cost.toFixed(2)}" data-mode="extra" data-extra-count="${o.extraCount}">
                <div class="bono-upgrade-option-top">
                  <span class="bono-upgrade-sessions">+${o.extraCount} clase${o.extraCount > 1 ? 's' : ''} extra</span>
                </div>
                <div class="bono-upgrade-option-price">
                  <span class="bono-upgrade-total">${o.sessions} sesiones total</span>
                  <span class="bono-upgrade-per">${extraClassPrice.toFixed(2)}€/clase extra</span>
                </div>
                <div class="bono-upgrade-diff">Pagas: <strong>${o.cost.toFixed(2)}€</strong></div>
              </button>`).join('')}
          </div>` : ''}
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Close
  overlay.querySelector('.bono-upgrade-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  // Select upgrade (both pack upgrades and extra classes)
  overlay.querySelectorAll('.bono-upgrade-option').forEach(opt => {
    opt.addEventListener('click', async () => {
      const newSessions = Number(opt.dataset.sessions);
      const diff = opt.dataset.diff;
      const mode = opt.dataset.mode;
      const extraCount = opt.dataset.extraCount;

      const msg = mode === 'extra'
        ? `¿Anadir ${extraCount} clase${extraCount > 1 ? 's' : ''} extra? Coste: ${diff}€`
        : `¿Ampliar tu pack a ${newSessions} sesiones? Diferencia a pagar: ${diff}€`;

      if (!confirm(msg)) return;

      opt.disabled = true;
      opt.style.opacity = '0.5';
      try {
        await upgradeBono(bonoId, newSessions, Number(diff));
        overlay.remove();
        await refreshBonosPanel(panel, switchTab);
      } catch (err) {
        alert('Error al ampliar: ' + err.message);
        opt.disabled = false;
        opt.style.opacity = '1';
      }
    });
  });
}

function openPayBonoModal(panel, switchTab, bonos, bonoId, classType, totalCredits, alreadyPaid, pending) {
  const overlay = document.createElement('div');
  overlay.className = 'bono-upgrade-overlay';
  overlay.innerHTML = `
    <div class="bono-upgrade-modal" style="max-width:420px">
      <div class="bono-upgrade-header">
        <h3>Pagar bono — ${TYPE_LABELS[classType] || classType}</h3>
        <button class="bono-upgrade-close">&times;</button>
      </div>
      <div class="bono-upgrade-body">
        <p class="bono-upgrade-current">Pack de <strong>${totalCredits} sesiones</strong></p>
        <div class="bono-pay-detail-grid">
          <div class="bono-pay-detail-item">
            <span class="bono-pay-detail-label">Precio total</span>
            <span class="bono-pay-detail-value">${formatPrice(alreadyPaid + pending)}</span>
          </div>
          <div class="bono-pay-detail-item">
            <span class="bono-pay-detail-label">Ya pagado</span>
            <span class="bono-pay-detail-value" style="color:#065f46">${formatPrice(alreadyPaid)}</span>
          </div>
          <div class="bono-pay-detail-item bono-pay-detail-highlight">
            <span class="bono-pay-detail-label">Pendiente</span>
            <span class="bono-pay-detail-value">${formatPrice(pending)}</span>
          </div>
        </div>
        <p style="font-size:.82rem;color:var(--color-muted);margin:16px 0 0">
          Puedes pagar la totalidad del importe pendiente.
          El pago se realizará en la escuela (efectivo o tarjeta).
        </p>
        <button class="btn red" id="pay-bono-confirm" style="width:100%;margin-top:18px;padding:12px;font-size:.92rem">
          Confirmar pago de ${formatPrice(pending)}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.querySelector('.bono-upgrade-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#pay-bono-confirm').addEventListener('click', async () => {
    const btn = overlay.querySelector('#pay-bono-confirm');
    btn.disabled = true;
    btn.textContent = 'Procesando…';
    try {
      const newTotalPaid = alreadyPaid + pending;
      const { error } = await supabase
        .from('bonos')
        .update({ total_paid: newTotalPaid })
        .eq('id', bonoId);
      if (error) throw error;

      // Update enrollment statuses to 'paid' if they were 'partial'
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('class_enrollments')
          .update({ status: 'paid' })
          .eq('bono_id', bonoId)
          .eq('status', 'partial');
      }

      overlay.remove();
      await refreshBonosPanel(panel, switchTab);
    } catch (err) {
      alert('Error al registrar pago: ' + err.message);
      btn.disabled = false;
      btn.textContent = `Confirmar pago de ${formatPrice(pending)}`;
    }
  });
}

async function refreshBonosPanel(panel, switchTab) {
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
}

