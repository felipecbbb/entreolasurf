import { getSession, getProfile, signIn, signUp, signOut, updateProfile } from '/lib/auth-client.js';
import { supabase } from '/lib/supabase.js';
import { esc, formatDate, formatPrice } from '/lib/utils.js';
import { WETSUIT_SIZES, LEVEL_OPTIONS, wetsuitOptionsHtml, levelOptionsHtml } from '/lib/shared-constants.js';
import { TERMS_HTML, WAIVER_HTML, openLegalModal } from '/mi-cuenta/legal-texts.js';
import { renderFamily } from '/mi-cuenta/tabs/family.js';
import { renderBonos } from '/mi-cuenta/tabs/bonos.js';
import { renderCalendar } from '/mi-cuenta/tabs/calendar.js';
import { renderEnrollments } from '/mi-cuenta/tabs/enrollments.js';
import { renderPayments } from '/mi-cuenta/tabs/payments.js';

const mainEl = document.querySelector('main');

function statusBadge(status) {
  return `<span class="status-badge ${status || 'pending'}">${status || 'pendiente'}</span>`;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function hideFooter() {
  const f = document.querySelector('.site-footer');
  if (f) f.style.display = 'none';
}
function showFooter() {
  const f = document.querySelector('.site-footer');
  if (f) f.style.display = '';
}

// ---- Auth view (login + register) ----
function renderAuth() {
  hideFooter();
  mainEl.innerHTML = `
    <div class="auth-page">
      <div class="auth-page-left">
        <div class="auth-page-form">
          <div id="auth-view-login" class="auth-view active">
            <h1 class="auth-title">Bienvenido de nuevo</h1>
            <p class="auth-subtitle">Accede a tu cuenta para gestionar tus reservas y clases</p>
            <form id="login-form" class="auth-form">
              <div class="auth-field">
                <label for="login-email">Email</label>
                <input type="email" id="login-email" name="email" placeholder="tu@email.com" required>
              </div>
              <div class="auth-field">
                <label for="login-pass">Contraseña</label>
                <input type="password" id="login-pass" name="password" placeholder="Tu contraseña" required>
              </div>
              <p class="auth-error" id="login-error"></p>
              <button type="submit" class="auth-submit-btn">Iniciar sesión</button>
            </form>
            <p class="auth-switch">¿No tienes cuenta? <a href="#" id="switch-to-register">Crear cuenta</a></p>
          </div>
          <div id="auth-view-register" class="auth-view">
            <h1 class="auth-title">Crear cuenta</h1>
            <p class="auth-subtitle">Regístrate para reservar clases y gestionar tu perfil</p>

            <!-- Step 1: Personal data -->
            <form id="register-step1" class="auth-form">
              <div class="auth-field">
                <label for="reg-name">Nombre completo *</label>
                <input type="text" id="reg-name" name="fullname" placeholder="Tu nombre completo" required>
              </div>
              <div class="auth-field">
                <label for="reg-phone">Teléfono *</label>
                <input type="tel" id="reg-phone" name="phone" placeholder="+34 600 000 000" required>
              </div>
              <div class="auth-field">
                <label for="reg-email">Email *</label>
                <input type="email" id="reg-email" name="email" placeholder="tu@email.com" required>
              </div>
              <div class="auth-field">
                <label for="reg-address">Dirección</label>
                <input type="text" id="reg-address" name="address" placeholder="Calle, número, ciudad">
              </div>
              <div class="auth-field">
                <label for="reg-postal">Código postal</label>
                <input type="text" id="reg-postal" name="postal_code" placeholder="11149">
              </div>
              <div class="auth-field">
                <label for="reg-level">Nivel de surf *</label>
                <select id="reg-level" name="level" required>
                  <option value="">Seleccionar nivel</option>
                  ${LEVEL_OPTIONS.map(l => `<option value="${l.value}">${l.label} (${l.desc})</option>`).join('')}
                </select>
              </div>
              <div class="auth-field">
                <label for="reg-wetsuit">Talla de neopreno</label>
                <select id="reg-wetsuit" name="wetsuit_size">
                  ${wetsuitOptionsHtml()}
                </select>
              </div>
              <div class="auth-field">
                <label for="reg-swim">¿Sabes nadar? *</label>
                <select id="reg-swim" name="can_swim" required>
                  <option value="">Seleccionar</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div class="auth-field">
                <label for="reg-injury">¿Tienes alguna lesión?</label>
                <select id="reg-injury" name="has_injury">
                  <option value="false">No</option>
                  <option value="true">Sí</option>
                </select>
              </div>
              <div class="auth-field" id="reg-injury-wrap" style="display:none">
                <label for="reg-injury-detail">Describe tu lesión</label>
                <input type="text" id="reg-injury-detail" name="injury_detail" placeholder="Ej: rodilla derecha">
              </div>
              <div class="auth-field">
                <label class="auth-checkbox-label">
                  <input type="checkbox" id="reg-terms" required>
                  Acepto los <a href="#" id="open-terms-modal">Términos y Condiciones</a> *
                </label>
              </div>
              <div class="auth-field">
                <label class="auth-checkbox-label">
                  <input type="checkbox" id="reg-waiver" required>
                  Acepto la <a href="#" id="open-waiver-modal">Exención de Responsabilidad</a> *
                </label>
              </div>
              <p class="auth-error" id="register-error-step1"></p>
              <button type="submit" class="auth-submit-btn">Siguiente →</button>
            </form>

            <!-- Step 2: Create account (password) -->
            <form id="register-step2" class="auth-form" style="display:none">
              <div class="auth-field">
                <label for="reg2-email">Email</label>
                <input type="email" id="reg2-email" disabled>
              </div>
              <div class="auth-field">
                <label for="reg2-pass">Contraseña *</label>
                <input type="password" id="reg2-pass" name="password" placeholder="Mínimo 6 caracteres" required minlength="6">
              </div>
              <div class="auth-field">
                <label for="reg2-pass2">Repetir contraseña *</label>
                <input type="password" id="reg2-pass2" name="password2" placeholder="Repite tu contraseña" required minlength="6">
              </div>
              <p class="auth-error" id="register-error-step2"></p>
              <div style="display:flex;gap:8px">
                <button type="button" class="auth-submit-btn" id="reg-back-btn" style="background:transparent;color:var(--color-navy);border:1px solid var(--color-line)">← Atrás</button>
                <button type="submit" class="auth-submit-btn">Crear cuenta</button>
              </div>
            </form>

            <p class="auth-switch">¿Ya tienes cuenta? <a href="#" id="switch-to-login">Iniciar sesión</a></p>
          </div>
        </div>
      </div>
      <div class="auth-page-right">
        <div class="auth-brand-card">
          <div class="auth-brand-content">
            <p class="auth-brand-tagline">Surf · Yoga · Paddle Surf · SurfSkate</p>
            <h2 class="auth-brand-heading">Tu escuela de surf en Roche, Cádiz</h2>
            <p class="auth-brand-desc">Reserva clases, gestiona tus bonos y consulta tu historial desde tu cuenta personal.</p>
          </div>
        </div>
      </div>
    </div>`;

  // Toggle login/register
  document.getElementById('switch-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('auth-view-login').classList.remove('active');
    document.getElementById('auth-view-register').classList.add('active');
  });
  document.getElementById('switch-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('auth-view-register').classList.remove('active');
    document.getElementById('auth-view-login').classList.add('active');
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    const btn = e.target.querySelector('button[type="submit"]');
    errEl.textContent = '';
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      await signIn(e.target.email.value, e.target.password.value);
      renderDashboard();
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false; btn.textContent = 'Iniciar sesión';
    }
  });

  // Register — multi-step
  let regStep1Data = {};

  // Injury toggle
  document.getElementById('reg-injury')?.addEventListener('change', (e) => {
    document.getElementById('reg-injury-wrap').style.display = e.target.value === 'true' ? '' : 'none';
  });

  // Legal modals
  document.getElementById('open-terms-modal')?.addEventListener('click', (e) => {
    e.preventDefault();
    openLegalModal('Términos y Condiciones', TERMS_HTML);
  });
  document.getElementById('open-waiver-modal')?.addEventListener('click', (e) => {
    e.preventDefault();
    openLegalModal('Exención de Responsabilidad', WAIVER_HTML);
  });

  // Step 1 → Step 2
  document.getElementById('register-step1').addEventListener('submit', (e) => {
    e.preventDefault();
    const errEl = document.getElementById('register-error-step1');
    errEl.textContent = '';

    if (!document.getElementById('reg-terms').checked) {
      errEl.textContent = 'Debes aceptar los Términos y Condiciones.';
      return;
    }
    if (!document.getElementById('reg-waiver').checked) {
      errEl.textContent = 'Debes aceptar la Exención de Responsabilidad.';
      return;
    }

    regStep1Data = {
      fullname: e.target.fullname.value.trim(),
      phone: e.target.phone.value.trim(),
      email: e.target.email.value.trim(),
      address: e.target.address?.value?.trim() || null,
      postal_code: e.target.postal_code?.value?.trim() || null,
      level: e.target.level.value,
      wetsuit_size: e.target.wetsuit_size.value || null,
      can_swim: e.target.can_swim.value === 'true',
      has_injury: e.target.has_injury.value === 'true',
      injury_detail: e.target.injury_detail?.value?.trim() || null,
    };

    document.getElementById('register-step1').style.display = 'none';
    document.getElementById('register-step2').style.display = '';
    document.getElementById('reg2-email').value = regStep1Data.email;
  });

  // Back button
  document.getElementById('reg-back-btn')?.addEventListener('click', () => {
    document.getElementById('register-step2').style.display = 'none';
    document.getElementById('register-step1').style.display = '';
  });

  // Step 2 — create account
  document.getElementById('register-step2').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('register-error-step2');
    const btn = e.target.querySelector('button[type="submit"]');
    errEl.textContent = '';

    const pass = e.target.password.value;
    const pass2 = e.target.password2.value;
    if (pass !== pass2) {
      errEl.textContent = 'Las contraseñas no coinciden.';
      return;
    }

    btn.disabled = true; btn.textContent = 'Creando cuenta…';
    try {
      const result = await signUp(regStep1Data.email, pass, regStep1Data.fullname);
      if (result?.session || result?.user) {
        // Save profile data from step 1
        const now = new Date().toISOString();
        await updateProfile({
          phone: regStep1Data.phone,
          address: regStep1Data.address,
          postal_code: regStep1Data.postal_code,
          level: regStep1Data.level,
          wetsuit_size: regStep1Data.wetsuit_size,
          can_swim: regStep1Data.can_swim,
          has_injury: regStep1Data.has_injury,
          injury_detail: regStep1Data.injury_detail,
          terms_accepted_at: now,
          waiver_accepted_at: now,
        });
        renderDashboard();
      } else {
        errEl.style.color = '#1b5e20';
        errEl.textContent = 'Cuenta creada. Inicia sesión para continuar.';
        btn.disabled = false; btn.textContent = 'Crear cuenta';
      }
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false; btn.textContent = 'Crear cuenta';
    }
  });
}

