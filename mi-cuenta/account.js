import { getSession, getProfile, signIn, signUp, signOut, updateProfile } from '/lib/auth-client.js';
import { supabase } from '/lib/supabase.js';
import { renderFamily } from '/mi-cuenta/tabs/family.js';
import { renderBonos } from '/mi-cuenta/tabs/bonos.js';
import { renderCalendar } from '/mi-cuenta/tabs/calendar.js';
import { renderEnrollments } from '/mi-cuenta/tabs/enrollments.js';
import { renderPayments } from '/mi-cuenta/tabs/payments.js';

const mainEl = document.querySelector('main');

function formatPrice(n) {
  return Number(n).toFixed(2).replace('.', ',') + '€';
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(status) {
  return `<span class="status-badge ${status || 'pending'}">${status || 'pendiente'}</span>`;
}

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ---- Auth view (login + register) ----
function renderAuth() {
  mainEl.innerHTML = `
    <section class="section" style="padding-top:120px"><div class="container">
      <div class="page-intro center"><p class="kicker">Mi cuenta</p><h1 class="title">Accede a tu cuenta</h1></div>
      <div class="auth-cards">
        <div class="auth-card">
          <h2>Iniciar sesión</h2>
          <form id="login-form">
            <label>Email <input type="email" name="email" required></label>
            <label>Contraseña <input type="password" name="password" required></label>
            <p class="auth-error" id="login-error"></p>
            <button type="submit" class="btn red" style="width:100%">Entrar</button>
          </form>
        </div>
        <div class="auth-card">
          <h2>Crear cuenta</h2>
          <form id="register-form">
            <label>Nombre completo <input type="text" name="fullname" required></label>
            <label>Email <input type="email" name="email" required></label>
            <label>Contraseña <input type="password" name="password" required minlength="6"></label>
            <label>¿Sabes nadar?
              <select name="can_swim" required>
                <option value="">Seleccionar</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </label>
            <label>¿Tienes alguna lesión?
              <select name="has_injury" id="reg-injury-select">
                <option value="false">No</option>
                <option value="true">Sí</option>
              </select>
            </label>
            <label id="reg-injury-detail-wrap" style="display:none">Describe tu lesión
              <input type="text" name="injury_detail" placeholder="Ej: rodilla derecha">
            </label>
            <label>Talla de neopreno
              <select name="wetsuit_size">
                <option value="">Sin definir</option>
                <option value="6 años">6 años</option>
                <option value="8 años">8 años</option>
                <option value="10 años">10 años</option>
                <option value="12 años">12 años</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
              </select>
            </label>
            <p class="auth-error" id="register-error"></p>
            <button type="submit" class="btn red" style="width:100%">Registrarse</button>
          </form>
        </div>
      </div>
    </div></section>`;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    try {
      await signIn(e.target.email.value, e.target.password.value);
      renderDashboard();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  document.getElementById('reg-injury-select')?.addEventListener('change', (e) => {
    document.getElementById('reg-injury-detail-wrap').style.display = e.target.value === 'true' ? '' : 'none';
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('register-error');
    errEl.textContent = '';
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Creando cuenta…';
    try {
      const result = await signUp(e.target.email.value, e.target.password.value, e.target.fullname.value, { can_swim: e.target.can_swim.value === 'true', has_injury: e.target.has_injury.value === 'true', injury_detail: e.target.injury_detail?.value || null, wetsuit_size: e.target.wetsuit_size?.value || null });
      if (result?.session || result?.user) {
        renderDashboard();
      } else {
        errEl.style.color = '#1b5e20';
        errEl.textContent = 'Cuenta creada. Inicia sesión para continuar.';
        btn.disabled = false; btn.textContent = 'Registrarse';
      }
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false; btn.textContent = 'Registrarse';
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
  pagos: { title: 'Mis Pagos', desc: 'Historial de pagos y saldo a favor' },
  pedidos: { title: 'Mis Pedidos', desc: 'Historial de compras en la tienda' },
};

// ---- Dashboard view ----
async function renderDashboard() {
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
  const WETSUIT_SIZES = ['6 años','8 años','10 años','12 años','XS','S','M','L','XL'];
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
        </div>
      </div>

      <div class="account-form-card">
        <h3>Salud y equipamiento</h3>
        <div class="account-form-grid">
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
              <option value="">Sin definir</option>
              ${WETSUIT_SIZES.map(s => `<option value="${s}" ${profile?.wetsuit_size === s ? 'selected' : ''}>${s}</option>`).join('')}
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
  const session = await getSession();
  if (session) {
    const profile = await getProfile();
    if (profile?.role === 'admin') {
      window.location.href = '/admin/';
      return;
    }
    renderDashboard();
  } else {
    renderAuth();
  }
}

init();
