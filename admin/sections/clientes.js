/* ============================================================
   Clientes Section — Client list + detail ficha
   ============================================================ */
import { fetchProfiles, createClientFromAdmin } from '../modules/api.js';
import { renderTable, statusBadge, formatDate, formatCurrency, openModal, closeModal, showToast } from '../modules/ui.js';
import { supabase } from '/lib/supabase.js';

// ---- API helpers (client-specific) ----

async function fetchClientEnrollments(userId) {
  const { data: enrollments, error } = await supabase
    .from('class_enrollments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchClientEnrollments:', error.message); return []; }
  if (!enrollments?.length) return [];

  const classIds = [...new Set(enrollments.map(e => e.class_id).filter(Boolean))];
  let classesMap = {};
  if (classIds.length) {
    const { data: classes } = await supabase
      .from('surf_classes')
      .select('*')
      .in('id', classIds);
    if (classes) classes.forEach(c => { classesMap[c.id] = c; });
  }

  return enrollments.map(e => ({
    ...e,
    surf_class: classesMap[e.class_id] || null,
  }));
}

async function fetchClientBookings(userId) {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchClientBookings:', error.message); return []; }
  if (!bookings?.length) return [];

  const campIds = [...new Set(bookings.map(b => b.camp_id).filter(Boolean))];
  let campsMap = {};
  if (campIds.length) {
    const { data: camps } = await supabase
      .from('surf_camps')
      .select('id, title')
      .in('id', campIds);
    if (camps) camps.forEach(c => { campsMap[c.id] = c; });
  }

  return bookings.map(b => ({
    ...b,
    camp_title: campsMap[b.camp_id]?.title || null,
  }));
}

async function fetchClientOrders(userId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchClientOrders:', error.message); return []; }
  return data || [];
}

async function fetchClientBonos(userId) {
  const { data, error } = await supabase
    .from('bonos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchClientBonos:', error.message); return []; }
  return data || [];
}

async function fetchClientEquipmentReservations(userId) {
  const { data: reservations, error } = await supabase
    .from('equipment_reservations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchClientEquipmentReservations:', error.message); return []; }
  if (!reservations?.length) return [];

  const equipIds = [...new Set(reservations.map(r => r.equipment_id).filter(Boolean))];
  let equipMap = {};
  if (equipIds.length) {
    const { data: equipment } = await supabase
      .from('rental_equipment')
      .select('id, name, type')
      .in('id', equipIds);
    if (equipment) equipment.forEach(e => { equipMap[e.id] = e; });
  }

  return reservations.map(r => ({
    ...r,
    equipment: equipMap[r.equipment_id] || null,
  }));
}

async function fetchClientFamilyMembers(userId) {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('fetchClientFamilyMembers:', error.message); return []; }
  return data || [];
}

