/* ============================================================
   Material Section — Rental equipment catalog + detail
   ============================================================ */
import { openModal, closeModal, showToast, formatDate, formatCurrency } from '../modules/ui.js';
const RENTAL_DEPOSIT = 5;
import { supabase } from '/lib/supabase.js';

// ---- API helpers ----
async function fetchEquipment() {
  const { data, error } = await supabase
    .from('rental_equipment')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function upsertEquipment(item) {
  item.updated_at = new Date().toISOString();
  if (item.id) {
    const id = item.id;
    delete item.id;
    const { data, error } = await supabase.from('rental_equipment').update(item).eq('id', id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase.from('rental_equipment').insert(item).select().single();
    if (error) throw error;
    return data;
  }
}

async function deleteEquipment(id) {
  const { error } = await supabase.from('rental_equipment').delete().eq('id', id);
  if (error) throw error;
}

async function fetchEquipmentReservations(equipmentId) {
  const { data, error } = await supabase
    .from('equipment_reservations')
    .select('*')
    .eq('equipment_id', equipmentId)
    .order('date_start', { ascending: false });
  if (error) { console.warn('fetchEquipmentReservations:', error.message); return []; }
  return data || [];
}

const TYPE_ICONS = {
  con_talla: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  basico: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
};

const TYPE_LABELS = {
  con_talla: 'Con talla',
  basico: 'Básico',
};

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function renderMaterial(container) {
  let selectedItem = null;
  let activeTab = 'descripcion';

  // ===================== LIST VIEW =====================
  async function renderList() {
    selectedItem = null;
    const items = await fetchEquipment();
    const count = items.length;

    container.innerHTML = `
      <div class="act-list-page">
        <div class="act-list-header">
          <h2 class="act-list-title">Material (${count})</h2>
          <div class="act-list-actions">
            <button class="act-icon-btn" id="mat-add" title="Añadir material">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>

        <div class="act-table">
          <div class="act-table-head">
            <span class="act-col-img">Imagen</span>
            <span class="act-col-title">Título</span>
            <span class="mat-col-type">Tipo</span>
            <span class="act-col-date">Fecha de creación</span>
            <span class="act-col-tags">Etiquetas</span>
          </div>
          ${items.length ? items.map(item => {
            const dateStr = new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const tags = item.tags || [];
            return `
              <div class="act-table-row" data-id="${item.id}">
                <span class="act-col-img">
                  ${item.image_url
                    ? `<img src="${esc(item.image_url)}" class="mat-img-thumb" alt="" />`
                    : `<div class="act-img-placeholder" style="border-color:#0ea5e9">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      </div>`}
                </span>
                <span class="act-col-title">
                  <strong class="act-name">${esc(item.name)}</strong>
                  <span class="act-status-badge ${item.active ? 'active' : 'inactive'}">${item.active ? 'Activado' : 'Desactivado'}</span>
                </span>
                <span class="mat-col-type">
                  <span class="mat-type-badge">${TYPE_ICONS[item.type] || ''} ${TYPE_LABELS[item.type] || item.type}</span>
                </span>
                <span class="act-col-date">${dateStr}</span>
                <span class="act-col-tags">
                  ${tags.slice(0, 3).map(t => `<span class="act-tag">${esc(t)}</span>`).join('')}
                </span>
              </div>`;
          }).join('') : '<div class="admin-empty" style="padding:40px"><p>No hay material registrado</p></div>'}
        </div>
      </div>`;

    // Row click → detail
    container.querySelectorAll('.act-table-row').forEach(row => {
      row.addEventListener('click', () => {
        const item = items.find(i => i.id === row.dataset.id);
        if (item) {
          selectedItem = item;
          activeTab = 'descripcion';
          renderDetail();
        }
      });
    });

    // Add new
    container.querySelector('#mat-add')?.addEventListener('click', () => {
      selectedItem = {
        id: null,
        name: '',
        type: 'basico',
        description: '',
        image_url: null,
        price_hour: 0,
        price_day: 0,
        deposit: 0,
        stock: 1,
        sizes: [],
        tags: [],
        active: true,
        created_at: new Date().toISOString(),
      };
      activeTab = 'descripcion';
      renderDetail();
    });
  }

  // ===================== DETAIL VIEW =====================
  async function renderDetail() {
    const item = selectedItem;
    if (!item) return renderList();
    const isNew = !item.id;

    const TABS = [
      { group: 'CONTENIDO', items: [
        { id: 'descripcion', label: 'Descripción', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
        { id: 'precios', label: 'Precios y stock', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
        { id: 'tallas', label: 'Tallas / Variantes', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>' },
      ]},
      { group: 'OPERACIONES', items: [
        { id: 'reservas', label: 'Reservas', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
      ]},
    ];

    let tabContent = '';
    if (activeTab === 'descripcion') tabContent = renderDescripcionTab(item);
    else if (activeTab === 'precios') tabContent = renderPreciosTab(item);
    else if (activeTab === 'tallas') tabContent = renderTallasTab(item);
    else if (activeTab === 'reservas') tabContent = '<div class="act-form-card"><p style="color:var(--color-muted)">Cargando reservas…</p></div>';

    container.innerHTML = `
      <div class="act-detail-page">
        <div class="act-detail-topbar">
          <button class="act-back-btn" id="mat-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="act-detail-topbar-info">
            <strong class="act-detail-topbar-name">${esc(item.name) || 'Nuevo material'}</strong>
            <div class="act-detail-topbar-meta">
              <span class="act-status-badge ${item.active ? 'active' : 'inactive'}">${item.active ? 'Activado' : 'Desactivado'}</span>
              <span class="mat-type-badge small">${TYPE_ICONS[item.type] || ''} ${TYPE_LABELS[item.type] || item.type}</span>
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

          <main class="act-detail-main" id="mat-tab-content">
            ${tabContent}
          </main>

          <aside class="act-detail-actions">
            <button class="act-action-btn primary" id="mat-save">
              <span>${isNew ? 'Crear' : 'Guardar'}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            </button>
            <button class="act-action-link" id="mat-toggle-status">
              <span>${item.active ? 'Desactivar' : 'Activar'}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${!isNew ? `<button class="act-action-link danger" id="mat-delete">
              <span>Eliminar</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>` : ''}

            ${!isNew ? `<div style="margin-top:16px">
              <div class="act-nav-group-label">STOCK</div>
              <p class="cli-detail-note" style="font-size:.95rem;font-weight:600;color:var(--color-navy)">
                ${item.stock} unidades
              </p>
            </div>` : ''}
          </aside>
        </div>
      </div>`;

    // ---- Events ----
    container.querySelector('#mat-back').addEventListener('click', () => renderList());
    container.querySelectorAll('.act-nav-item').forEach(nav => {
      nav.addEventListener('click', (e) => {
        e.preventDefault();
        activeTab = nav.dataset.tab;
        renderDetail();
      });
    });

    container.querySelector('#mat-save')?.addEventListener('click', () => saveItem(item));
    container.querySelector('#mat-toggle-status')?.addEventListener('click', async () => {
      item.active = !item.active;
      if (item.id) {
        try {
          await upsertEquipment({ id: item.id, active: item.active, updated_at: new Date().toISOString() });
          showToast(item.active ? 'Material activado' : 'Material desactivado', 'success');
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
          item.active = !item.active;
        }
      }
      renderDetail();
    });

    container.querySelector('#mat-delete')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar "${item.name}"? Esta acción no se puede deshacer.`)) return;
      try {
        await deleteEquipment(item.id);
        showToast('Material eliminado', 'success');
        renderList();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });

    // Load async tabs
    if (activeTab === 'reservas' && item.id) loadReservasTab(item);
  }

  // ===================== TABS =====================

  function renderDescripcionTab(item) {
    return `
      <h3 class="act-detail-section-title">Descripción</h3>
      <div class="act-form-card">
        <div class="act-form-field">
          <label class="act-form-label">NOMBRE</label>
          <input type="text" class="act-form-input" id="mat-name" value="${esc(item.name)}" placeholder="Ej: Tabla de Surf Softboard" />
        </div>
        <div class="act-form-field">
          <label class="act-form-label">TIPO</label>
          <select class="act-form-input" id="mat-type" style="cursor:pointer">
            <option value="basico" ${item.type === 'basico' ? 'selected' : ''}>Básico — sin variantes de talla</option>
            <option value="con_talla" ${item.type === 'con_talla' ? 'selected' : ''}>Con talla — tiene variantes de talla/medida</option>
          </select>
        </div>
        <div class="act-form-field">
          <label class="act-form-label">DESCRIPCIÓN</label>
          <textarea class="act-form-input" id="mat-description" rows="4" placeholder="Descripción del material…" style="resize:vertical">${esc(item.description)}</textarea>
        </div>
        <div class="act-form-field">
          <label class="act-form-label">URL DE IMAGEN</label>
          <input type="url" class="act-form-input" id="mat-image" value="${esc(item.image_url)}" placeholder="https://..." />
          ${item.image_url ? `<img src="${esc(item.image_url)}" style="margin-top:8px;max-width:200px;border-radius:8px" alt="" />` : ''}
        </div>
        <div class="act-form-field">
          <label class="act-form-label">ETIQUETAS</label>
          <input type="text" class="act-form-input" id="mat-tags" value="${(item.tags || []).join(', ')}" placeholder="surf, tabla, principiante" />
          <small class="act-form-hint">Separadas por coma. Se usarán para filtrar en el frontend.</small>
        </div>
      </div>`;
  }

  function renderPreciosTab(item) {
    const pricing = item.pricing || {};
    // Standard durations (shown by default even if price is 0)
    const STANDARD = { '1h': '1 hora', '2h': '2 horas', '4h': '4 horas', '1d': '1 día', '1w': '1 semana', '2w': '2 semanas', '1m': '1 mes' };
    // Get all keys: standard ones + any custom ones from DB
    const allKeys = [...new Set([...Object.keys(STANDARD), ...Object.keys(pricing)])];
    // Only show keys that are in STANDARD or have a price > 0
    const activeKeys = allKeys.filter(k => k in STANDARD || (pricing[k] && pricing[k] > 0));

    return `
      <h3 class="act-detail-section-title">Precios y stock</h3>
      <div class="act-form-card">
        <h4 style="font-family:'Space Grotesk',sans-serif;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--color-muted,#888);margin:0 0 12px">Tarifas por duración</h4>
        <div id="mat-durations-list">
          ${activeKeys.map(key => `
            <div class="mat-dur-row" data-key="${esc(key)}" style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px">
              <div class="act-form-field" style="flex:1;margin:0">
                <label class="act-form-label">${esc(STANDARD[key] || key).toUpperCase()}</label>
                <input type="number" class="act-form-input mat-pricing-input" data-key="${esc(key)}" value="${pricing[key] || 0}" step="0.01" min="0" placeholder="0" />
              </div>
              ${!(key in STANDARD) ? `<button class="mat-dur-remove" data-key="${esc(key)}" title="Eliminar" style="align-self:flex-end;padding:8px;cursor:pointer;background:none;border:none">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>` : ''}
            </div>
          `).join('')}
        </div>
        <div id="mat-custom-durations"></div>
        <button class="tar-add-tier-btn" id="mat-add-duration" style="margin-top:12px">+ Añadir duración personalizada</button>
      </div>
      <div class="act-form-card" style="margin-top:16px">
        <div class="cli-form-row">
          <div class="act-form-field">
            <label class="act-form-label">DEPÓSITO ONLINE (€)</label>
            <input type="number" class="act-form-input" id="mat-deposit" value="${item.deposit ?? 5}" step="0.01" min="0" />
            <small class="act-form-hint">Se cobra online al reservar. El resto se paga al recoger el material.</small>
          </div>
          <div class="act-form-field">
            <label class="act-form-label">STOCK (unidades)</label>
            <input type="number" class="act-form-input" id="mat-stock" value="${item.stock || 1}" min="0" />
          </div>
        </div>
      </div>`;
  }

  function renderTallasTab(item) {
    const sizes = item.sizes || [];
    const isSized = item.type === 'con_talla';

    if (!isSized) {
      return `
        <h3 class="act-detail-section-title">Tallas / Variantes</h3>
        <div class="act-form-card">
          <div class="admin-empty" style="padding:30px">
            <p>Este material es de tipo <strong>Básico</strong> y no tiene variantes de talla.</p>
            <p style="font-size:.85rem;margin-top:8px">Cambia el tipo a "Con talla" en la pestaña Descripción para gestionar tallas.</p>
          </div>
        </div>`;
    }

    return `
      <h3 class="act-detail-section-title">Tallas / Variantes</h3>
      <div class="act-form-card">
        <small class="act-form-hint" style="margin-bottom:16px;display:block">Define las tallas o medidas disponibles para este material. El cliente elegirá una al reservar.</small>
        <div id="mat-sizes-list" class="mat-sizes-list">
          ${sizes.map((s, i) => `
            <div class="mat-size-row" data-index="${i}">
              <input type="text" class="act-form-input mat-size-input" value="${esc(s)}" placeholder="Ej: M, L, 7'0..." />
              <button class="mat-size-remove" data-index="${i}" title="Eliminar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          `).join('')}
        </div>
        <button class="tar-add-tier-btn" id="mat-add-size" style="margin-top:12px">+ Añadir talla</button>
      </div>`;
  }

  async function loadReservasTab(item) {
    const el = container.querySelector('#mat-tab-content');
    try {
      const reservations = await fetchEquipmentReservations(item.id);

      if (!reservations.length) {
        el.innerHTML = `
          <h3 class="act-detail-section-title">Reservas</h3>
          <div class="act-form-card">
            <div class="admin-empty"><p>No hay reservas para este material</p></div>
          </div>`;
        return;
      }

      const rows = reservations.map(r => `<tr>
        <td>${formatDate(r.date_start)}</td>
        <td>${formatDate(r.date_end)}</td>
        <td>${r.size || '—'}</td>
        <td>${r.quantity}</td>
        <td>${formatCurrency(r.total_amount)}</td>
        <td>${r.guest_name || '—'}</td>
        <td><span class="admin-badge" data-status="${r.status}">${{
          pending: 'Pendiente', confirmed: 'Confirmada', active: 'Activa', returned: 'Devuelto', cancelled: 'Cancelada'
        }[r.status] || r.status}</span></td>
      </tr>`).join('');

      el.innerHTML = `
        <h3 class="act-detail-section-title">Reservas (${reservations.length})</h3>
        <div class="act-form-card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Desde</th><th>Hasta</th><th>Talla</th><th>Cant.</th><th>Total</th><th>Cliente</th><th>Estado</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="act-form-card"><p style="color:#b91c1c">Error: ${esc(err.message)}</p></div>`;
    }
  }

  // ===================== SAVE =====================
  async function saveItem(item) {
    // Read from DOM if available, otherwise keep existing value
    const name = container.querySelector('#mat-name')?.value?.trim() || item.name;
    const type = container.querySelector('#mat-type')?.value || item.type;
    const description = container.querySelector('#mat-description')?.value?.trim() ?? item.description;
    const image_url = container.querySelector('#mat-image')?.value?.trim() || item.image_url;
    const tagsStr = container.querySelector('#mat-tags')?.value;
    const deposit = container.querySelector('#mat-deposit')
      ? parseFloat(container.querySelector('#mat-deposit').value)
      : item.deposit;
    const stock = container.querySelector('#mat-stock')
      ? parseInt(container.querySelector('#mat-stock').value)
      : item.stock;

    // Pricing — only read from DOM if pricing inputs exist
    const pricingInputs = container.querySelectorAll('.mat-pricing-input');
    let pricing = item.pricing || {};
    if (pricingInputs.length) {
      pricing = {};
      pricingInputs.forEach(input => {
        const val = parseFloat(input.value) || 0;
        if (val > 0) pricing[input.dataset.key] = val;
      });
    }

    // Custom pricing rows
    const customRows = container.querySelectorAll('.mat-custom-dur-row');
    if (customRows.length) {
      customRows.forEach(row => {
        const label = row.querySelector('.mat-dur-label')?.value?.trim();
        const price = parseFloat(row.querySelector('.mat-dur-price')?.value) || 0;
        if (label && price > 0) pricing[label] = price;
      });
    }

    // Sizes
    const sizeInputs = container.querySelectorAll('.mat-size-input');
    let sizes = item.sizes || [];
    if (sizeInputs.length || activeTab === 'tallas') {
      sizes = Array.from(sizeInputs).map(i => i.value.trim()).filter(Boolean);
    }

    if (!name) {
      showToast('El nombre es obligatorio', 'error');
      return;
    }

    const tags = tagsStr != null ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : (item.tags || []);
    const slug = item.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const obj = {
      name, slug, type: type || 'basico', description: description || null,
      image_url: image_url || null, pricing, deposit: deposit ?? 5, stock: stock || 0,
      sizes, tags, active: item.active,
    };

    if (item.id) obj.id = item.id;

    try {
      const saved = await upsertEquipment(obj);
      if (!item.id) {
        showToast('Material creado', 'success');
        renderList();
      } else {
        Object.assign(item, saved || obj);
        showToast('Material guardado', 'success');
        renderDetail();
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  // ===================== SIZE MANAGEMENT (delegated events) =====================
  container.addEventListener('click', (e) => {
    // Add size
    if (e.target.closest('#mat-add-size')) {
      const list = container.querySelector('#mat-sizes-list');
      if (!list) return;
      const idx = list.children.length;
      const div = document.createElement('div');
      div.className = 'mat-size-row';
      div.dataset.index = idx;
      div.innerHTML = `
        <input type="text" class="act-form-input mat-size-input" value="" placeholder="Ej: M, L, 7'0..." />
        <button class="mat-size-remove" data-index="${idx}" title="Eliminar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;
      list.appendChild(div);
      div.querySelector('input').focus();
      return;
    }

    // Remove size
    const removeBtn = e.target.closest('.mat-size-remove');
    if (removeBtn) {
      removeBtn.closest('.mat-size-row')?.remove();
      return;
    }

    // Add custom duration
    if (e.target.closest('#mat-add-duration')) {
      const customArea = container.querySelector('#mat-custom-durations');
      if (!customArea) return;
      const div = document.createElement('div');
      div.className = 'mat-custom-dur-row';
      div.style.cssText = 'display:flex;gap:8px;align-items:flex-end;margin-bottom:8px';
      div.innerHTML = `
        <div class="act-form-field" style="flex:1;margin:0">
          <label class="act-form-label">NOMBRE</label>
          <input type="text" class="act-form-input mat-dur-label" placeholder="Ej: 3 días, 2 semanas..." />
        </div>
        <div class="act-form-field" style="flex:1;margin:0">
          <label class="act-form-label">PRECIO (€)</label>
          <input type="number" class="act-form-input mat-dur-price" value="0" step="0.01" min="0" />
        </div>
        <button class="mat-dur-remove-custom" title="Eliminar" style="padding:8px;cursor:pointer;background:none;border:none;margin-bottom:4px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;
      customArea.appendChild(div);
      div.querySelector('.mat-dur-label').focus();
      return;
    }

    // Remove custom duration row
    if (e.target.closest('.mat-dur-remove-custom')) {
      e.target.closest('.mat-custom-dur-row')?.remove();
      return;
    }

    // Remove standard duration with price
    if (e.target.closest('.mat-dur-remove')) {
      e.target.closest('.mat-dur-row')?.remove();
      return;
    }
  });

  await renderList();
}
