import { getSession, getProfile, signIn, signUp, signOut, updateProfile } from '/lib/auth-client.js';
import { supabase } from '/lib/supabase.js';
import { renderFamily } from '/mi-cuenta/tabs/family.js';
import { renderBonos } from '/mi-cuenta/tabs/bonos.js';
import { renderCalendar } from '/mi-cuenta/tabs/calendar.js';
import { renderEnrollments } from '/mi-cuenta/tabs/enrollments.js';

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

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('register-error');
    errEl.textContent = '';
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Creando cuenta…';
    try {
      const result = await signUp(e.target.email.value, e.target.password.value, e.target.fullname.value);
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

// ---- Dashboard view ----
async function renderDashboard() {
  const session = await getSession();
  if (!session) return renderAuth();
  const profile = await getProfile();
  const name = profile?.full_name || session.user.email;

  const TABS = [
    { key: 'datos', label: 'Mis datos' },
    { key: 'familia', label: 'Mi Familia' },
    { key: 'bonos', label: 'Mis Bonos' },
    { key: 'calendario', label: 'Reservar Clases' },
    { key: 'clases', label: 'Mis Clases' },
    { key: 'pedidos', label: 'Mis Pedidos' },
    { key: 'logout', label: 'Cerrar sesión' },
  ];

  mainEl.innerHTML = `
    <section class="section" style="padding-top:120px"><div class="container">
      <div class="page-intro"><p class="kicker">Mi cuenta</p><h1 class="title">Hola, ${name}</h1></div>
      <div class="account-tabs">
        ${TABS.map((t, i) => `<button class="account-tab ${i === 0 ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>
      <div id="tab-datos" class="tab-panel active"></div>
      <div id="tab-familia" class="tab-panel"></div>
      <div id="tab-bonos" class="tab-panel"></div>
      <div id="tab-calendario" class="tab-panel"></div>
      <div id="tab-clases" class="tab-panel"></div>
      <div id="tab-pedidos" class="tab-panel"></div>
    </div></section>`;

  // Track which tabs have been loaded
  const loaded = new Set();

  function switchTab(tabKey) {
    mainEl.querySelectorAll('.account-tab').forEach(t => t.classList.remove('active'));
    mainEl.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const tabBtn = mainEl.querySelector(`.account-tab[data-tab="${tabKey}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    const tabPanel = document.getElementById('tab-' + tabKey);
    if (tabPanel) tabPanel.classList.add('active');
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
      case 'pedidos':
        await renderPedidos(session);
        break;
    }
  }

  // Tabs
  mainEl.querySelectorAll('.account-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      if (tab.dataset.tab === 'logout') {
        await signOut();
        renderAuth();
        return;
      }
      switchTab(tab.dataset.tab);
    });
  });

  // Load default tab
  await loadTab('datos');
}

// ---- Tab: Mis datos ----
function renderDatos(session, profile) {
  const datosPanel = document.getElementById('tab-datos');
  datosPanel.innerHTML = `
    <form id="profile-form" class="checkout-form" style="max-width:480px">
      <label>Nombre completo <input type="text" name="full_name" value="${profile?.full_name || ''}"></label>
      <label>Email <input type="email" value="${session.user.email}" disabled></label>
      <label>Teléfono <input type="tel" name="phone" value="${profile?.phone || ''}"></label>
      <p class="auth-error" id="profile-msg"></p>
      <button type="submit" class="btn red">Guardar cambios</button>
    </form>`;

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('profile-msg');
    try {
      await updateProfile({
        full_name: e.target.full_name.value,
        phone: e.target.phone.value,
      });
      msg.style.color = '#1b5e20';
      msg.textContent = 'Datos actualizados.';
    } catch (err) {
      msg.style.color = '#c0392b';
      msg.textContent = err.message;
    }
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
    pedidosPanel.innerHTML = '<p style="color:var(--color-muted)">No tienes pedidos todavía.</p>';
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