async function createFamilyMemberAdmin(userId, fields) {
  const { data, error } = await supabase
    .from('family_members')
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateFamilyMemberAdmin(id, fields) {
  fields.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('family_members')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteFamilyMemberAdmin(id) {
  const { error } = await supabase.from('family_members').delete().eq('id', id);
  if (error) throw error;
}

// Fetch family member enrollments (classes booked for this family member)
async function fetchFamilyMemberEnrollments(familyMemberId) {
  const { data: enrollments, error } = await supabase
    .from('class_enrollments')
    .select('*')
    .eq('family_member_id', familyMemberId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchFamilyMemberEnrollments:', error.message); return []; }
  if (!enrollments?.length) return [];

  const classIds = [...new Set(enrollments.map(e => e.class_id).filter(Boolean))];
  let classesMap = {};
  if (classIds.length) {
    const { data: classes } = await supabase.from('surf_classes').select('*').in('id', classIds);
    if (classes) classes.forEach(c => { classesMap[c.id] = c; });
  }
  return enrollments.map(e => ({ ...e, surf_class: classesMap[e.class_id] || null }));
}

async function updateProfile(id, updates) {
  updates.updated_at = new Date().toISOString();
  const { error } = await supabase.from('profiles').update(updates).eq('id', id);
  if (error) throw error;
}

async function deleteProfile(id) {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) throw error;
}

const TYPE_LABELS = {
  grupal: 'Grupal', individual: 'Individual', yoga: 'Yoga',
  paddle: 'Paddle Surf', surfskate: 'SurfSkate',
};

const LEVEL_LABELS = {
  principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado',
};

export async function renderClientes(container) {
  let searchTerm = '';
  let debounceTimer = null;
  let selectedClient = null;
  let activeTab = 'datos';

  // Cache for auth emails (keyed by user ID)
  const emailCache = {};

  // ===================== LIST VIEW =====================
  async function renderList() {
    selectedClient = null;
    const profiles = await fetchProfiles(searchTerm || undefined);

    // Batch-fetch emails for all listed profiles
    for (const p of profiles) {
      if (emailCache[p.id] === undefined) {
        emailCache[p.id] = await getAuthEmail(p.id);
      }
      p._email = emailCache[p.id];
    }

    const toolbar = `
      <div class="admin-toolbar">
        <input type="text" class="admin-search" id="clientes-search"
               placeholder="Buscar por nombre…" value="${searchTerm}" />
        <button class="btn red" id="new-client-btn">+ Nuevo Cliente</button>
      </div>`;

    const table = renderTable(
      [
        { label: 'Nombre', key: 'full_name' },
        { label: 'Email', render: r => r._email || '—' },
        { label: 'Teléfono', render: r => r.phone || '—' },
        { label: 'Rol', render: r => statusBadge(r.role) },
        { label: 'Registrado', render: r => formatDate(r.created_at) }
      ],
      profiles,
      (row) => `
        <button class="admin-action-btn" data-id="${row.id}" data-action="email" title="Enviar email">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </button>
        <button class="admin-action-btn danger" data-id="${row.id}" data-action="delete" title="Eliminar cliente">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      `
    );

    container.innerHTML = toolbar + table;

    // Search
    const searchInput = container.querySelector('#clientes-search');
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchTerm = e.target.value.trim();
        renderList();
      }, 350);
    });
    if (searchTerm) {
      searchInput.focus();
      searchInput.setSelectionRange(searchTerm.length, searchTerm.length);
    }

    // New client
    container.querySelector('#new-client-btn').addEventListener('click', () => openNewClientModal());

    // Row click → open ficha
    container.querySelectorAll('tbody tr').forEach((row, idx) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', (e) => {
        if (e.target.closest('.admin-action-btn')) return;
        selectedClient = profiles[idx];
        activeTab = 'datos';
        renderDetail();
      });
    });

    // Email action
    container.querySelectorAll('[data-action="email"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const client = profiles.find(p => p.id === btn.dataset.id);
        if (client?._email) {
          window.open(`mailto:${client._email}`, '_blank');
        } else {
          showToast('No se pudo obtener el email de este cliente', 'error');
        }
      });
    });

    // Delete action
    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const client = profiles.find(p => p.id === btn.dataset.id);
        if (!confirm(`¿Eliminar a "${client?.full_name || 'este cliente'}"? Esta acción no se puede deshacer.`)) return;
        try {
          await deleteProfile(btn.dataset.id);
          showToast('Cliente eliminado', 'success');
          renderList();
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }
      });
    });
  }

  // ---- Helper: get email from auth (best-effort) ----
  async function getAuthEmail(userId) {
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      return data?.user?.email || null;
    } catch {
      return null;
    }
  }

  // ===================== NEW CLIENT MODAL =====================
  function openNewClientModal() {
    openModal('Nuevo Cliente', `
      <form id="new-client-form" class="trip-form">
        <label>Nombre completo</label>
        <input type="text" name="full_name" required />
        <label>Email</label>
        <input type="email" name="email" required />
        <label>Teléfono</label>
        <input type="tel" name="phone" />
        <button type="submit" class="btn red" style="margin-top:12px">Crear Cliente</button>
      </form>
    `);
    document.getElementById('new-client-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await createClientFromAdmin(Object.fromEntries(fd));
        closeModal();
        showToast('Cliente creado', 'success');
        renderList();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  // ===================== DETAIL VIEW =====================
  async function renderDetail() {
    const c = selectedClient;
    if (!c) return renderList();

    // Try to fetch auth email (best-effort, cached on client object)
    if (c._email === undefined) {
      c._email = await getAuthEmail(c.id);
      if (c._email) emailCache[c.id] = c._email;
    }

    const TABS = [
      { group: 'CONTENIDO', items: [
        { id: 'datos', label: 'Datos personales', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' },
        { id: 'familia', label: 'Familia', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
        { id: 'clases', label: 'Historial clases', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
        { id: 'bonos', label: 'Bonos', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' },
      ]},
      { group: 'COMERCIAL', items: [
        { id: 'reservas', label: 'Reservas', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
        { id: 'alquileres', label: 'Alquileres', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 00-8 0v2"/></svg>' },
        { id: 'pedidos', label: 'Pedidos', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>' },
      ]},
    ];

    // Build tab content (datos is sync, rest are async-loaded)
    let tabContent = '';
    if (activeTab === 'datos') {
      tabContent = renderDatosTab(c);
    } else {
      tabContent = '<div class="act-form-card"><p style="color:var(--color-muted)">Cargando…</p></div>';
    }

    container.innerHTML = `
      <div class="act-detail-page">
        <div class="act-detail-topbar">
          <button class="act-back-btn" id="cli-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="act-detail-topbar-info">
            <strong class="act-detail-topbar-name">${esc(c.full_name) || 'Sin nombre'}</strong>
            <div class="act-detail-topbar-meta">
              <span class="act-status-badge ${c.role === 'admin' ? 'active' : ''}">${c.role === 'admin' ? 'Admin' : 'Cliente'}</span>
              <span class="act-detail-topbar-id">Clientes · ${c.id.substring(0, 20)}</span>
            </div>
          </div>
        </div>

        <div class="act-detail-layout">
          <nav class="act-detail-sidebar">
            ${TABS.map(group => `
              <div class="act-nav-group-label">${group.group}</div>
              ${group.items.map(tab => `
                <a class="act-nav-item ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
                  ${tab.icon} ${tab.label}
                </a>
              `).join('')}
            `).join('')}
          </nav>

          <main class="act-detail-main" id="cli-tab-content">
            ${tabContent}
          </main>

          <aside class="act-detail-actions">
            <button class="act-action-btn primary" id="cli-save">
              <span>Guardar</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            </button>
            ${c._email ? `
            <button class="act-action-link" id="cli-email">
              <span>Enviar email</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </button>` : ''}
            <button class="act-action-link danger" id="cli-delete">
              <span>Eliminar</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>

            <div class="cli-other-details">
              <div class="act-nav-group-label" style="margin-top:20px">OTROS DETALLES</div>
              <p class="cli-detail-note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                Registrado el ${formatDate(c.created_at)}
              </p>
              ${c._email ? `<p class="cli-detail-note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                ${esc(c._email)}
              </p>` : ''}
            </div>
          </aside>
        </div>
      </div>`;

    // ---- Bind events ----
    container.querySelector('#cli-back').addEventListener('click', () => renderList());

    container.querySelectorAll('.act-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        activeTab = item.dataset.tab;
        renderDetail();
      });
    });

    container.querySelector('#cli-save')?.addEventListener('click', () => saveClientData(c));
    container.querySelector('#cli-email')?.addEventListener('click', () => {
      if (c._email) window.open(`mailto:${c._email}`, '_blank');
    });
    container.querySelector('#cli-delete')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar a "${c.full_name || 'este cliente'}"? Esta acción no se puede deshacer.`)) return;
      try {
        await deleteProfile(c.id);
        showToast('Cliente eliminado', 'success');
        renderList();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });

    // Load async tab content
    if (activeTab === 'familia') loadFamiliaTab(c);
    else if (activeTab === 'clases') loadClasesTab(c);
    else if (activeTab === 'bonos') loadBonosTab(c);
    else if (activeTab === 'reservas') loadReservasTab(c);
    else if (activeTab === 'alquileres') loadAlquileresTab(c);
    else if (activeTab === 'pedidos') loadPedidosTab(c);
  }

  // ===================== TABS =====================

  function renderDatosTab(c) {
    return `
      <h3 class="act-detail-section-title">Datos personales</h3>
      <div class="act-form-card">
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">NOMBRE COMPLETO</label>
            <input type="text" class="act-form-input" id="cli-fullname" value="${esc(c.full_name)}" />
          </div>
        </div>
        ${c._email ? `
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">EMAIL</label>
            <input type="email" class="act-form-input" value="${esc(c._email)}" readonly style="background:#f9fafb;color:var(--color-muted);cursor:default" />
            <small class="act-form-hint">El email está vinculado a la cuenta de autenticación y no se puede modificar aquí.</small>
          </div>
        </div>` : ''}
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">TELÉFONO</label>
            <input type="tel" class="act-form-input" id="cli-phone" value="${esc(c.phone)}" placeholder="+34 600 000 000" />
          </div>
          <div class="act-form-field">
            <label class="act-form-label">ROL</label>
            <select class="act-form-input" id="cli-role" style="cursor:pointer">
              <option value="client" ${c.role === 'client' ? 'selected' : ''}>Cliente</option>
              <option value="admin" ${c.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
          </div>
        </div>
      </div>

      <h3 class="act-detail-section-title" style="margin-top:24px">Dirección</h3>
      <div class="act-form-card">
        <div class="cli-form-row">
          <div class="act-form-field" style="flex:2">
            <label class="act-form-label">DIRECCIÓN</label>
            <input type="text" class="act-form-input" id="cli-address" value="${esc(c.address)}" placeholder="Calle, número, piso…" />
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">CIUDAD</label>
            <input type="text" class="act-form-input" id="cli-city" value="${esc(c.city)}" placeholder="Roche, Cádiz" />
          </div>
          <div class="act-form-field">
            <label class="act-form-label">CÓDIGO POSTAL</label>
            <input type="text" class="act-form-input" id="cli-postal" value="${esc(c.postal_code)}" placeholder="11149" />
          </div>
        </div>
      </div>`;
  }

  // ===================== FAMILIA TAB =====================
  async function loadFamiliaTab(c) {
    const el = container.querySelector('#cli-tab-content');
    try {
      const members = await fetchClientFamilyMembers(c.id);

      let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <h3 class="act-detail-section-title" style="margin:0">Familia (${members.length})</h3>
          <button class="btn red" id="cli-add-family" style="font-size:.82rem;padding:6px 14px">+ Añadir miembro</button>
        </div>`;

      if (members.length) {
        html += `<div class="cli-family-grid">`;
        for (const m of members) {
          const age = m.birth_date ? calcAge(m.birth_date) : null;
          html += `
            <div class="cli-family-card" data-member-id="${m.id}">
              <div class="cli-family-card-header">
                <div class="cli-family-avatar">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <strong class="cli-family-name">${esc(m.full_name)}</strong>
                  <div class="cli-family-meta">
                    ${age !== null ? `<span>${age} años</span>` : ''}
                    ${m.level ? `<span class="cli-family-level">${LEVEL_LABELS[m.level] || m.level}</span>` : ''}
                  </div>
                </div>
              </div>
              <div class="cli-family-card-body">
                ${m.birth_date ? `<div class="cli-family-field"><span class="cli-family-field-label">Nacimiento</span><span>${formatDate(m.birth_date)}</span></div>` : ''}
                ${m.level ? `<div class="cli-family-field"><span class="cli-family-field-label">Nivel</span><span>${LEVEL_LABELS[m.level] || m.level}</span></div>` : ''}
                ${m.notes ? `<div class="cli-family-field"><span class="cli-family-field-label">Notas</span><span>${esc(m.notes)}</span></div>` : ''}
              </div>
              <div class="cli-family-card-actions">
                <button class="btn line" data-action="view-member" data-id="${m.id}" style="font-size:.78rem;padding:5px 10px">Ver ficha</button>
                <button class="btn line" data-action="edit-member" data-id="${m.id}" style="font-size:.78rem;padding:5px 10px">Editar</button>
                <button class="btn line" data-action="delete-member" data-id="${m.id}" style="font-size:.78rem;padding:5px 10px;color:#b91c1c;border-color:#b91c1c">Eliminar</button>
              </div>
            </div>`;
        }
        html += `</div>`;
      } else {
        html += `<div class="act-form-card">
          <div class="admin-empty">
            <p>Este cliente no tiene miembros familiares registrados.</p>
            <p style="font-size:.85rem;color:var(--color-muted);margin-top:4px">Los hijos y acompañantes se pueden añadir aquí o desde la cuenta del cliente.</p>
          </div>
        </div>`;
      }

      el.innerHTML = html;

      // Add member
      el.querySelector('#cli-add-family')?.addEventListener('click', () => openFamilyMemberModal(c.id, null));

      // Edit member
      el.querySelectorAll('[data-action="edit-member"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const m = members.find(x => x.id === btn.dataset.id);
          if (m) openFamilyMemberModal(c.id, m);
        });
      });

      // View member ficha
      el.querySelectorAll('[data-action="view-member"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const m = members.find(x => x.id === btn.dataset.id);
          if (m) openMemberFicha(c, m);
        });
      });

      // Delete member
      el.querySelectorAll('[data-action="delete-member"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const m = members.find(x => x.id === btn.dataset.id);
          if (!confirm(`¿Eliminar a "${m?.full_name || 'este miembro'}"?`)) return;
          try {
            await deleteFamilyMemberAdmin(btn.dataset.id);
            showToast('Miembro eliminado', 'success');
            loadFamiliaTab(c);
          } catch (err) {
            showToast('Error: ' + err.message, 'error');
          }
        });
      });

    } catch (err) {
      el.innerHTML = `<div class="act-form-card"><p style="color:#b91c1c">Error cargando familia: ${esc(err.message)}</p></div>`;
    }
  }

  function openFamilyMemberModal(userId, member) {
    const isEdit = !!member;
    openModal(isEdit ? 'Editar miembro' : 'Añadir miembro familiar', `
      <form id="family-member-form" class="trip-form">
        <label>Nombre completo</label>
        <input type="text" name="full_name" value="${esc(member?.full_name)}" required />
        <label>Fecha de nacimiento</label>
        <input type="date" name="birth_date" value="${member?.birth_date || ''}" />
        <label>Nivel</label>
        <select name="level">
          <option value="">Sin definir</option>
          <option value="principiante" ${member?.level === 'principiante' ? 'selected' : ''}>Principiante</option>
          <option value="intermedio" ${member?.level === 'intermedio' ? 'selected' : ''}>Intermedio</option>
          <option value="avanzado" ${member?.level === 'avanzado' ? 'selected' : ''}>Avanzado</option>
        </select>
        <label>Notas</label>
        <input type="text" name="notes" value="${esc(member?.notes)}" placeholder="Alergias, observaciones…" />
        <button type="submit" class="btn red" style="margin-top:12px">${isEdit ? 'Guardar cambios' : 'Añadir miembro'}</button>
      </form>
    `);
    document.getElementById('family-member-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const fields = Object.fromEntries(fd);
      if (!fields.birth_date) fields.birth_date = null;
      if (!fields.level) fields.level = null;
      if (!fields.notes) fields.notes = null;
      try {
        if (isEdit) {
          await updateFamilyMemberAdmin(member.id, fields);
        } else {
          await createFamilyMemberAdmin(userId, fields);
        }
        closeModal();
        showToast(isEdit ? 'Miembro actualizado' : 'Miembro añadido', 'success');
        loadFamiliaTab(selectedClient);
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  }

  // ---- Member ficha (sub-panel inside Familia tab) ----
  async function openMemberFicha(client, member) {
    const el = container.querySelector('#cli-tab-content');
    const age = member.birth_date ? calcAge(member.birth_date) : null;

    // Fetch enrollments for this family member
    let enrollments = [];
    try {
      enrollments = await fetchFamilyMemberEnrollments(member.id);
    } catch {}

    let html = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
        <button class="act-back-btn" id="member-back" style="position:static">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h3 class="act-detail-section-title" style="margin:0">Ficha de ${esc(member.full_name)}</h3>
      </div>

      <div class="act-form-card">
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">NOMBRE COMPLETO</label>
            <input type="text" class="act-form-input" value="${esc(member.full_name)}" readonly style="background:#f9fafb" />
          </div>
          <div class="act-form-field">
            <label class="act-form-label">RELACIÓN CON</label>
            <input type="text" class="act-form-input" value="${esc(client.full_name)} (titular)" readonly style="background:#f9fafb" />
          </div>
        </div>
        <div class="cli-form-row">
          ${member.birth_date ? `<div class="act-form-field">
            <label class="act-form-label">FECHA DE NACIMIENTO</label>
            <input type="text" class="act-form-input" value="${formatDate(member.birth_date)}${age !== null ? ` (${age} años)` : ''}" readonly style="background:#f9fafb" />
          </div>` : ''}
          ${member.level ? `<div class="act-form-field">
            <label class="act-form-label">NIVEL</label>
            <input type="text" class="act-form-input" value="${LEVEL_LABELS[member.level] || member.level}" readonly style="background:#f9fafb" />
          </div>` : ''}
        </div>
        ${member.notes ? `<div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">NOTAS</label>
            <input type="text" class="act-form-input" value="${esc(member.notes)}" readonly style="background:#f9fafb" />
          </div>
        </div>` : ''}
      </div>

      <h3 class="act-detail-section-title" style="margin-top:24px">Historial de clases (${enrollments.length})</h3>`;

    if (enrollments.length) {
      const rows = enrollments.map(e => {
        const cls = e.surf_class || {};
        return `<tr>
          <td>${formatDate(cls.date)}</td>
          <td>${TYPE_LABELS[cls.type] || cls.type || '—'}</td>
          <td>${esc(cls.title) || '—'}</td>
          <td>${cls.time_start?.slice(0, 5) || '—'} — ${cls.time_end?.slice(0, 5) || '—'}</td>
          <td>${statusBadge(e.status || 'confirmed')}</td>
        </tr>`;
      }).join('');

      html += `<div class="act-form-card" style="padding:0;overflow:hidden">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Clase</th><th>Horario</th><th>Estado</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    } else {
      html += `<div class="act-form-card">
        <div class="admin-empty"><p>No tiene clases registradas</p></div>
      </div>`;
    }

    el.innerHTML = html;

    el.querySelector('#member-back')?.addEventListener('click', () => loadFamiliaTab(client));
  }

  function calcAge(birthDate) {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  async function loadClasesTab(c) {
    const el = container.querySelector('#cli-tab-content');
    try {
      const enrollments = await fetchClientEnrollments(c.id);

      if (!enrollments.length) {
        el.innerHTML = `
          <h3 class="act-detail-section-title">Historial de clases</h3>
          <div class="act-form-card">
            <div class="admin-empty"><p>Este cliente no tiene clases registradas</p></div>
          </div>`;
        return;
      }

      const rows = enrollments.map(e => {
        const cls = e.surf_class || {};
        return `<tr>
          <td>${formatDate(cls.date)}</td>
          <td>${TYPE_LABELS[cls.type] || cls.type || '—'}</td>
          <td>${esc(cls.title) || '—'}</td>
          <td>${cls.time_start?.slice(0, 5) || '—'} — ${cls.time_end?.slice(0, 5) || '—'}</td>
          <td>${esc(cls.instructor) || '—'}</td>
          <td>${statusBadge(e.status || 'confirmed')}</td>
        </tr>`;
      }).join('');

      el.innerHTML = `
        <h3 class="act-detail-section-title">Historial de clases (${enrollments.length})</h3>
        <div class="act-form-card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Fecha</th><th>Tipo</th><th>Clase</th><th>Horario</th><th>Instructor</th><th>Estado</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="act-form-card"><p style="color:#b91c1c">Error cargando clases: ${esc(err.message)}</p></div>`;
    }
  }

  async function loadBonosTab(c) {
    const el = container.querySelector('#cli-tab-content');
    try {
      const bonos = await fetchClientBonos(c.id);

      if (!bonos.length) {
        el.innerHTML = `
          <h3 class="act-detail-section-title">Bonos</h3>
          <div class="act-form-card">
            <div class="admin-empty"><p>Este cliente no tiene bonos</p></div>
          </div>`;
        return;
      }

      const cards = bonos.map(b => {
        const remaining = b.total_credits - b.used_credits;
        const pct = b.total_credits > 0 ? Math.round((b.used_credits / b.total_credits) * 100) : 0;
        return `
          <div class="cli-bono-card">
            <div class="cli-bono-header">
              <strong>${TYPE_LABELS[b.class_type] || b.class_type}</strong>
              ${statusBadge(b.status)}
            </div>
            <div class="cli-bono-credits">
              <span>${b.used_credits} / ${b.total_credits} sesiones usadas</span>
              <span class="cli-bono-remaining">${remaining} restantes</span>
            </div>
            <div class="cli-bono-bar">
              <div class="cli-bono-bar-fill" style="width:${pct}%"></div>
            </div>
            <div class="cli-bono-meta">
              <span>Caduca: ${formatDate(b.expires_at)}</span>
              <span>Creado: ${formatDate(b.created_at)}</span>
            </div>
          </div>`;
      }).join('');

      el.innerHTML = `
        <h3 class="act-detail-section-title">Bonos (${bonos.length})</h3>
        <div class="cli-bonos-grid">${cards}</div>`;
    } catch (err) {
      el.innerHTML = `<div class="act-form-card"><p style="color:#b91c1c">Error cargando bonos: ${esc(err.message)}</p></div>`;
    }
  }

  async function loadReservasTab(c) {
    const el = container.querySelector('#cli-tab-content');
    try {
      const bookings = await fetchClientBookings(c.id);

      if (!bookings.length) {
        el.innerHTML = `
          <h3 class="act-detail-section-title">Reservas</h3>
          <div class="act-form-card">
            <div class="admin-empty"><p>Este cliente no tiene reservas</p></div>
          </div>`;
        return;
      }

      const rows = bookings.map(b => `<tr>
        <td>${formatDate(b.created_at)}</td>
        <td>${esc(b.camp_title) || '—'}</td>
        <td>${formatCurrency(b.total_amount)}</td>
        <td>${formatCurrency(b.deposit_amount)}</td>
        <td>${statusBadge(b.status)}</td>
      </tr>`).join('');

      el.innerHTML = `
        <h3 class="act-detail-section-title">Reservas (${bookings.length})</h3>
        <div class="act-form-card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Surf Camp</th><th>Total</th><th>Señal</th><th>Estado</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="act-form-card"><p style="color:#b91c1c">Error cargando reservas: ${esc(err.message)}</p></div>`;
    }
  }

  async function loadAlquileresTab(c) {
    const el = container.querySelector('#cli-tab-content');
    try {
      const rentals = await fetchClientEquipmentReservations(c.id);

      if (!rentals.length) {
        el.innerHTML = `
          <h3 class="act-detail-section-title">Alquileres de Material</h3>
          <div class="act-form-card">
            <div class="admin-empty"><p>Este cliente no tiene alquileres registrados</p></div>
          </div>`;
        return;
      }

      const statusLabels = {
        pending: 'Pendiente', confirmed: 'Confirmado', active: 'Activo',
        returned: 'Devuelto', cancelled: 'Cancelado',
      };

      const rows = rentals.map(r => `<tr>
        <td>${esc(r.equipment?.name || '—')}</td>
        <td>${formatDate(r.date_start)} — ${formatDate(r.date_end)}</td>
        <td>${r.size || '—'}</td>
        <td>${r.duration_key || '—'}</td>
        <td>${formatCurrency(r.total_amount)}</td>
        <td>${formatCurrency(r.deposit_paid)}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>`).join('');

      el.innerHTML = `
        <h3 class="act-detail-section-title">Alquileres de Material (${rentals.length})</h3>
        <div class="act-form-card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Material</th><th>Periodo</th><th>Talla</th><th>Duración</th><th>Total</th><th>Señal</th><th>Estado</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="act-form-card"><p style="color:#b91c1c">Error cargando alquileres: ${esc(err.message)}</p></div>`;
    }
  }

  async function loadPedidosTab(c) {
    const el = container.querySelector('#cli-tab-content');
    try {
      const orders = await fetchClientOrders(c.id);

      if (!orders.length) {
        el.innerHTML = `
          <h3 class="act-detail-section-title">Pedidos</h3>
          <div class="act-form-card">
            <div class="admin-empty"><p>Este cliente no tiene pedidos</p></div>
          </div>`;
        return;
      }

      const rows = orders.map(o => `<tr>
        <td>${formatDate(o.created_at)}</td>
        <td>${formatCurrency(o.total)}</td>
        <td>${esc(o.shipping_address) || '—'}</td>
        <td>${statusBadge(o.status)}</td>
      </tr>`).join('');

      el.innerHTML = `
        <h3 class="act-detail-section-title">Pedidos (${orders.length})</h3>
        <div class="act-form-card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Total</th><th>Dirección</th><th>Estado</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="act-form-card"><p style="color:#b91c1c">Error cargando pedidos: ${esc(err.message)}</p></div>`;
    }
  }

  // ===================== SAVE =====================
  async function saveClientData(c) {
    const fullnameEl = container.querySelector('#cli-fullname');
    const phoneEl = container.querySelector('#cli-phone');
    const roleEl = container.querySelector('#cli-role');
    const addressEl = container.querySelector('#cli-address');
    const cityEl = container.querySelector('#cli-city');
    const postalEl = container.querySelector('#cli-postal');

    if (!fullnameEl) {
      showToast('Ve a la pestaña "Datos personales" para editar', 'error');
      return;
    }

    const fullname = fullnameEl.value.trim();
    const phone = phoneEl?.value?.trim() || null;
    const role = roleEl?.value || 'client';
    const address = addressEl?.value?.trim() || null;
    const city = cityEl?.value?.trim() || null;
    const postal_code = postalEl?.value?.trim() || null;

    if (!fullname) {
      showToast('El nombre es obligatorio', 'error');
      return;
    }

    try {
      await updateProfile(c.id, {
        full_name: fullname,
        phone: phone,
        role: role,
        address: address,
        city: city,
        postal_code: postal_code,
      });
      // Update local copy
      c.full_name = fullname;
      c.phone = phone;
      c.role = role;
      c.address = address;
      c.city = city;
      c.postal_code = postal_code;
      showToast('Cliente actualizado', 'success');
      renderDetail();
    } catch (err) {
      showToast('Error al guardar: ' + err.message, 'error');
    }
  }

  // ===================== HELPERS =====================
  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  await renderList();
}