// ---- Onboarding step (health & equipment, only after register) ----
async function checkOnboardingOrDashboard() {
  const profile = await getProfile();
  if (profile?.role === 'admin') {
    window.location.href = '/admin/';
    return;
  }
  if (profile && profile.can_swim == null) {
    renderOnboarding(profile);
  } else {
    renderDashboard();
  }
}

function renderOnboarding(profile) {
  hideFooter();
  mainEl.innerHTML = `
    <div class="auth-page">
      <div class="auth-page-left">
        <div class="auth-page-form">
          <h1 class="auth-title">Un último paso</h1>
          <p class="auth-subtitle">Necesitamos algunos datos para tu seguridad y comodidad</p>
          <form id="onboarding-form" class="auth-form">
            <div class="auth-field">
              <label for="ob-level">Nivel de surf</label>
              <select id="ob-level" name="level">
                ${levelOptionsHtml(profile?.level || '', true)}
              </select>
            </div>
            <div class="auth-field">
              <label for="ob-swim">¿Sabes nadar?</label>
              <select id="ob-swim" name="can_swim" required>
                <option value="">Seleccionar</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
            <div class="auth-field">
              <label for="ob-injury">¿Tienes alguna lesión?</label>
              <select id="ob-injury" name="has_injury">
                <option value="false">No</option>
                <option value="true">Sí</option>
              </select>
            </div>
            <div class="auth-field" id="ob-injury-wrap" style="display:none">
              <label for="ob-injury-detail">Describe tu lesión</label>
              <input type="text" id="ob-injury-detail" name="injury_detail" placeholder="Ej: rodilla derecha">
            </div>
            <div class="auth-field">
              <label for="ob-wetsuit">Talla de neopreno</label>
              <select id="ob-wetsuit" name="wetsuit_size">
                ${wetsuitOptionsHtml(profile?.wetsuit_size || '')}
              </select>
            </div>
            <p class="auth-error" id="onboarding-error"></p>
            <button type="submit" class="auth-submit-btn">Acceder a mi cuenta</button>
          </form>
          <p class="auth-switch"><a href="#" id="skip-onboarding">Saltar este paso</a></p>
        </div>
      </div>
      <div class="auth-page-right">
        <div class="auth-brand-card">
          <div class="auth-brand-content">
            <p class="auth-brand-tagline">Casi listo</p>
            <h2 class="auth-brand-heading">Tu seguridad es lo primero</h2>
            <p class="auth-brand-desc">Estos datos nos ayudan a preparar tu material y adaptar las clases a ti.</p>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('ob-injury').addEventListener('change', (e) => {
    document.getElementById('ob-injury-wrap').style.display = e.target.value === 'true' ? '' : 'none';
  });

  document.getElementById('skip-onboarding').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await updateProfile({ can_swim: false, has_injury: false });
    } catch {}
    renderDashboard();
  });

  document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('onboarding-error');
    const btn = e.target.querySelector('button[type="submit"]');
    errEl.textContent = '';
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await updateProfile({
        level: e.target.level?.value || null,
        can_swim: e.target.can_swim.value === 'true' ? true : e.target.can_swim.value === 'false' ? false : null,
        has_injury: e.target.has_injury.value === 'true',
        injury_detail: e.target.injury_detail?.value || null,
        wetsuit_size: e.target.wetsuit_size?.value || null,
      });
      renderDashboard();
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false; btn.textContent = 'Acceder a mi cuenta';
    }
  });
}

// ---- SVG Icons ----
const ICONS = {
  datos: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  familia: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  bonos: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  calendario: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  clases: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  pagos: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  pedidos: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>',
  logout: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
};

const TAB_TITLES = {
  datos: { title: 'Mis datos', desc: 'Gestiona tu información personal' },
  familia: { title: 'Mi Familia', desc: 'Añade familiares y acompañantes' },
  bonos: { title: 'Mis Bonos', desc: 'Gestiona tus packs de clases' },
  calendario: { title: 'Reservar Clases', desc: 'Consulta el calendario y reserva' },
  clases: { title: 'Mis Clases', desc: 'Consulta tus reservas de clases' },
  pagos: { title: 'Mis Pagos', desc: 'Historial de pagos de servicios, bonos y compras' },
  pedidos: { title: 'Mis Pedidos', desc: 'Pedidos de productos en la tienda online' },
};

// ---- Dashboard view ----
async function renderDashboard() {
  showFooter();
  const session = await getSession();
  if (!session) return renderAuth();
  const profile = await getProfile();
  const name = profile?.full_name || session.user.email;
  const email = session.user.email;

  const TABS = [
    { key: 'datos', label: 'Mis datos' },
    { key: 'familia', label: 'Mi Familia' },
    { key: 'bonos', label: 'Mis Bonos' },
    { key: 'calendario', label: 'Reservar Clases' },
    { key: 'clases', label: 'Mis Clases' },
    { key: 'pagos', label: 'Mis Pagos' },
    { key: 'pedidos', label: 'Mis Pedidos' },
  ];

  mainEl.innerHTML = `
    <section class="section" style="padding-top:110px"><div class="container">
      <div class="account-dashboard">
        <aside class="account-sidebar">
          <div class="account-avatar">
            <div class="account-avatar-circle">${getInitials(name)}</div>
            <div>
              <div class="account-avatar-name">${esc(name)}</div>
              <div class="account-avatar-email">${esc(email)}</div>
            </div>
          </div>
          <nav class="account-nav">
            ${TABS.map((t, i) => `
              <button class="account-nav-item ${i === 0 ? 'active' : ''}" data-tab="${t.key}">
                ${ICONS[t.key] || ''} ${t.label}
              </button>
            `).join('')}
            <div class="account-nav-divider"></div>
            <button class="account-nav-item danger" data-tab="logout">
              ${ICONS.logout} Cerrar sesión
            </button>
          </nav>
        </aside>
        <div class="account-content">
          <div class="account-content-header" id="account-header">
            <h2>${TAB_TITLES.datos.title}</h2>
            <p>${TAB_TITLES.datos.desc}</p>
          </div>
          <div id="tab-datos" class="tab-panel active"></div>
          <div id="tab-familia" class="tab-panel"></div>
          <div id="tab-bonos" class="tab-panel"></div>
          <div id="tab-calendario" class="tab-panel"></div>
          <div id="tab-clases" class="tab-panel"></div>
          <div id="tab-pagos" class="tab-panel"></div>
          <div id="tab-pedidos" class="tab-panel"></div>
        </div>
      </div>
    </div></section>`;

  const loaded = new Set();

  function switchTab(tabKey) {
    mainEl.querySelectorAll('.account-nav-item').forEach(t => t.classList.remove('active'));
    mainEl.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const navBtn = mainEl.querySelector(`.account-nav-item[data-tab="${tabKey}"]`);
    if (navBtn) navBtn.classList.add('active');
    const tabPanel = document.getElementById('tab-' + tabKey);
    if (tabPanel) tabPanel.classList.add('active');
    // Update header
    const header = document.getElementById('account-header');
    if (header && TAB_TITLES[tabKey]) {
      header.innerHTML = `<h2>${TAB_TITLES[tabKey].title}</h2><p>${TAB_TITLES[tabKey].desc}</p>`;
    }
    loadTab(tabKey);
  }

  async function loadTab(key) {
    if (loaded.has(key)) return;
    loaded.add(key);

    switch (key) {
      case 'datos':
        renderDatos(session, profile);
        break;
      case 'familia':
        await renderFamily(document.getElementById('tab-familia'));
        break;
      case 'bonos':
        await renderBonos(document.getElementById('tab-bonos'), switchTab);
        break;
      case 'calendario':
        await renderCalendar(document.getElementById('tab-calendario'));
        break;
      case 'clases':
        await renderEnrollments(document.getElementById('tab-clases'));
        break;
      case 'pagos':
        await renderPayments(document.getElementById('tab-pagos'));
        break;
      case 'pedidos':
        await renderPedidos(session);
        break;
    }
  }

  mainEl.querySelectorAll('.account-nav-item').forEach(nav => {
    nav.addEventListener('click', async () => {
      if (nav.dataset.tab === 'logout') {
        await signOut();
        renderAuth();
        return;
      }
      switchTab(nav.dataset.tab);
    });
  });

  await loadTab('datos');
}

// ---- Tab: Mis datos ----
function renderDatos(session, profile) {
  const datosPanel = document.getElementById('tab-datos');
  datosPanel.innerHTML = `
    <form id="profile-form">
      <div class="account-form-card">
        <h3>Información personal</h3>
        <div class="account-form-grid">
          <div class="account-field">
            <label for="pf-name">Nombre</label>
            <input type="text" id="pf-name" name="full_name" value="${esc(profile?.full_name)}" />
          </div>
          <div class="account-field">
            <label for="pf-lastname">Apellidos</label>
            <input type="text" id="pf-lastname" name="last_name" value="${esc(profile?.last_name || '')}" />
          </div>
          <div class="account-field">
            <label>Email</label>
            <input type="email" value="${esc(session.user.email)}" disabled />
            <span class="field-hint">El email no se puede cambiar</span>
          </div>
          <div class="account-field">
            <label for="pf-phone">Teléfono</label>
            <input type="tel" id="pf-phone" name="phone" value="${esc(profile?.phone)}" placeholder="+34 600 000 000" />
          </div>
          <div class="account-field">
            <label for="pf-address">Dirección</label>
            <input type="text" id="pf-address" name="address" value="${esc(profile?.address || '')}" placeholder="Calle, número, ciudad" />
          </div>
          <div class="account-field">
            <label for="pf-postal">Código postal</label>
            <input type="text" id="pf-postal" name="postal_code" value="${esc(profile?.postal_code || '')}" placeholder="11149" />
          </div>
        </div>
      </div>

      <div class="account-form-card">
        <h3>Salud y equipamiento</h3>
        <div class="account-form-grid">
          <div class="account-field">
            <label for="pf-level">Nivel de surf</label>
            <select id="pf-level" name="level">
              ${levelOptionsHtml(profile?.level || '', true)}
            </select>
          </div>
          <div class="account-field">
            <label for="pf-swim">¿Sabes nadar?</label>
            <select id="pf-swim" name="can_swim">
              <option value="" ${profile?.can_swim == null ? 'selected' : ''}>Sin definir</option>
              <option value="true" ${profile?.can_swim === true ? 'selected' : ''}>Sí</option>
              <option value="false" ${profile?.can_swim === false ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="account-field">
            <label for="pf-injury">¿Tienes alguna lesión?</label>
            <select id="pf-injury" name="has_injury">
              <option value="false" ${!profile?.has_injury ? 'selected' : ''}>No</option>
              <option value="true" ${profile?.has_injury ? 'selected' : ''}>Sí</option>
            </select>
          </div>
          <div class="account-field" id="pf-injury-wrap" style="${profile?.has_injury ? '' : 'display:none'}">
            <label for="pf-injury-detail">Describe tu lesión</label>
            <input type="text" id="pf-injury-detail" name="injury_detail" value="${esc(profile?.injury_detail)}" placeholder="Ej: rodilla derecha" />
          </div>
          <div class="account-field">
            <label for="pf-wetsuit">Talla de neopreno</label>
            <select id="pf-wetsuit" name="wetsuit_size">
              ${wetsuitOptionsHtml(profile?.wetsuit_size || '')}
            </select>
          </div>
        </div>
      </div>

      <p class="account-msg" id="profile-msg"></p>
      <button type="submit" class="btn red">Guardar cambios</button>
    </form>`;

  document.getElementById('pf-injury')?.addEventListener('change', (e) => {
    document.getElementById('pf-injury-wrap').style.display = e.target.value === 'true' ? '' : 'none';
  });

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('profile-msg');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await updateProfile({
        full_name: e.target.full_name.value,
        last_name: e.target.last_name.value,
        phone: e.target.phone.value,
        address: e.target.address?.value || null,
        postal_code: e.target.postal_code?.value || null,
        level: e.target.level?.value || null,
        can_swim: e.target.can_swim.value === 'true' ? true : e.target.can_swim.value === 'false' ? false : null,
        has_injury: e.target.has_injury.value === 'true',
        injury_detail: e.target.injury_detail?.value || null,
        wetsuit_size: e.target.wetsuit_size?.value || null,
      });
      msg.style.color = '#1b5e20';
      msg.textContent = 'Datos actualizados correctamente.';
    } catch (err) {
      msg.style.color = '#c0392b';
      msg.textContent = err.message;
    }
    btn.disabled = false; btn.textContent = 'Guardar cambios';
  });
}

// ---- Tab: Mis pedidos ----
async function renderPedidos(session) {
  const pedidosPanel = document.getElementById('tab-pedidos');
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (!orders?.length) {
    pedidosPanel.innerHTML = '<div class="account-form-card"><p style="color:var(--color-muted);margin:0">No tienes pedidos todavía.</p></div>';
  } else {
    pedidosPanel.innerHTML = orders.map(o => `
      <div class="order-card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <h4>Pedido #${o.id.slice(0, 8)}</h4>
          ${statusBadge(o.status)}
        </div>
        <p class="meta">${formatDate(o.created_at)} · ${formatPrice(o.total)}</p>
        ${o.items ? `<p style="font-size:.88rem">${o.items.map(i => i.name).join(', ')}</p>` : ''}
      </div>`).join('');
  }
}

// ---- Init ----
async function init() {
  try {
    const session = await getSession();
    if (session) {
      const profile = await getProfile();
      if (profile?.role === 'admin') {
        window.location.href = '/admin/';
        return;
      }
      if (profile && profile.can_swim == null) {
        renderOnboarding(profile);
      } else {
        renderDashboard();
      }
    } else {
      renderAuth();
    }
  } catch (err) {
    console.error('Init error:', err);
    renderAuth();
  }
}

init();
