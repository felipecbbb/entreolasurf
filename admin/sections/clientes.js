/* ============================================================
   Clientes Section — Client list + detail ficha
   ============================================================ */
import { fetchProfiles, createClientFromAdmin, createPayment, deletePayment, fetchPayments, deleteEnrollment, updateEnrollmentStatus, updateEquipmentReservationStatus, fetchClientsPending } from '../modules/api.js';
import { renderTable, statusBadge, formatDate, formatCurrency, openModal, closeModal, showToast } from '../modules/ui.js';
import { supabase } from '/lib/supabase.js';
import { PACK_PRICING, DEPOSIT } from '../modules/constants.js';
import { wetsuitOptionsHtml } from '/lib/shared-constants.js';
import { openPaymentEditModal } from '../modules/payment-edit.js';

// Recalcula el estado/importe pagado de una entidad desde la suma real de sus
// pagos (payments = única verdad). Se usa tras crear/borrar un pago.
async function recalcPaymentState(type, refId) {
  if (!refId) return;
  const sumPays = async () => {
    const { data } = await supabase.from('payments').select('amount')
      .eq('reservation_type', type).eq('reference_id', refId);
    return (data || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  };
  if (type === 'bono') {
    await supabase.from('bonos').update({ total_paid: await sumPays(), updated_at: new Date().toISOString() }).eq('id', refId);
  } else if (type === 'rental') {
    await supabase.from('equipment_reservations').update({ deposit_paid: await sumPays(), updated_at: new Date().toISOString() }).eq('id', refId);
  } else if (type === 'booking') {
    const sum = await sumPays();
    const { data: bk } = await supabase.from('bookings').select('total_amount').eq('id', refId).single();
    const total = Number(bk?.total_amount || 0);
    const status = sum <= 0 ? 'pending' : (total > 0 && sum >= total ? 'fully_paid' : 'deposit_paid');
    await supabase.from('bookings').update({ deposit_amount: sum, status, updated_at: new Date().toISOString() }).eq('id', refId);
  } else if (type === 'enrollment') {
    const sum = await sumPays();
    const { data: enr } = await supabase.from('class_enrollments').select('status, surf_classes:class_id(price)').eq('id', refId).single();
    if (enr && enr.status !== 'cancelled') {
      const price = Number(enr.surf_classes?.price || 0);
      const status = sum <= 0 ? 'confirmed' : (price > 0 && sum >= price ? 'paid' : 'partial');
      await supabase.from('class_enrollments').update({ status, updated_at: new Date().toISOString() }).eq('id', refId);
    }
  }
}

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
  // Solo pedidos de TIENDA reales: pagados y con productos (order_items).
  // Excluye checkouts abandonados (pending) y órdenes que en realidad eran
  // señal de surf camp o bono de clases (sin order_items) — caso Maite/Adrián.
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items!inner(id)')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchClientOrders:', error.message); return []; }
  // Dedup (el inner join puede repetir la orden por cada item)
  const seen = new Set();
  return (data || []).filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
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

async function fetchClientPayments(userId) {
  // Fetch all payments across enrollments + rentals for this user via RPC
  const { data, error } = await supabase.rpc('get_user_payments', { p_user_id: userId });
  if (error) { console.warn('fetchClientPayments:', error.message); return []; }
  return data || [];
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
  const { error } = await supabase.rpc('delete_user', { p_user_id: id });
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
  let activeFilter = ''; // '', 'pending_pay', 'pending_assign', 'paid', 'cancelled'
  let debounceTimer = null;
  let selectedClient = null;
  let activeTab = 'datos';

  // Cache for auth emails (keyed by user ID)
  const emailCache = {};

  // ===================== LIST VIEW =====================
  async function renderList() {
    selectedClient = null;
    // Solo clientes: los instructores (admin/encargado) se gestionan en Equipo
    const allProfiles = await fetchProfiles(searchTerm || undefined);
    const profiles = allProfiles.filter(p => p.role !== 'admin' && p.role !== 'encargado');

    // Batch-fetch emails, family members, and enrollments for all listed profiles
    const profileIds = profiles.map(p => p.id);
    const [, familyRes, enrollRes] = await Promise.all([
      (async () => {
        for (const p of profiles) {
          if (emailCache[p.id] === undefined) {
            emailCache[p.id] = await getAuthEmail(p.id);
          }
          p._email = emailCache[p.id];
        }
      })(),
      profileIds.length
        ? supabase.from('family_members').select('id, user_id, full_name, last_name').in('user_id', profileIds).order('created_at', { ascending: true })
        : { data: [] },
      profileIds.length
        ? supabase.from('class_enrollments').select('id, user_id, status, class_id').in('user_id', profileIds)
        : { data: [] },
    ]);
    const allFamilyMembers = familyRes.data || [];
    const allEnrollments = enrollRes.data || [];
    for (const p of profiles) {
      p._family = allFamilyMembers.filter(m => m.user_id === p.id);
      p._enrollments = allEnrollments.filter(e => e.user_id === p.id);
    }

    // Para el filtro de pago pendiente, calcula cuánto y qué debe cada cliente
    if (activeFilter === 'pending_pay') {
      let pendingMap = {};
      try { pendingMap = await fetchClientsPending(); } catch (err) { console.warn('pending map:', err.message); }
      for (const p of profiles) p._pending = pendingMap[p.id] || null;
    }

    // Apply filter
    let filtered = profiles;
    if (activeFilter === 'pending_pay') {
      filtered = profiles.filter(p => p._pending && p._pending.total > 0);
    } else if (activeFilter === 'pending_assign') {
      filtered = profiles.filter(p => p._enrollments.some(e => !e.class_id));
    } else if (activeFilter === 'paid') {
      filtered = profiles.filter(p => p._enrollments.some(e => e.status === 'paid'));
    } else if (activeFilter === 'cancelled') {
      filtered = profiles.filter(p => p._enrollments.some(e => e.status === 'cancelled'));
    }

    const filterBtn = (key, label, icon) => `<button class="cli-filter-btn ${activeFilter === key ? 'active' : ''}" data-filter="${key}">${icon} ${label}</button>`;
    const toolbar = `
      <div class="admin-toolbar">
        <input type="text" class="admin-search" id="clientes-search"
               placeholder="Buscar por nombre…" value="${searchTerm}" />
        <button class="btn red" id="new-client-btn">+ Nuevo Cliente</button>
      </div>
      <div class="cli-filters">
        ${filterBtn('', 'Todos', '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>')}
        ${filterBtn('pending_pay', 'Pago pendiente', '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>')}
        ${filterBtn('pending_assign', 'Sin asignar', '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>')}
        ${filterBtn('paid', 'Pagado', '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/></svg>')}
        ${filterBtn('cancelled', 'Canceladas', '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>')}
      </div>`;

    const listHtml = !filtered.length
      ? '<div class="admin-empty"><p>No hay clientes</p></div>'
      : `<div class="cli-list">${filtered.map(r => {
        const fullName = esc(r.full_name) + (r.last_name ? ' ' + esc(r.last_name) : '');
        const familyHtml = (r._family || []).map(m =>
          `<div class="cli-family-tag" data-client-id="${r.id}" data-member-id="${m.id}">` +
            `<div class="cli-family-tag-left">` +
              `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>` +
              `<span>${esc(m.full_name)}${m.last_name ? ' ' + esc(m.last_name) : ''}</span>` +
            `</div>` +
            `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>` +
          `</div>`
        ).join('');

        return `<div class="cli-list-card" data-id="${r.id}">
          <div class="cli-list-card-main">
            <div class="cli-list-avatar" style="background:${r.role === 'admin' ? '#0f2f39' : '#0ea5e9'}">${(r.full_name || '?')[0].toUpperCase()}</div>
            <div class="cli-list-info">
              <div class="cli-list-name">${fullName}</div>
              <div class="cli-list-meta">
                ${r._email ? `<span>${esc(r._email)}</span>` : ''}
                ${r.phone ? `<span>${esc(r.phone)}</span>` : ''}
              </div>
            </div>
            <div class="cli-list-right">
              <span class="act-status-badge ${r.role === 'admin' ? 'active' : ''}" style="font-size:.68rem">${r.role === 'admin' ? 'Admin' : 'Cliente'}</span>
              <div class="cli-list-actions">
                <button class="admin-action-btn" data-id="${r.id}" data-action="email" title="Enviar email">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </button>
                <button class="admin-action-btn danger" data-id="${r.id}" data-action="delete" title="Eliminar cliente">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
              </div>
            </div>
          </div>
          ${activeFilter === 'pending_pay' && r._pending ? `
            <div class="cli-pending-box">
              <div class="cli-pending-head"><span>Pendiente de pago</span><strong>${formatCurrency(r._pending.total)}</strong></div>
              ${r._pending.items.map(it => `<div class="cli-pending-item"><span>${esc(it.concept)}</span><span>${formatCurrency(it.pending)}</span></div>`).join('')}
            </div>` : ''}
          ${familyHtml ? `<div class="cli-list-family">${familyHtml}</div>` : ''}
        </div>`;
      }).join('')}</div>`;

    container.innerHTML = toolbar + listHtml;

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

    // Filter buttons
    container.querySelectorAll('.cli-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.filter;
        renderList();
      });
    });

    // New client
    container.querySelector('#new-client-btn').addEventListener('click', () => openNewClientModal());

    // Family member tag click → open client detail then member ficha
    container.querySelectorAll('.cli-family-tag').forEach(tag => {
      tag.addEventListener('click', async (e) => {
        e.stopPropagation();
        const clientId = tag.dataset.clientId;
        const memberId = tag.dataset.memberId;
        const client = profiles.find(p => p.id === clientId);
        if (!client) return;
        // Enter detail view first so #cli-tab-content exists
        selectedClient = client;
        activeTab = 'familia';
        await renderDetail();
        // Now fetch and open member ficha
        const members = await fetchClientFamilyMembers(clientId);
        const member = members.find(m => m.id === memberId);
        if (member) openMemberFicha(client, member);
      });
    });

    // Card click → open client ficha
    container.querySelectorAll('.cli-list-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.admin-action-btn') || e.target.closest('.cli-family-tag')) return;
        const client = profiles.find(p => p.id === card.dataset.id);
        if (client) {
          selectedClient = client;
          activeTab = 'datos';
          renderDetail();
        }
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

  // ---- Helper: get email from auth via RPC ----
  async function getAuthEmail(userId) {
    try {
      const { data, error } = await supabase.rpc('get_user_email', { p_user_id: userId });
      if (error) { console.warn('getAuthEmail RPC error:', error.message); return null; }
      return data || null;
    } catch {
      return null;
    }
  }

  // ===================== NEW CLIENT MODAL =====================
  function openNewClientModal() {
    const levelOpts = (sel = '') => `
      <option value="">Sin definir</option>
      <option value="principiante" ${sel === 'principiante' ? 'selected' : ''}>Principiante</option>
      <option value="intermedio" ${sel === 'intermedio' ? 'selected' : ''}>Intermedio</option>
      <option value="avanzado" ${sel === 'avanzado' ? 'selected' : ''}>Avanzado</option>`;
    const familyRowHtml = () => `
      <div class="ncl-fam-row">
        <input type="text" class="act-form-input ncl-fam-name" placeholder="Nombre*" />
        <input type="text" class="act-form-input ncl-fam-last" placeholder="Apellidos" />
        <input type="date" class="act-form-input ncl-fam-birth" />
        <select class="act-form-input ncl-fam-level">${levelOpts()}</select>
        <button type="button" class="ncl-fam-remove" title="Quitar">✕</button>
      </div>`;

    openModal('Nuevo Cliente', `
      <form id="new-client-form" class="ncl-form">
        <div class="ncl-card">
          <h3 class="ncl-card-title">Datos del cliente</h3>
          <div class="cli-form-row">
            <div class="act-form-field"><label class="act-form-label">Nombre*</label><input type="text" class="act-form-input" name="full_name" required></div>
            <div class="act-form-field"><label class="act-form-label">Apellidos</label><input type="text" class="act-form-input" name="last_name"></div>
          </div>
          <div class="cli-form-row">
            <div class="act-form-field"><label class="act-form-label">Email*</label><input type="email" class="act-form-input" name="email" required></div>
            <div class="act-form-field"><label class="act-form-label">Teléfono</label><input type="tel" class="act-form-input" name="phone"></div>
          </div>
          <div class="cli-form-row">
            <div class="act-form-field"><label class="act-form-label">Fecha de nacimiento</label><input type="date" class="act-form-input" name="birth_date"></div>
            <div class="act-form-field"><label class="act-form-label">Nivel</label><select class="act-form-input" name="level">${levelOpts()}</select></div>
          </div>
          <div class="cli-form-row">
            <div class="act-form-field"><label class="act-form-label">Dirección</label><input type="text" class="act-form-input" name="address"></div>
            <div class="act-form-field"><label class="act-form-label">Ciudad</label><input type="text" class="act-form-input" name="city"></div>
          </div>
          <div class="cli-form-row">
            <div class="act-form-field"><label class="act-form-label">Código postal</label><input type="text" class="act-form-input" name="postal_code"></div>
            <div class="act-form-field"><label class="act-form-label">Talla neopreno</label><select class="act-form-input" name="wetsuit_size">${wetsuitOptionsHtml('')}</select></div>
          </div>
          <div class="cli-form-row">
            <div class="act-form-field"><label class="act-form-label">¿Sabe nadar?</label><select class="act-form-input" name="can_swim"><option value="">Sin definir</option><option value="true">Sí</option><option value="false">No</option></select></div>
            <div class="act-form-field"><label class="act-form-label">¿Lesión?</label><select class="act-form-input" name="has_injury" id="ncl-injury"><option value="false">No</option><option value="true">Sí</option></select></div>
          </div>
          <div class="cli-form-row" id="ncl-injury-wrap" style="display:none;grid-template-columns:1fr">
            <div class="act-form-field"><label class="act-form-label">Detalle lesión</label><input type="text" class="act-form-input" name="injury_detail" placeholder="Describe la lesión…"></div>
          </div>
        </div>

        <div class="ncl-card">
          <div class="ncl-card-title-row"><h3 class="ncl-card-title">Familiares</h3><span class="ncl-card-hint">Se crean y se le asignan al cliente</span></div>
          <div class="ncl-fam-head"><span>Nombre</span><span>Apellidos</span><span>Fecha nac.</span><span>Nivel</span><span></span></div>
          <div id="ncl-family"></div>
          <button type="button" class="btn ghost ncl-add-fam" id="ncl-add-fam">+ Añadir familiar</button>
        </div>

        <button type="submit" class="btn red" style="width:100%;margin-top:4px" id="ncl-submit">Crear cliente</button>
      </form>
    `);

    const famWrap = document.getElementById('ncl-family');
    document.getElementById('ncl-add-fam').addEventListener('click', () => {
      famWrap.insertAdjacentHTML('beforeend', familyRowHtml());
    });
    famWrap.addEventListener('click', (e) => {
      if (e.target.closest('.ncl-fam-remove')) e.target.closest('.ncl-fam-row').remove();
    });
    const injurySel = document.getElementById('ncl-injury');
    injurySel.addEventListener('change', () => {
      document.getElementById('ncl-injury-wrap').style.display = injurySel.value === 'true' ? '' : 'none';
    });

    document.getElementById('new-client-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('ncl-submit');
      const o = Object.fromEntries(new FormData(e.target));
      const clientObj = {
        full_name: o.full_name?.trim(),
        last_name: o.last_name?.trim() || null,
        email: o.email?.trim(),
        phone: o.phone?.trim() || null,
        birth_date: o.birth_date || null,
        address: o.address?.trim() || null,
        city: o.city?.trim() || null,
        postal_code: o.postal_code?.trim() || null,
        level: o.level || null,
        wetsuit_size: o.wetsuit_size || null,
        can_swim: o.can_swim === 'true' ? true : o.can_swim === 'false' ? false : null,
        has_injury: o.has_injury === 'true',
        injury_detail: o.injury_detail?.trim() || null,
      };
      const familyRows = [...famWrap.querySelectorAll('.ncl-fam-row')].map(r => ({
        full_name: r.querySelector('.ncl-fam-name').value.trim(),
        last_name: r.querySelector('.ncl-fam-last').value.trim() || null,
        birth_date: r.querySelector('.ncl-fam-birth').value || null,
        level: r.querySelector('.ncl-fam-level').value || null,
      })).filter(f => f.full_name);

      submitBtn.disabled = true; submitBtn.textContent = 'Creando…';
      try {
        const created = await createClientFromAdmin(clientObj);
        let famCount = 0;
        for (const f of familyRows) {
          try { await createFamilyMemberAdmin(created.id, f); famCount++; } catch (err) { console.warn('familiar:', err.message); }
        }
        closeModal();
        showToast(famCount > 0 ? `Cliente creado · ${famCount} familiar(es) añadido(s)` : 'Cliente creado', 'success');
        renderList();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        submitBtn.disabled = false; submitBtn.textContent = 'Crear cliente';
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
      { group: 'ACTIVIDAD COMERCIAL', items: [
        { id: 'pagos', label: 'Historial pagos', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
        { id: 'reservas', label: 'Surf Camps', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
        { id: 'alquileres', label: 'Alquiler Material', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 00-8 0v2"/></svg>' },
        { id: 'pedidos', label: 'Pedidos Tienda', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>' },
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

    // Injury toggle in datos tab
    container.querySelector('#cli-has-injury')?.addEventListener('change', (e) => {
      const row = container.querySelector('#cli-injury-detail-row');
      if (row) row.style.display = e.target.value === 'true' ? '' : 'none';
    });

    // Load async tab content
    if (activeTab === 'familia') loadFamiliaTab(c);
    else if (activeTab === 'clases') loadClasesTab(c);
    else if (activeTab === 'bonos') loadBonosTab(c);
    else if (activeTab === 'pagos') loadPagosTab(c);
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
            <label class="act-form-label">NOMBRE</label>
            <input type="text" class="act-form-input" id="cli-fullname" value="${esc(c.full_name)}" />
          </div>
          <div class="act-form-field">
            <label class="act-form-label">APELLIDOS</label>
            <input type="text" class="act-form-input" id="cli-lastname" value="${esc(c.last_name || '')}" placeholder="Apellidos" />
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">EMAIL</label>
            <input type="email" class="act-form-input" value="${esc(c._email || '')}" readonly style="background:#f9fafb;cursor:default" placeholder="${c._email ? '' : 'No disponible'}" />
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">TELÉFONO</label>
            <input type="tel" class="act-form-input" id="cli-phone" value="${esc(c.phone)}" placeholder="+34 600 000 000" />
          </div>
          <div class="act-form-field">
            <label class="act-form-label">FECHA DE NACIMIENTO</label>
            <input type="date" class="act-form-input" id="cli-birthdate" value="${c.birth_date || ''}" />
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">ROL</label>
            <select class="act-form-input" id="cli-role" style="cursor:pointer">
              <option value="client" ${c.role === 'client' ? 'selected' : ''}>Cliente</option>
              <option value="admin" ${c.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
          </div>
        </div>
      </div>

      <h3 class="act-detail-section-title" style="margin-top:24px">Salud y equipamiento</h3>
      <div class="act-form-card">
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">¿SABE NADAR?</label>
            <select class="act-form-input" id="cli-can-swim">
              <option value="" ${c.can_swim == null ? 'selected' : ''}>Sin definir</option>
              <option value="true" ${c.can_swim === true ? 'selected' : ''}>Sí</option>
              <option value="false" ${c.can_swim === false ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="act-form-field">
            <label class="act-form-label">¿TIENE LESIÓN?</label>
            <select class="act-form-input" id="cli-has-injury">
              <option value="false" ${!c.has_injury ? 'selected' : ''}>No</option>
              <option value="true" ${c.has_injury ? 'selected' : ''}>Sí</option>
            </select>
          </div>
        </div>
        <div class="cli-form-row" id="cli-injury-detail-row" style="${c.has_injury ? '' : 'display:none'}">
          <div class="act-form-field">
            <label class="act-form-label">DETALLE LESIÓN</label>
            <input type="text" class="act-form-input" id="cli-injury-detail" value="${esc(c.injury_detail)}" placeholder="Describe la lesión…" />
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">TALLA NEOPRENO</label>
            <select class="act-form-input" id="cli-wetsuit-size">
              ${wetsuitOptionsHtml(c.wetsuit_size || '')}
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
                ${m.wetsuit_size ? `<div class="cli-family-field"><span class="cli-family-field-label">Neopreno</span><span>${m.wetsuit_size}</span></div>` : ''}
                ${m.can_swim === false ? `<div class="cli-family-field"><span class="cli-family-field-label" style="color:#b91c1c">⚠ No sabe nadar</span></div>` : ''}
                ${m.has_injury ? `<div class="cli-family-field"><span class="cli-family-field-label" style="color:#b91c1c">⚠ Lesión</span><span>${esc(m.injury_detail) || 'Sí'}</span></div>` : ''}
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
      <form id="family-member-form" class="fm-modal-form">
        <div class="cli-form-row" style="grid-template-columns:1fr">
          <div class="act-form-field">
            <label class="act-form-label">Nombre completo</label>
            <input type="text" class="act-form-input" name="full_name" value="${esc(member?.full_name)}" placeholder="Nombre y apellidos" required />
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">Fecha de nacimiento</label>
            <input type="date" class="act-form-input" name="birth_date" value="${member?.birth_date || ''}" />
          </div>
          <div class="act-form-field">
            <label class="act-form-label">Nivel</label>
            <select class="act-form-input" name="level">
              <option value="">Sin definir</option>
              <option value="principiante" ${member?.level === 'principiante' ? 'selected' : ''}>Principiante</option>
              <option value="intermedio" ${member?.level === 'intermedio' ? 'selected' : ''}>Intermedio</option>
              <option value="avanzado" ${member?.level === 'avanzado' ? 'selected' : ''}>Avanzado</option>
            </select>
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">¿Sabe nadar?</label>
            <select class="act-form-input" name="can_swim">
              <option value="" ${member?.can_swim == null ? 'selected' : ''}>Sin definir</option>
              <option value="true" ${member?.can_swim === true ? 'selected' : ''}>Sí</option>
              <option value="false" ${member?.can_swim === false ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="act-form-field">
            <label class="act-form-label">Talla neopreno</label>
            <select class="act-form-input" name="wetsuit_size">
              ${wetsuitOptionsHtml(member?.wetsuit_size || '')}
            </select>
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">¿Tiene lesión?</label>
            <select class="act-form-input" name="has_injury" id="fm-has-injury">
              <option value="false" ${!member?.has_injury ? 'selected' : ''}>No</option>
              <option value="true" ${member?.has_injury ? 'selected' : ''}>Sí</option>
            </select>
          </div>
          <div class="act-form-field" id="fm-injury-wrap" style="${member?.has_injury ? '' : 'display:none'}">
            <label class="act-form-label">Detalle lesión</label>
            <input type="text" class="act-form-input" name="injury_detail" value="${esc(member?.injury_detail)}" placeholder="Describe la lesión…" />
          </div>
        </div>
        <div class="cli-form-row" style="grid-template-columns:1fr">
          <div class="act-form-field">
            <label class="act-form-label">Notas</label>
            <input type="text" class="act-form-input" name="notes" value="${esc(member?.notes)}" placeholder="Alergias, observaciones…" />
          </div>
        </div>
        <button type="submit" class="btn red" style="margin-top:4px;width:100%">${isEdit ? 'Guardar cambios' : 'Añadir miembro'}</button>
      </form>
    `);

    // Mostrar "Detalle lesión" solo si hay lesión
    const injurySel = document.getElementById('fm-has-injury');
    const injuryWrap = document.getElementById('fm-injury-wrap');
    injurySel?.addEventListener('change', () => {
      injuryWrap.style.display = injurySel.value === 'true' ? '' : 'none';
    });

    document.getElementById('family-member-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const fields = Object.fromEntries(fd);
      if (!fields.birth_date) fields.birth_date = null;
      if (!fields.level) fields.level = null;
      if (!fields.notes) fields.notes = null;
      fields.can_swim = fields.can_swim === 'true' ? true : fields.can_swim === 'false' ? false : null;
      fields.has_injury = fields.has_injury === 'true';
      if (!fields.injury_detail) fields.injury_detail = null;
      if (!fields.wetsuit_size) fields.wetsuit_size = null;
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

    // Fetch enrollments and parent's rentals for this family member
    let enrollments = [];
    let rentals = [];
    try {
      const [enrRes, rentalRes] = await Promise.all([
        fetchFamilyMemberEnrollments(member.id),
        supabase.from('equipment_reservations').select('*, rental_equipment(name, type)').eq('user_id', client.id).order('created_at', { ascending: false }).limit(20).then(r => r.data || []).catch(() => []),
      ]);
      enrollments = enrRes;
      rentals = rentalRes;
    } catch {}

    const memberFullName = `${esc(member.full_name)}${member.last_name ? ' ' + esc(member.last_name) : ''}`;

    let html = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <button class="act-back-btn" id="member-back" style="position:static">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <h3 class="act-detail-section-title" style="margin:0">Ficha de ${memberFullName}</h3>
            <div style="font-size:.78rem;color:var(--color-muted);margin-top:2px">Familiar de <strong>${esc(client.full_name)}${client.last_name ? ' ' + esc(client.last_name) : ''}</strong>${age !== null ? ' · ' + age + ' años' : ''}</div>
          </div>
        </div>
        <button class="btn red" id="member-save" style="font-size:.82rem;padding:8px 18px">Guardar cambios</button>
      </div>

      <div class="act-form-card">
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">NOMBRE</label>
            <input type="text" class="act-form-input" id="mf-fullname" value="${esc(member.full_name)}" />
          </div>
          <div class="act-form-field">
            <label class="act-form-label">APELLIDOS</label>
            <input type="text" class="act-form-input" id="mf-lastname" value="${esc(member.last_name || '')}" placeholder="Apellidos" />
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">RESPONSABLE</label>
            <input type="text" class="act-form-input" value="${esc(client.full_name)}${client.last_name ? ' ' + esc(client.last_name) : ''} (titular)" readonly style="background:#f9fafb" />
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">FECHA DE NACIMIENTO</label>
            <input type="date" class="act-form-input" id="mf-birthdate" value="${member.birth_date || ''}" />
          </div>
          <div class="act-form-field">
            <label class="act-form-label">NIVEL</label>
            <select class="act-form-input" id="mf-level">
              <option value="">Sin definir</option>
              <option value="principiante" ${member.level === 'principiante' ? 'selected' : ''}>Principiante</option>
              <option value="intermedio" ${member.level === 'intermedio' ? 'selected' : ''}>Intermedio</option>
              <option value="avanzado" ${member.level === 'avanzado' ? 'selected' : ''}>Avanzado</option>
            </select>
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">¿SABE NADAR?</label>
            <select class="act-form-input" id="mf-swim">
              <option value="" ${member.can_swim == null ? 'selected' : ''}>Sin definir</option>
              <option value="true" ${member.can_swim === true ? 'selected' : ''}>Sí</option>
              <option value="false" ${member.can_swim === false ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="act-form-field">
            <label class="act-form-label">TALLA NEOPRENO</label>
            <select class="act-form-input" id="mf-wetsuit">
              ${wetsuitOptionsHtml(member.wetsuit_size || '')}
            </select>
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">¿TIENE LESIÓN?</label>
            <select class="act-form-input" id="mf-injury">
              <option value="false" ${!member.has_injury ? 'selected' : ''}>No</option>
              <option value="true" ${member.has_injury ? 'selected' : ''}>Sí</option>
            </select>
          </div>
          <div class="act-form-field" id="mf-injury-detail-wrap" style="${member.has_injury ? '' : 'display:none'}">
            <label class="act-form-label">DETALLE LESIÓN</label>
            <input type="text" class="act-form-input" id="mf-injury-detail" value="${esc(member.injury_detail)}" placeholder="Describe la lesión…" />
          </div>
        </div>
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">NOTAS</label>
            <input type="text" class="act-form-input" id="mf-notes" value="${esc(member.notes)}" placeholder="Alergias, observaciones…" />
          </div>
        </div>
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

    // Equipment rentals (from parent account)
    if (rentals.length) {
      html += `<h3 class="act-detail-section-title" style="margin-top:24px">Alquiler de material — cuenta de ${esc(client.full_name)} (${rentals.length})</h3>`;
      const rentalRows = rentals.map(r => `<tr>
        <td>${r.rental_equipment?.name || '—'}</td>
        <td>${r.rental_equipment?.type || '—'}</td>
        <td>${r.date_start || '—'} — ${r.date_end || '—'}</td>
        <td>${r.size || '—'}</td>
        <td>${statusBadge(r.status || 'pending')}</td>
      </tr>`).join('');
      html += `<div class="act-form-card" style="padding:0;overflow:hidden">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Material</th><th>Tipo</th><th>Periodo</th><th>Talla</th><th>Estado</th></tr></thead>
            <tbody>${rentalRows}</tbody>
          </table>
        </div>
      </div>`;
    }

    el.innerHTML = html;

    el.querySelector('#member-back')?.addEventListener('click', () => loadFamiliaTab(client));

    // Injury toggle
    el.querySelector('#mf-injury')?.addEventListener('change', (e) => {
      const wrap = el.querySelector('#mf-injury-detail-wrap');
      if (wrap) wrap.style.display = e.target.value === 'true' ? '' : 'none';
    });

    // Save member
    el.querySelector('#member-save')?.addEventListener('click', async () => {
      const fields = {
        full_name: el.querySelector('#mf-fullname')?.value?.trim() || member.full_name,
        last_name: el.querySelector('#mf-lastname')?.value?.trim() || '',
        birth_date: el.querySelector('#mf-birthdate')?.value || null,
        level: el.querySelector('#mf-level')?.value || null,
        can_swim: el.querySelector('#mf-swim')?.value === 'true' ? true : el.querySelector('#mf-swim')?.value === 'false' ? false : null,
        has_injury: el.querySelector('#mf-injury')?.value === 'true',
        injury_detail: el.querySelector('#mf-injury-detail')?.value?.trim() || null,
        wetsuit_size: el.querySelector('#mf-wetsuit')?.value || null,
        notes: el.querySelector('#mf-notes')?.value?.trim() || null,
      };
      try {
        await updateFamilyMemberAdmin(member.id, fields);
        Object.assign(member, fields);
        showToast('Miembro actualizado', 'success');
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
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

      const rows = enrollments.map((e, i) => {
        const cls = e.surf_class || {};
        return `<tr class="cli-row-click" data-idx="${i}" style="cursor:pointer">
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

      el.querySelectorAll('.cli-row-click').forEach(row => {
        row.addEventListener('click', () => {
          const idx = parseInt(row.dataset.idx);
          const enr = enrollments[idx];
          if (enr) openEnrollmentDetailModal(c, enr);
        });
      });
    } catch (err) {
      el.innerHTML = `<div class="act-form-card"><p style="color:#b91c1c">Error cargando clases: ${esc(err.message)}</p></div>`;
    }
  }

  async function loadBonosTab(c) {
    const el = container.querySelector('#cli-tab-content');
    try {
      const bonos = await fetchClientBonos(c.id);

      const header = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <h3 class="act-detail-section-title" style="margin:0">Bonos (${bonos.length})</h3>
          <button class="btn red" id="cli-create-bono-btn" style="font-size:.82rem;padding:8px 14px">+ Nuevo bono</button>
        </div>`;

      if (!bonos.length) {
        el.innerHTML = `
          ${header}
          <div class="act-form-card">
            <div class="admin-empty"><p>Este cliente no tiene bonos</p></div>
          </div>`;
        el.querySelector('#cli-create-bono-btn')?.addEventListener('click', () => openCreateBonoModal(c));
        return;
      }

      const cards = bonos.map(b => {
        const remaining = b.total_credits - b.used_credits;
        const pct = b.total_credits > 0 ? Math.round((b.used_credits / b.total_credits) * 100) : 0;
        const expectedPrice = getPackPrice(b.class_type, b.total_credits);
        const deposit = DEPOSIT[b.class_type] || 15;
        const paid = Number(b.total_paid || 0) || (b.order_id ? deposit : 0);
        const pending = Math.max(0, Math.round((expectedPrice - paid) * 100) / 100);
        const isFullyPaid = paid >= expectedPrice;
        return `
          <div class="cli-bono-card" data-bono-id="${b.id}">
            <div class="cli-bono-header">
              <strong>${TYPE_LABELS[b.class_type] || b.class_type} — ${b.total_credits} clases</strong>
              <div style="display:flex;gap:6px;align-items:center">
                ${statusBadge(b.status)}
                ${isFullyPaid
                  ? '<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:4px;background:#dcfce7;color:#166534">PAGADO</span>'
                  : '<span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:4px;background:#fef3c7;color:#92400e">DEBE ' + formatCurrency(pending) + '</span>'
                }
              </div>
            </div>
            <div class="cli-bono-credits">
              <span>${b.used_credits} / ${b.total_credits} sesiones usadas</span>
              <span class="cli-bono-remaining">${remaining} restantes</span>
            </div>
            <div class="cli-bono-bar">
              <div class="cli-bono-bar-fill" style="width:${pct}%;background:${isFullyPaid ? '#22c55e' : '#f59e0b'}"></div>
            </div>
            <div class="cli-bono-meta">
              <span>Pagado: ${formatCurrency(paid)} de ${formatCurrency(expectedPrice)}</span>
              <span>Caduca: ${formatDate(b.expires_at)}</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
              ${!isFullyPaid && b.status === 'active' ? `<button class="btn cli-bono-pay-btn" data-bono-id="${b.id}" data-pending="${pending.toFixed(2)}" style="flex:1;min-width:140px;font-size:.78rem;padding:6px 14px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">Añadir pago</button>` : ''}
              <button class="btn cli-bono-expand-btn" data-bono-id="${b.id}" style="flex:1;min-width:140px;font-size:.78rem;padding:6px 14px;background:#fff;color:#0ea5e9;border:1px solid #0ea5e9;border-radius:6px;cursor:pointer;font-weight:600">+ Ampliar</button>
            </div>
          </div>`;
      }).join('');

      el.innerHTML = `
        ${header}
        <div class="cli-bonos-grid">${cards}</div>`;

      el.querySelector('#cli-create-bono-btn')?.addEventListener('click', () => openCreateBonoModal(c));

      // Bind add payment to bono
      el.querySelectorAll('.cli-bono-pay-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openAddPaymentModal(c, 'bono', btn.dataset.bonoId, Number(btn.dataset.pending));
        });
      });

      // Bind expand bono
      el.querySelectorAll('.cli-bono-expand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const bono = bonos.find(b => b.id === btn.dataset.bonoId);
          if (bono) openExpandBonoModal(c, bono);
        });
      });
    } catch (err) {
      el.innerHTML = `<div class="act-form-card"><p style="color:#b91c1c">Error cargando bonos: ${esc(err.message)}</p></div>`;
    }
  }

  // ---- Ampliar bono existente ----
  function openExpandBonoModal(c, bono) {
    const classType = bono.class_type;
    const currentCredits = bono.total_credits;
    const currentPaid = Number(bono.total_paid || 0) || (bono.order_id ? (DEPOSIT[classType] || 15) : 0);
    const currentExpected = getPackPrice(classType, currentCredits);

    function suggestPrice(extra) {
      const newTotal = currentCredits + extra;
      const fullPrice = getPackPrice(classType, newTotal);
      return Math.max(0, Math.round((fullPrice - currentExpected) * 100) / 100);
    }

    const defaultExtra = 4;
    const defaultPrice = suggestPrice(defaultExtra);

    openModal('Ampliar bono', `
      <form id="cli-expand-bono-form" class="trip-form" style="min-width:340px">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px;margin-bottom:16px">
          <div style="font-size:.85rem;color:#1e40af;font-weight:600">${TYPE_LABELS[classType] || classType} · ${bono.used_credits}/${currentCredits} clases usadas</div>
          <div style="font-size:.82rem;color:#1e40af;margin-top:4px">Pagado actual: ${formatCurrency(currentPaid)} de ${formatCurrency(currentExpected)}</div>
        </div>
        <label>Clases a añadir</label>
        <input type="number" id="cli-exp-extra" class="act-form-input" min="1" step="1" value="${defaultExtra}" required style="margin-bottom:10px" />
        <label>Importe a cobrar (€)</label>
        <input type="number" id="cli-exp-amount" class="act-form-input" step="0.01" min="0" value="${defaultPrice.toFixed(2)}" required style="margin-bottom:4px" />
        <small style="color:#6b7280;display:block;margin-bottom:10px">Sugerido según pack ${classType}. Editable.</small>
        <label>Método de pago</label>
        <select id="cli-exp-method" class="act-form-input" required style="margin-bottom:16px">
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
          <option value="voucher">Voucher</option>
          <option value="saldo">Saldo a favor</option>
        </select>
        <button type="submit" class="btn red" id="cli-exp-submit" style="width:100%;padding:10px;background:#0ea5e9">Ampliar y registrar pago</button>
      </form>
    `);

    const extraInput = document.getElementById('cli-exp-extra');
    const amountInput = document.getElementById('cli-exp-amount');
    extraInput?.addEventListener('input', () => {
      const e = parseInt(extraInput.value) || 0;
      if (e > 0) amountInput.value = suggestPrice(e).toFixed(2);
    });

    document.getElementById('cli-expand-bono-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const extra = parseInt(extraInput.value) || 0;
      const amount = parseFloat(amountInput.value) || 0;
      const method = document.getElementById('cli-exp-method').value;
      if (extra <= 0) { showToast('Indica al menos 1 clase', 'error'); return; }

      const btn = document.getElementById('cli-exp-submit');
      btn.disabled = true; btn.textContent = 'Procesando…';
      try {
        const newTotalCredits = currentCredits + extra;
        const newTotalPaid = currentPaid + amount;
        const newExpiresAt = new Date();
        newExpiresAt.setMonth(newExpiresAt.getMonth() + 12);

        const { error } = await supabase.from('bonos').update({
          total_credits: newTotalCredits,
          total_paid: newTotalPaid,
          status: 'active',
          expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', bono.id);
        if (error) throw error;

        if (method === 'saldo' && amount > 0) {
          const currentBalance = Number(c.credit_balance || 0);
          await supabase.from('profiles').update({ credit_balance: Math.max(0, currentBalance - amount) }).eq('id', c.id);
          c.credit_balance = Math.max(0, currentBalance - amount);
        }

        if (amount > 0) {
          await createPayment({
            reservation_type: 'bono',
            reference_id: bono.id,
            amount,
            payment_method: method,
            concept: `Ampliación bono ${TYPE_LABELS[classType] || classType} (+${extra})`,
          });
        }

        showToast(`Bono ampliado: +${extra} clases · ${formatCurrency(amount)}`, 'success');
        closeModal();
        loadBonosTab(c);
      } catch (err) {
        console.error('Error ampliando bono:', err);
        showToast('Error: ' + (err.message || 'No se pudo ampliar'), 'error');
        btn.disabled = false; btn.textContent = 'Ampliar y registrar pago';
      }
    });
  }

  // ---- Crear bono nuevo ----
  function openCreateBonoModal(c) {
    const typeOptions = Object.entries(TYPE_LABELS)
      .map(([val, label]) => `<option value="${val}">${label}</option>`)
      .join('');

    const defaultType = 'grupal';
    const defaultCredits = 4;
    const defaultPrice = getPackPrice(defaultType, defaultCredits);
    const newExpiresAt = new Date();
    newExpiresAt.setMonth(newExpiresAt.getMonth() + 12);

    openModal('Nuevo bono', `
      <form id="cli-new-bono-form" class="trip-form" style="min-width:340px">
        <label>Tipo de clase</label>
        <select id="cli-nb-type" class="act-form-input" required style="margin-bottom:10px">${typeOptions}</select>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label>Nº de clases</label>
            <input type="number" id="cli-nb-credits" class="act-form-input" min="1" step="1" value="${defaultCredits}" required />
          </div>
          <div>
            <label>Caduca</label>
            <input type="date" id="cli-nb-expires" class="act-form-input" value="${newExpiresAt.toISOString().slice(0,10)}" required />
          </div>
        </div>

        <label style="margin-top:10px">Importe a cobrar (€)</label>
        <input type="number" id="cli-nb-amount" class="act-form-input" step="0.01" min="0" value="${defaultPrice.toFixed(2)}" required style="margin-bottom:4px" />
        <small style="color:#6b7280;display:block;margin-bottom:10px">Sugerido según PACK_PRICING. Editable. Pon 0 si solo registras el bono sin cobro.</small>

        <label>Método de pago</label>
        <select id="cli-nb-method" class="act-form-input" required style="margin-bottom:16px">
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
          <option value="voucher">Voucher</option>
          <option value="saldo">Saldo a favor</option>
        </select>

        <button type="submit" class="btn red" id="cli-nb-submit" style="width:100%;padding:10px">Crear bono y cobrar</button>
      </form>
    `);

    const typeSel = document.getElementById('cli-nb-type');
    const credInput = document.getElementById('cli-nb-credits');
    const amountInput = document.getElementById('cli-nb-amount');

    function recalcSuggested() {
      const t = typeSel.value;
      const credits = parseInt(credInput.value) || 0;
      if (credits > 0) amountInput.value = getPackPrice(t, credits).toFixed(2);
    }
    typeSel?.addEventListener('change', recalcSuggested);
    credInput?.addEventListener('input', recalcSuggested);

    document.getElementById('cli-new-bono-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const classType = typeSel.value;
      const credits = parseInt(credInput.value) || 0;
      const amount = parseFloat(amountInput.value) || 0;
      const method = document.getElementById('cli-nb-method').value;
      const expiresAtStr = document.getElementById('cli-nb-expires').value;
      if (credits <= 0) { showToast('El bono debe tener al menos 1 clase', 'error'); return; }
      if (!expiresAtStr) { showToast('Indica la fecha de caducidad', 'error'); return; }

      const btn = document.getElementById('cli-nb-submit');
      btn.disabled = true; btn.textContent = 'Creando…';
      try {
        const { data: bonoCreated, error } = await supabase.from('bonos').insert({
          user_id: c.id,
          class_type: classType,
          total_credits: credits,
          used_credits: 0,
          status: 'active',
          total_paid: amount,
          expires_at: new Date(expiresAtStr + 'T23:59:59').toISOString(),
        }).select('id').single();
        if (error) throw error;

        if (method === 'saldo' && amount > 0) {
          const currentBalance = Number(c.credit_balance || 0);
          await supabase.from('profiles').update({ credit_balance: Math.max(0, currentBalance - amount) }).eq('id', c.id);
          c.credit_balance = Math.max(0, currentBalance - amount);
        }

        if (amount > 0 && bonoCreated?.id) {
          await createPayment({
            reservation_type: 'bono',
            reference_id: bonoCreated.id,
            amount,
            payment_method: method,
            concept: `Nuevo bono ${TYPE_LABELS[classType] || classType} (${credits} clases)`,
          });
        }

        showToast(`Bono creado: ${credits} clases · ${formatCurrency(amount)}`, 'success');
        closeModal();
        loadBonosTab(c);
      } catch (err) {
        console.error('Error creando bono:', err);
        showToast('Error: ' + (err.message || 'No se pudo crear'), 'error');
        btn.disabled = false; btn.textContent = 'Crear bono y cobrar';
      }
    });
  }

  // ---- Helpers para fichas de detalle ----
  const METHOD_LBL = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', voucher: 'Voucher', online: 'Online', saldo: 'Saldo a favor' };
  const ENROLL_STATUS_OPTIONS = [
    { v: 'confirmed', l: 'Confirmado' },
    { v: 'partial', l: 'Anticipo pagado' },
    { v: 'paid', l: 'Pagado' },
    { v: 'cancelled', l: 'Cancelado' },
  ];
  const RENTAL_STATUS_OPTIONS = [
    { v: 'pending', l: 'Pendiente' },
    { v: 'confirmed', l: 'Confirmado' },
    { v: 'active', l: 'Activo' },
    { v: 'returned', l: 'Devuelto' },
    { v: 'cancelled', l: 'Cancelado' },
  ];

  function paymentsListHtml(payments, onDeleteId = true) {
    if (!payments.length) return '<p style="font-size:.82rem;color:#6b7280;margin:6px 0 0">Sin pagos registrados</p>';
    return payments.map(p => {
      const d = new Date(p.payment_date || p.created_at);
      const dateLbl = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      return `
        <div class="cli-pay-item" data-payment-id="${p.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;margin-top:6px;background:#fff">
          <div style="font-size:.82rem;color:#0f2f39">
            <strong>${formatCurrency(p.amount)}</strong> · ${METHOD_LBL[p.payment_method] || p.payment_method}
            <div style="font-size:.72rem;color:#6b7280">${dateLbl}${p.concept ? ' · ' + esc(p.concept) : ''}</div>
          </div>
          <div style="display:flex;gap:4px">
            <button class="cli-pay-edit-inline" data-payment-id="${p.id}" title="Editar" style="background:none;border:none;cursor:pointer;color:#0ea5e9;padding:4px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="cli-pay-del-inline" data-payment-id="${p.id}" title="Eliminar" style="background:none;border:none;cursor:pointer;color:#dc2626;padding:4px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');
  }

  function bindPaymentsListEvents(rootEl, c, payments, reloadFn) {
    rootEl.querySelectorAll('.cli-pay-edit-inline').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = payments.find(pp => pp.id === btn.dataset.paymentId);
        if (p) openPaymentEditModal(p, { onSaved: reloadFn });
      });
    });
    rootEl.querySelectorAll('.cli-pay-del-inline').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const p = payments.find(pp => pp.id === btn.dataset.paymentId);
        if (!p) return;
        if (!confirm(`¿Eliminar este pago de ${formatCurrency(p.amount)}?`)) return;
        try {
          await deletePayment(p.id);
          await recalcPaymentState(p.reservation_type, p.reference_id);
          showToast('Pago eliminado · estado recalculado', 'success');
          reloadFn();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
      });
    });
  }

  // ---- Ficha de inscripción (clase individual) ----
  async function openEnrollmentDetailModal(c, enr) {
    const cls = enr.surf_class || {};
    const typeLbl = TYPE_LABELS[cls.type] || cls.type || '—';
    const totalClase = Number(cls.price || 0);
    const payments = await fetchPayments('enrollment', enr.id);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const pending = Math.max(0, Math.round((totalClase - totalPaid) * 100) / 100);

    const statusOptions = ENROLL_STATUS_OPTIONS
      .map(o => `<option value="${o.v}" ${o.v === enr.status ? 'selected' : ''}>${o.l}</option>`).join('');

    openModal('Inscripción a clase', `
      <div style="min-width:340px">
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:14px">
          <div style="font-weight:700;color:#0f2f39">${typeLbl}${cls.title ? ' · ' + esc(cls.title) : ''}</div>
          <div style="font-size:.82rem;color:#6b7280;margin-top:2px">${formatDate(cls.date)} · ${cls.time_start?.slice(0,5) || ''} — ${cls.time_end?.slice(0,5) || ''}</div>
          ${cls.instructor ? `<div style="font-size:.78rem;color:#6b7280">Instructor: ${esc(cls.instructor)}</div>` : ''}
        </div>

        <label>Estado de la inscripción</label>
        <select id="cli-enr-status" class="act-form-input" style="margin-bottom:14px">${statusOptions}</select>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;font-size:.82rem">
          <div style="padding:8px;background:#f0fdf4;border-radius:8px"><div style="color:#065f46;font-size:.7rem;text-transform:uppercase">Precio</div><strong>${formatCurrency(totalClase)}</strong></div>
          <div style="padding:8px;background:#eff6ff;border-radius:8px"><div style="color:#1e40af;font-size:.7rem;text-transform:uppercase">Pagado</div><strong>${formatCurrency(totalPaid)}</strong></div>
          <div style="padding:8px;background:${pending > 0 ? '#fef2f2' : '#f0fdf4'};border-radius:8px"><div style="color:${pending > 0 ? '#b91c1c' : '#065f46'};font-size:.7rem;text-transform:uppercase">Pendiente</div><strong>${formatCurrency(pending)}</strong></div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 4px">
          <label style="margin:0">Pagos</label>
          <button class="btn" id="cli-enr-add-pay" style="font-size:.74rem;padding:4px 10px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer">+ Pago</button>
        </div>
        <div id="cli-enr-payments">${paymentsListHtml(payments)}</div>

        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn" id="cli-enr-delete" style="flex:1;background:#fee2e2;color:#b91c1c;border:none;padding:9px;border-radius:8px;cursor:pointer;font-weight:600">Eliminar inscripción</button>
          <button class="btn red" id="cli-enr-close" style="flex:1;padding:9px">Cerrar</button>
        </div>
      </div>
    `);

    const paymentsEl = document.getElementById('cli-enr-payments');
    const reloadPayments = async () => {
      const fresh = await fetchPayments('enrollment', enr.id);
      paymentsEl.innerHTML = paymentsListHtml(fresh);
      bindPaymentsListEvents(paymentsEl, c, fresh, reloadPayments);
    };
    bindPaymentsListEvents(paymentsEl, c, payments, reloadPayments);

    document.getElementById('cli-enr-close')?.addEventListener('click', () => closeModal());

    document.getElementById('cli-enr-status')?.addEventListener('change', async (e) => {
      try {
        await updateEnrollmentStatus(enr.id, e.target.value);
        enr.status = e.target.value;
        showToast('Estado actualizado', 'success');
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });

    document.getElementById('cli-enr-add-pay')?.addEventListener('click', async () => {
      const amount = parseFloat(prompt('Importe a registrar (€):', pending > 0 ? pending.toFixed(2) : ''));
      if (!amount || amount <= 0) return;
      const method = prompt('Método (efectivo / tarjeta / transferencia / voucher):', 'efectivo');
      if (!method) return;
      try {
        await createPayment({
          reservation_type: 'enrollment',
          reference_id: enr.id,
          amount,
          payment_method: method,
          concept: `Pago clase ${typeLbl}`,
        });
        showToast('Pago añadido', 'success');
        reloadPayments();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });

    document.getElementById('cli-enr-delete')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta inscripción? También se borrarán sus pagos asociados.')) return;
      try {
        for (const p of await fetchPayments('enrollment', enr.id)) {
          await deletePayment(p.id);
        }
        await deleteEnrollment(enr.id);
        showToast('Inscripción eliminada', 'success');
        closeModal();
        loadClasesTab(c);
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  }

  // ---- Ficha de booking (surf camp) ----
  async function openBookingDetailModal(c, bk) {
    const payments = await fetchPayments('booking', bk.id);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const pending = Math.max(0, Math.round((Number(bk.total_amount || 0) - totalPaid) * 100) / 100);

    openModal('Reserva surf camp', `
      <div style="min-width:340px">
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;margin-bottom:14px">
          <div style="font-weight:700;color:#0369a1">${esc(bk.camp_title) || 'Surf Camp'}</div>
          <div style="font-size:.78rem;color:#0369a1;margin-top:4px">Reservada: ${formatDate(bk.created_at)}</div>
          ${bk.guest_name ? `<div style="font-size:.78rem;color:#0369a1">A nombre de: ${esc(bk.guest_name)}</div>` : ''}
          <div style="margin-top:6px">${statusBadge(bk.status)}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;font-size:.82rem">
          <div style="padding:8px;background:#f0fdf4;border-radius:8px"><div style="color:#065f46;font-size:.7rem;text-transform:uppercase">Total</div><strong>${formatCurrency(bk.total_amount)}</strong></div>
          <div style="padding:8px;background:#eff6ff;border-radius:8px"><div style="color:#1e40af;font-size:.7rem;text-transform:uppercase">Pagado</div><strong>${formatCurrency(totalPaid)}</strong></div>
          <div style="padding:8px;background:${pending > 0 ? '#fef2f2' : '#f0fdf4'};border-radius:8px"><div style="color:${pending > 0 ? '#b91c1c' : '#065f46'};font-size:.7rem;text-transform:uppercase">Pendiente</div><strong>${formatCurrency(pending)}</strong></div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 4px">
          <label style="margin:0">Pagos</label>
          <button class="btn" id="cli-bk-add-pay" style="font-size:.74rem;padding:4px 10px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer">+ Pago</button>
        </div>
        <div id="cli-bk-payments">${paymentsListHtml(payments)}</div>

        <button class="btn red" id="cli-bk-close" style="margin-top:16px;width:100%;padding:9px">Cerrar</button>
      </div>
    `);

    const paymentsEl = document.getElementById('cli-bk-payments');
    const reloadPayments = async () => {
      const fresh = await fetchPayments('booking', bk.id);
      paymentsEl.innerHTML = paymentsListHtml(fresh);
      bindPaymentsListEvents(paymentsEl, c, fresh, reloadPayments);
    };
    bindPaymentsListEvents(paymentsEl, c, payments, reloadPayments);

    document.getElementById('cli-bk-close')?.addEventListener('click', () => closeModal());

    document.getElementById('cli-bk-add-pay')?.addEventListener('click', async () => {
      const amount = parseFloat(prompt('Importe a registrar (€):', pending > 0 ? pending.toFixed(2) : ''));
      if (!amount || amount <= 0) return;
      const method = prompt('Método (efectivo / tarjeta / transferencia / voucher):', 'efectivo');
      if (!method) return;
      try {
        await createPayment({
          reservation_type: 'booking',
          reference_id: bk.id,
          amount,
          payment_method: method,
          concept: `Pago surf camp ${bk.camp_title || ''}`,
        });
        showToast('Pago añadido', 'success');
        reloadPayments();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  }

  // ---- Ficha de alquiler ----
  async function openRentalDetailModal(c, r) {
    const payments = await fetchPayments('rental', r.id);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalRental = Number(r.total_amount || 0);
    const pending = Math.max(0, Math.round((totalRental - totalPaid) * 100) / 100);
    const equipName = r.equipment?.name || 'Material';

    const statusOptions = RENTAL_STATUS_OPTIONS
      .map(o => `<option value="${o.v}" ${o.v === r.status ? 'selected' : ''}>${o.l}</option>`).join('');

    openModal('Alquiler de material', `
      <div style="min-width:340px">
        <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px;margin-bottom:14px">
          <div style="font-weight:700;color:#6d28d9">${esc(equipName)}</div>
          <div style="font-size:.82rem;color:#6d28d9;margin-top:4px">${formatDate(r.date_start)} → ${formatDate(r.date_end)}</div>
          ${r.size ? `<div style="font-size:.78rem;color:#6d28d9">Talla: ${esc(r.size)}</div>` : ''}
          ${r.duration_key ? `<div style="font-size:.78rem;color:#6d28d9">Duración: ${esc(r.duration_key)}</div>` : ''}
        </div>

        <label>Estado</label>
        <select id="cli-rt-status" class="act-form-input" style="margin-bottom:14px">${statusOptions}</select>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;font-size:.82rem">
          <div style="padding:8px;background:#f0fdf4;border-radius:8px"><div style="color:#065f46;font-size:.7rem;text-transform:uppercase">Total</div><strong>${formatCurrency(totalRental)}</strong></div>
          <div style="padding:8px;background:#eff6ff;border-radius:8px"><div style="color:#1e40af;font-size:.7rem;text-transform:uppercase">Pagado</div><strong>${formatCurrency(totalPaid)}</strong></div>
          <div style="padding:8px;background:${pending > 0 ? '#fef2f2' : '#f0fdf4'};border-radius:8px"><div style="color:${pending > 0 ? '#b91c1c' : '#065f46'};font-size:.7rem;text-transform:uppercase">Pendiente</div><strong>${formatCurrency(pending)}</strong></div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 4px">
          <label style="margin:0">Pagos</label>
          <button class="btn" id="cli-rt-add-pay" style="font-size:.74rem;padding:4px 10px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer">+ Pago</button>
        </div>
        <div id="cli-rt-payments">${paymentsListHtml(payments)}</div>

        <button class="btn red" id="cli-rt-close" style="margin-top:16px;width:100%;padding:9px">Cerrar</button>
      </div>
    `);

    const paymentsEl = document.getElementById('cli-rt-payments');
    const reloadPayments = async () => {
      const fresh = await fetchPayments('rental', r.id);
      paymentsEl.innerHTML = paymentsListHtml(fresh);
      bindPaymentsListEvents(paymentsEl, c, fresh, reloadPayments);
    };
    bindPaymentsListEvents(paymentsEl, c, payments, reloadPayments);

    document.getElementById('cli-rt-close')?.addEventListener('click', () => closeModal());

    document.getElementById('cli-rt-status')?.addEventListener('change', async (e) => {
      try {
        await updateEquipmentReservationStatus(r.id, e.target.value);
        r.status = e.target.value;
        showToast('Estado actualizado', 'success');
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });

    document.getElementById('cli-rt-add-pay')?.addEventListener('click', async () => {
      const amount = parseFloat(prompt('Importe a registrar (€):', pending > 0 ? pending.toFixed(2) : ''));
      if (!amount || amount <= 0) return;
      const method = prompt('Método (efectivo / tarjeta / transferencia / voucher):', 'efectivo');
      if (!method) return;
      try {
        await createPayment({
          reservation_type: 'rental',
          reference_id: r.id,
          amount,
          payment_method: method,
          concept: `Pago alquiler ${equipName}`,
        });
        showToast('Pago añadido', 'success');
        reloadPayments();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  }

  async function loadPagosTab(c) {
    const el = container.querySelector('#cli-tab-content');
    try {
      // El historial se construye SOLO desde la tabla payments, donde cada pago
      // lleva su reservation_type (booking, bono, enrollment, rental, order, custom).
      // Así la categoría es siempre fiel al origen real del pago y no se infiere
      // de la tabla orders (que no sabe si fue camp, bono o producto).
      const payments = await fetchClientPayments(c.id);

      // Merge into unified timeline with domain info
      const timeline = [];

      // Domain colors & labels for type badges
      const DOMAIN_CONFIG = {
        enrollment: { label: 'Clase', color: '#22c55e', bg: '#f0fdf4' },
        rental:     { label: 'Alquiler', color: '#8b5cf6', bg: '#f5f3ff' },
        custom:     { label: 'Saldo a favor', color: '#f59e0b', bg: '#fffbeb' },
        bono:       { label: 'Bono', color: '#16a34a', bg: '#f0fdf4' },
        booking:    { label: 'Surf Camp', color: '#0ea5e9', bg: '#f0f9ff' },
        order:      { label: 'Tienda', color: '#f59e0b', bg: '#fffbeb' },
      };

      for (const p of payments) {
        const domain = p.reservation_type || 'otros';
        // Origen: 'web' (online, no editable) vs 'admin' (manual, editable)
        const isWeb = p.channel === 'web';
        timeline.push({
          paymentId: p.id,
          raw: p,
          date: p.payment_date || p.created_at,
          domain,
          type: DOMAIN_CONFIG[domain]?.label || domain,
          concept: p.concept || (domain === 'enrollment' ? 'Pago clase' : domain === 'custom' ? 'Saldo a favor' : domain === 'booking' ? 'Surf camp' : domain === 'bono' ? 'Bono de clases' : domain === 'order' ? 'Pedido tienda' : 'Pago'),
          amount: Number(p.amount),
          method: p.payment_method || '—',
          source: isWeb ? 'web' : 'admin',
        });
      }

      timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Split totals by domain category
      const servicioTotal = timeline.filter(t => ['enrollment', 'rental', 'bono'].includes(t.domain)).reduce((s, t) => s + t.amount, 0);
      const tiendaTotal = timeline.filter(t => t.domain === 'order').reduce((s, t) => s + t.amount, 0);
      const campTotal = timeline.filter(t => t.domain === 'booking').reduce((s, t) => s + t.amount, 0);
      const totalPaid = timeline.reduce((s, t) => s + t.amount, 0);
      const creditBalance = Number(c.credit_balance || 0);

      const METHOD_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', voucher: 'Voucher', online: 'Online', saldo: 'Saldo' };

      function domainBadge(domain) {
        const cfg = DOMAIN_CONFIG[domain];
        if (!cfg) return `<span style="font-size:.75rem;padding:2px 8px;border-radius:99px;background:#f1f5f9;color:#64748b">${domain}</span>`;
        return `<span style="font-size:.75rem;padding:2px 8px;border-radius:99px;background:${cfg.bg};color:${cfg.color};font-weight:600">${cfg.label}</span>`;
      }

      const rows = timeline.map((t, i) => {
        const isEditable = t.source === 'admin' && t.paymentId;
        const actionCell = isEditable
          ? `<td style="white-space:nowrap;text-align:right">
              <button class="cli-pay-edit-btn" data-idx="${i}" title="Editar" style="background:none;border:none;cursor:pointer;color:#0ea5e9;padding:4px 6px;border-radius:4px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="cli-pay-del-btn" data-idx="${i}" title="Eliminar" style="background:none;border:none;cursor:pointer;color:#dc2626;padding:4px 6px;border-radius:4px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </td>`
          : '<td></td>';
        return `<tr>
          <td>${formatDate(t.date)}</td>
          <td>${domainBadge(t.domain)}</td>
          <td>${esc(t.concept)}</td>
          <td style="font-weight:600;color:#065f46">+${formatCurrency(t.amount)}</td>
          <td>${METHOD_LABELS[t.method] || t.method}</td>
          <td><span class="status-badge ${t.source === 'web' ? 'active' : ''}">${t.source === 'web' ? 'Web' : 'Manual'}</span></td>
          ${actionCell}
        </tr>`;
      }).join('');

      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <h3 class="act-detail-section-title" style="margin:0">Historial de pagos (${timeline.length})</h3>
          <button class="btn red" id="cli-add-payment" style="font-size:.82rem;padding:6px 14px">+ Añadir pago</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
          <div class="act-form-card" style="padding:14px 18px;margin:0;background:#f0fdf4;border-color:#bbf7d0">
            <div style="font-size:.72rem;text-transform:uppercase;color:#065f46;font-weight:600;margin-bottom:2px">Servicios</div>
            <div style="font-size:1.3rem;font-family:'Bebas Neue',sans-serif;color:#065f46">${formatCurrency(servicioTotal)}</div>
            <div style="font-size:.7rem;color:#065f46">Clases, bonos, alquiler</div>
          </div>
          ${campTotal > 0 ? `<div class="act-form-card" style="padding:14px 18px;margin:0;background:#f0f9ff;border-color:#bae6fd">
            <div style="font-size:.72rem;text-transform:uppercase;color:#0369a1;font-weight:600;margin-bottom:2px">Surf Camps</div>
            <div style="font-size:1.3rem;font-family:'Bebas Neue',sans-serif;color:#0369a1">${formatCurrency(campTotal)}</div>
          </div>` : ''}
          ${tiendaTotal > 0 ? `<div class="act-form-card" style="padding:14px 18px;margin:0;background:#fffbeb;border-color:#fde68a">
            <div style="font-size:.72rem;text-transform:uppercase;color:#92400e;font-weight:600;margin-bottom:2px">Tienda</div>
            <div style="font-size:1.3rem;font-family:'Bebas Neue',sans-serif;color:#92400e">${formatCurrency(tiendaTotal)}</div>
            <div style="font-size:.7rem;color:#92400e">Productos online</div>
          </div>` : ''}
          <div class="act-form-card" style="padding:14px 18px;margin:0;background:${creditBalance > 0 ? '#fffbeb' : '#f8fafc'};border-color:${creditBalance > 0 ? '#fde68a' : '#e2e8f0'}">
            <div style="font-size:.72rem;text-transform:uppercase;color:${creditBalance > 0 ? '#92400e' : 'var(--color-muted)'};font-weight:600;margin-bottom:2px">Saldo a favor</div>
            <div style="font-size:1.3rem;font-family:'Bebas Neue',sans-serif;color:${creditBalance > 0 ? '#92400e' : 'var(--color-muted)'}">${formatCurrency(creditBalance)}</div>
          </div>
        </div>
        ${timeline.length ? `<div class="act-form-card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Importe</th><th>Método</th><th>Origen</th><th></th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>` : '<div class="act-form-card"><div class="admin-empty"><p>No hay pagos registrados</p></div></div>'}`;

      // Bind add payment button
      el.querySelector('#cli-add-payment')?.addEventListener('click', () => openAddPaymentModal(c));

      // Edit / delete payment
      el.querySelectorAll('.cli-pay-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx);
          const t = timeline[idx];
          if (!t?.raw) return;
          openPaymentEditModal(t.raw, { onSaved: () => loadPagosTab(c) });
        });
      });
      el.querySelectorAll('.cli-pay-del-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx);
          const t = timeline[idx];
          if (!t?.paymentId) return;
          if (!confirm(`¿Eliminar este pago de ${formatCurrency(t.amount)}?`)) return;
          try {
            await deletePayment(t.paymentId);
            showToast('Pago eliminado', 'success');
            loadPagosTab(c);
          } catch (err) {
            showToast('Error al eliminar: ' + (err.message || ''), 'error');
          }
        });
      });
    } catch (err) {
      el.innerHTML = `<div class="act-form-card"><p style="color:#b91c1c">Error cargando pagos: ${esc(err.message)}</p></div>`;
    }
  }

  async function loadReservasTab(c) {
    const el = container.querySelector('#cli-tab-content');
    try {
      const bookings = await fetchClientBookings(c.id);

      if (!bookings.length) {
        el.innerHTML = `
          <h3 class="act-detail-section-title">Surf Camps</h3>
          <div class="act-form-card">
            <div class="admin-empty"><p>Este cliente no tiene reservas de surf camp</p></div>
          </div>`;
        return;
      }

      const rows = bookings.map((b, i) => `<tr class="cli-row-click" data-idx="${i}" style="cursor:pointer">
        <td>${formatDate(b.created_at)}</td>
        <td>${esc(b.camp_title) || '—'}</td>
        <td>${formatCurrency(b.total_amount)}</td>
        <td>${formatCurrency(b.deposit_amount)}</td>
        <td>${statusBadge(b.status)}</td>
      </tr>`).join('');

      el.innerHTML = `
        <h3 class="act-detail-section-title">Surf Camps (${bookings.length})</h3>
        <div class="act-form-card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Surf Camp</th><th>Total</th><th>Señal</th><th>Estado</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;

      el.querySelectorAll('.cli-row-click').forEach(row => {
        row.addEventListener('click', () => {
          const idx = parseInt(row.dataset.idx);
          const bk = bookings[idx];
          if (bk) openBookingDetailModal(c, bk);
        });
      });
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

      const rows = rentals.map((r, i) => `<tr class="cli-row-click" data-idx="${i}" style="cursor:pointer">
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

      el.querySelectorAll('.cli-row-click').forEach(row => {
        row.addEventListener('click', () => {
          const idx = parseInt(row.dataset.idx);
          const r = rentals[idx];
          if (r) openRentalDetailModal(c, r);
        });
      });
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
          <h3 class="act-detail-section-title">Pedidos Tienda</h3>
          <div class="act-form-card">
            <div class="admin-empty"><p>Este cliente no tiene pedidos en la tienda</p></div>
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
        <h3 class="act-detail-section-title">Pedidos Tienda (${orders.length})</h3>
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
    const lastnameEl = container.querySelector('#cli-lastname');
    const phoneEl = container.querySelector('#cli-phone');
    const roleEl = container.querySelector('#cli-role');
    const addressEl = container.querySelector('#cli-address');
    const cityEl = container.querySelector('#cli-city');
    const postalEl = container.querySelector('#cli-postal');
    const canSwimEl = container.querySelector('#cli-can-swim');
    const hasInjuryEl = container.querySelector('#cli-has-injury');
    const injuryDetailEl = container.querySelector('#cli-injury-detail');
    const wetsuitSizeEl = container.querySelector('#cli-wetsuit-size');
    const birthdateEl = container.querySelector('#cli-birthdate');

    if (!fullnameEl) {
      showToast('Ve a la pestaña "Datos personales" para editar', 'error');
      return;
    }

    const fullname = fullnameEl.value.trim();
    const lastname = lastnameEl?.value?.trim() || '';
    const phone = phoneEl?.value?.trim() || null;
    const role = roleEl?.value || 'client';
    const address = addressEl?.value?.trim() || null;
    const city = cityEl?.value?.trim() || null;
    const postal_code = postalEl?.value?.trim() || null;
    const can_swim = canSwimEl?.value === 'true' ? true : canSwimEl?.value === 'false' ? false : null;
    const has_injury = hasInjuryEl?.value === 'true';
    const injury_detail = injuryDetailEl?.value?.trim() || null;
    const wetsuit_size = wetsuitSizeEl?.value || null;
    const birth_date = birthdateEl?.value || null;

    if (!fullname) {
      showToast('El nombre es obligatorio', 'error');
      return;
    }

    try {
      await updateProfile(c.id, {
        full_name: fullname,
        last_name: lastname,
        phone: phone,
        role: role,
        address: address,
        city: city,
        postal_code: postal_code,
        can_swim,
        has_injury,
        injury_detail,
        wetsuit_size,
        birth_date,
      });
      // Update local copy
      c.full_name = fullname;
      c.last_name = lastname;
      c.phone = phone;
      c.role = role;
      c.address = address;
      c.city = city;
      c.postal_code = postal_code;
      c.can_swim = can_swim;
      c.has_injury = has_injury;
      c.injury_detail = injury_detail;
      c.wetsuit_size = wetsuit_size;
      c.birth_date = birth_date;
      showToast('Cliente actualizado', 'success');
      renderDetail();
    } catch (err) {
      showToast('Error al guardar: ' + err.message, 'error');
    }
  }

  // ===================== ADD PAYMENT MODAL =====================
  async function openAddPaymentModal(c, preselectedType, preselectedId, suggestedAmount) {
    // Fetch bonos & enrollments in parallel for dropdowns
    const [bonos, enrollments] = await Promise.all([
      fetchClientBonos(c.id),
      fetchClientEnrollments(c.id),
    ]);

    // Enrich bonos with pricing info
    const enrichedBonos = bonos.map(b => {
      const expectedPrice = getPackPrice(b.class_type, b.total_credits);
      const deposit = DEPOSIT[b.class_type] || 15;
      const paid = Number(b.total_paid || 0) || (b.order_id ? deposit : 0);
      const pending = Math.max(0, expectedPrice - paid);
      return { ...b, expectedPrice, totalPaidReal: paid, pending, isFullyPaid: paid >= expectedPrice };
    });

    const activeBonos = enrichedBonos.filter(b => b.status === 'active' && !b.isFullyPaid);
    const activeEnrollments = enrollments.filter(e => ['confirmed', 'partial'].includes(e.status));

    const selectedType = preselectedType || 'bono';

    const bonoOptions = activeBonos.map(b =>
      `<option value="${b.id}" ${preselectedId === b.id ? 'selected' : ''}>${TYPE_LABELS[b.class_type] || b.class_type} — ${b.total_credits} clases (debe ${formatCurrency(b.pending)})</option>`
    ).join('');

    const enrollOptions = activeEnrollments.map(e => {
      const cls = e.surf_class || {};
      const label = `${cls.date || '—'} · ${TYPE_LABELS[cls.type] || cls.type || '—'} · ${esc(cls.title) || 'Clase'}`;
      return `<option value="${e.id}">${label}</option>`;
    }).join('');

    const defaultAmount = suggestedAmount || '';

    openModal('Añadir pago', `
      <form id="add-payment-form" class="trip-form" style="min-width:340px">
        <label style="font-weight:600;margin-bottom:4px">Tipo de pago</label>
        <div id="pay-type-tabs" style="display:flex;gap:6px;margin-bottom:16px">
          <button type="button" class="btn pay-type-tab ${selectedType === 'bono' ? 'red' : 'line'}" data-type="bono" style="flex:1;font-size:.78rem;padding:8px 6px">Pago bono</button>
          <button type="button" class="btn pay-type-tab ${selectedType === 'clase' ? 'red' : 'line'}" data-type="clase" style="flex:1;font-size:.78rem;padding:8px 6px">Pago clase</button>
          <button type="button" class="btn pay-type-tab ${selectedType === 'custom' ? 'red' : 'line'}" data-type="custom" style="flex:1;font-size:.78rem;padding:8px 6px">Personalizado</button>
        </div>

        <div id="pay-section-bono" style="${selectedType === 'bono' ? '' : 'display:none'}">
          <label>Seleccionar bono</label>
          <select id="pay-bono-select" class="act-form-input" style="margin-bottom:10px">
            ${bonoOptions || '<option value="">No hay bonos pendientes</option>'}
          </select>
        </div>

        <div id="pay-section-clase" style="${selectedType === 'clase' ? '' : 'display:none'}">
          <label>Seleccionar clase</label>
          <select id="pay-clase-select" class="act-form-input" style="margin-bottom:10px">
            ${enrollOptions || '<option value="">No hay clases pendientes</option>'}
          </select>
        </div>

        <div id="pay-section-custom" style="${selectedType === 'custom' ? '' : 'display:none'}">
          <label>Concepto</label>
          <input type="text" id="pay-concept" class="act-form-input" placeholder="Ej: Recarga saldo, Devolución…" style="margin-bottom:10px" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label>Importe (€)</label>
            <input type="number" id="pay-amount" class="act-form-input" step="0.01" min="0.01" value="${defaultAmount}" required placeholder="0.00" />
          </div>
          <div>
            <label>Método de pago</label>
            <select id="pay-method" class="act-form-input">
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="voucher">Voucher</option>
            </select>
          </div>
        </div>

        <button type="submit" class="btn red" style="margin-top:16px;width:100%;padding:10px;font-size:.9rem" id="pay-submit-btn">Registrar pago</button>
      </form>
    `);

    const form = document.getElementById('add-payment-form');
    let currentType = selectedType;

    // Update suggested amount when bono changes
    const updateBonoAmount = () => {
      const sel = document.getElementById('pay-bono-select');
      if (sel?.value) {
        const b = enrichedBonos.find(x => x.id === sel.value);
        if (b) document.getElementById('pay-amount').value = b.pending.toFixed(2);
      }
    };

    // Tab switching
    form.querySelectorAll('.pay-type-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentType = tab.dataset.type;
        form.querySelectorAll('.pay-type-tab').forEach(t => {
          t.classList.toggle('red', t.dataset.type === currentType);
          t.classList.toggle('line', t.dataset.type !== currentType);
        });
        document.getElementById('pay-section-bono').style.display = currentType === 'bono' ? '' : 'none';
        document.getElementById('pay-section-clase').style.display = currentType === 'clase' ? '' : 'none';
        document.getElementById('pay-section-custom').style.display = currentType === 'custom' ? '' : 'none';

        // Reset amount based on type
        if (currentType === 'bono') updateBonoAmount();
        else document.getElementById('pay-amount').value = '';
      });
    });

    document.getElementById('pay-bono-select')?.addEventListener('change', updateBonoAmount);

    // If bono preselected, set amount
    if (selectedType === 'bono' && !suggestedAmount) updateBonoAmount();

    // Submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = Number(document.getElementById('pay-amount').value);
      const method = document.getElementById('pay-method').value;

      if (!amount || amount <= 0) {
        showToast('El importe debe ser mayor que 0', 'error');
        return;
      }

      const submitBtn = document.getElementById('pay-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando…';

      try {
        if (currentType === 'bono') {
          const bonoId = document.getElementById('pay-bono-select')?.value;
          if (!bonoId) { showToast('Selecciona un bono', 'error'); submitBtn.disabled = false; submitBtn.textContent = 'Registrar pago'; return; }

          const bono = enrichedBonos.find(b => b.id === bonoId);
          const newTotalPaid = (bono?.totalPaidReal || 0) + amount;

          // Update bonos.total_paid
          const { error } = await supabase
            .from('bonos')
            .update({ total_paid: newTotalPaid })
            .eq('id', bonoId);
          if (error) throw error;

          // Pago del bono: referenciado al bono (no a un enrollment), tipo 'bono'
          await createPayment({
            reservation_type: 'bono',
            reference_id: bonoId,
            amount,
            payment_method: method,
            concept: `Pago bono ${TYPE_LABELS[bono?.class_type] || ''} (${bono?.total_credits} clases)`,
          });

          // If fully paid now, update enrollment statuses
          if (newTotalPaid >= (bono?.expectedPrice || 0)) {
            const bonoEnrollments = enrollments.filter(en => en.bono_id === bonoId && en.status === 'partial');
            for (const en of bonoEnrollments) {
              await supabase.from('class_enrollments').update({ status: 'paid' }).eq('id', en.id);
            }
          }

          showToast(`Pago de ${formatCurrency(amount)} registrado en bono`, 'success');

        } else if (currentType === 'clase') {
          const enrollId = document.getElementById('pay-clase-select')?.value;
          if (!enrollId) { showToast('Selecciona una clase', 'error'); submitBtn.disabled = false; submitBtn.textContent = 'Registrar pago'; return; }

          await createPayment({
            reservation_type: 'enrollment',
            reference_id: enrollId,
            amount,
            payment_method: method,
            concept: 'Pago clase',
          });

          showToast(`Pago de ${formatCurrency(amount)} registrado`, 'success');

        } else if (currentType === 'custom') {
          const concept = document.getElementById('pay-concept')?.value?.trim();
          if (!concept) {
            showToast('Escribe un concepto', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Registrar pago';
            return;
          }

          // Add to credit_balance
          const currentBalance = Number(c.credit_balance || 0);
          const newBalance = currentBalance + amount;
          const { error } = await supabase
            .from('profiles')
            .update({ credit_balance: newBalance })
            .eq('id', c.id);
          if (error) throw error;
          c.credit_balance = newBalance;

          // Create payment record so it shows in history
          await createPayment({
            reservation_type: 'custom',
            reference_id: c.id,
            amount,
            payment_method: method,
            concept,
          });

          showToast(`${formatCurrency(amount)} añadido al saldo a favor (total: ${formatCurrency(newBalance)})`, 'success');
        }

        closeModal();

        // Refresh current tab
        if (activeTab === 'bonos') loadBonosTab(c);
        else if (activeTab === 'pagos') loadPagosTab(c);
        else renderDetail();

      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Registrar pago';
      }
    });
  }

  // ===================== HELPERS =====================
  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  await renderList();
}
