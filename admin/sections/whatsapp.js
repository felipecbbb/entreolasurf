/* ============================================================
   WhatsApp Section — Conversaciones y leads del chatbot
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { showToast } from '../modules/ui.js';

const INTENT_LABELS = {
  faq: 'FAQ',
  consultar_bono: 'Consulta bono',
  consultar_disponibilidad: 'Disponibilidad',
  registrar_lead: 'Lead nuevo',
  derivar_humano: 'Handoff',
  unsupported_media: 'Audio/Imagen',
};

const LEAD_STATUS_LABELS = {
  new: 'Nuevo',
  contacted: 'Contactado',
  converted: 'Convertido',
  discarded: 'Descartado',
};

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function relTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'ahora mismo';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ===================== DATA =====================

async function fetchConversations(filter = '') {
  // Join contacts + session + last message via separate queries
  const { data: contacts, error } = await supabase
    .from('whatsapp_contacts')
    .select('id, phone, wa_name, profile_id, last_seen_at, blocked')
    .eq('blocked', false)
    .order('last_seen_at', { ascending: false })
    .limit(100);
  if (error) { console.warn('fetchConversations:', error.message); return []; }
  if (!contacts?.length) return [];

  const ids = contacts.map(c => c.id);

  const [sessRes, msgsRes, profRes] = await Promise.all([
    supabase.from('whatsapp_sessions').select('contact_id, handoff, handoff_reason, state').in('contact_id', ids),
    supabase.from('whatsapp_messages')
      .select('contact_id, direction, content, intent, created_at')
      .in('contact_id', ids)
      .order('created_at', { ascending: false })
      .limit(500),
    contacts.filter(c => c.profile_id).length
      ? supabase.from('profiles').select('id, full_name').in('id', contacts.filter(c => c.profile_id).map(c => c.profile_id))
      : Promise.resolve({ data: [] }),
  ]);

  const sessMap = {};
  for (const s of (sessRes.data || [])) sessMap[s.contact_id] = s;

  const lastMsgMap = {};
  const msgCountMap = {};
  for (const m of (msgsRes.data || [])) {
    if (!lastMsgMap[m.contact_id]) lastMsgMap[m.contact_id] = m;
    msgCountMap[m.contact_id] = (msgCountMap[m.contact_id] || 0) + 1;
  }

  const profMap = {};
  for (const p of (profRes.data || [])) profMap[p.id] = p;

  let rows = contacts.map(c => ({
    ...c,
    profile_name: c.profile_id ? profMap[c.profile_id]?.full_name : null,
    session: sessMap[c.id] || null,
    last_msg: lastMsgMap[c.id] || null,
    msg_count: msgCountMap[c.id] || 0,
  }));

  if (filter === 'handoff') rows = rows.filter(r => r.session?.handoff);
  else if (filter === 'identified') rows = rows.filter(r => r.profile_id);
  else if (filter === 'anonymous') rows = rows.filter(r => !r.profile_id);

  return rows;
}

async function fetchMessages(contactId) {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('id, direction, role, content, intent, tool_calls, error, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('fetchMessages:', error.message); return []; }
  return data || [];
}

async function reactivateBot(contactId) {
  const { error } = await supabase
    .from('whatsapp_sessions')
    .update({ handoff: false, handoff_reason: null, state: 'idle' })
    .eq('contact_id', contactId);
  if (error) throw error;
}

async function fetchLeads(status = '') {
  let q = supabase
    .from('whatsapp_leads')
    .select('id, contact_id, name, level, interest, availability, notes, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) { console.warn('fetchLeads:', error.message); return []; }
  if (!data?.length) return [];

  const ids = [...new Set(data.map(l => l.contact_id))];
  const { data: contacts } = await supabase
    .from('whatsapp_contacts')
    .select('id, phone, wa_name')
    .in('id', ids);
  const cMap = {};
  for (const c of (contacts || [])) cMap[c.id] = c;

  return data.map(l => ({ ...l, contact: cMap[l.contact_id] }));
}

async function updateLeadStatus(id, status) {
  const { error } = await supabase
    .from('whatsapp_leads')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

// ===================== RENDER =====================

export async function renderWhatsApp(container) {
  let activeTab = 'conversaciones'; // 'conversaciones' | 'leads'
  let convFilter = '';
  let leadFilter = '';
  let selectedContactId = null;

  function renderShell() {
    container.innerHTML = `
      <div class="wa-shell">
        <div class="wa-tabs">
          <button class="wa-tab ${activeTab === 'conversaciones' ? 'active' : ''}" data-tab="conversaciones">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
            Conversaciones
          </button>
          <button class="wa-tab ${activeTab === 'leads' ? 'active' : ''}" data-tab="leads">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Leads
          </button>
        </div>
        <div id="wa-body"></div>
      </div>
    `;
    container.querySelectorAll('.wa-tab').forEach(t => {
      t.addEventListener('click', () => {
        activeTab = t.dataset.tab;
        selectedContactId = null;
        renderShell();
        loadBody();
      });
    });
    loadBody();
  }

  function loadBody() {
    if (activeTab === 'conversaciones') {
      if (selectedContactId) renderChat();
      else renderConversationsList();
    } else {
      renderLeadsList();
    }
  }

  // ---- Conversations list ----
  async function renderConversationsList() {
    const body = container.querySelector('#wa-body');
    body.innerHTML = `<div class="admin-skeleton"><div class="admin-skeleton-row"><div class="admin-skeleton-block w-full h-card"></div></div></div>`;

    const rows = await fetchConversations(convFilter);

    const filterBtn = (k, l) => `<button class="wa-filter ${convFilter === k ? 'active' : ''}" data-f="${k}">${l}</button>`;

    body.innerHTML = `
      <div class="wa-filters">
        ${filterBtn('', 'Todas')}
        ${filterBtn('handoff', 'En handoff')}
        ${filterBtn('identified', 'Identificadas')}
        ${filterBtn('anonymous', 'Anónimas')}
      </div>
      ${!rows.length
        ? '<div class="admin-empty"><p>No hay conversaciones todavía.</p><p style="font-size:.85rem;color:var(--color-muted);margin-top:4px">Las conversaciones aparecen aquí cuando un cliente escribe al WhatsApp del bot.</p></div>'
        : `<div class="wa-list">${rows.map(r => {
            const name = r.profile_name || r.wa_name || r.phone;
            const isHandoff = r.session?.handoff;
            const last = r.last_msg;
            const lastSnippet = last?.content?.slice(0, 80) || '';
            const lastDir = last?.direction === 'inbound' ? '← ' : '→ ';
            const intentLbl = last?.intent ? INTENT_LABELS[last.intent] || last.intent : null;
            return `<div class="wa-row" data-id="${r.id}">
              <div class="wa-row-avatar ${r.profile_id ? 'identified' : ''}">${(name || '?')[0].toUpperCase()}</div>
              <div class="wa-row-main">
                <div class="wa-row-head">
                  <strong class="wa-row-name">${esc(name)}</strong>
                  <span class="wa-row-time">${relTime(r.last_seen_at)}</span>
                </div>
                <div class="wa-row-sub">
                  <span class="wa-row-phone">${esc(r.phone)}</span>
                  ${r.profile_id ? '<span class="wa-pill wa-pill-id">REGISTRADO</span>' : '<span class="wa-pill wa-pill-anon">SIN CUENTA</span>'}
                  ${isHandoff ? '<span class="wa-pill wa-pill-handoff">PENDIENTE HUMANO</span>' : ''}
                  ${intentLbl ? `<span class="wa-pill wa-pill-intent">${esc(intentLbl)}</span>` : ''}
                </div>
                ${lastSnippet ? `<div class="wa-row-snippet">${lastDir}${esc(lastSnippet)}</div>` : ''}
              </div>
              <div class="wa-row-meta">
                <span class="wa-row-count">${r.msg_count} msg</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>
              </div>
            </div>`;
          }).join('')}</div>`
      }
    `;

    body.querySelectorAll('.wa-filter').forEach(b => b.addEventListener('click', () => {
      convFilter = b.dataset.f;
      renderConversationsList();
    }));
    body.querySelectorAll('.wa-row').forEach(r => r.addEventListener('click', () => {
      selectedContactId = r.dataset.id;
      renderChat();
    }));
  }

  // ---- Chat view (read-only) ----
  async function renderChat() {
    const body = container.querySelector('#wa-body');
    body.innerHTML = `<div class="admin-skeleton"><div class="admin-skeleton-row"><div class="admin-skeleton-block w-full h-card"></div></div></div>`;

    const [{ data: contact }, msgs, { data: session }] = await Promise.all([
      supabase.from('whatsapp_contacts').select('*').eq('id', selectedContactId).single(),
      fetchMessages(selectedContactId),
      supabase.from('whatsapp_sessions').select('*').eq('contact_id', selectedContactId).maybeSingle(),
    ]);

    let profileName = null;
    if (contact?.profile_id) {
      const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', contact.profile_id).maybeSingle();
      profileName = p?.full_name;
    }

    const displayName = profileName || contact?.wa_name || contact?.phone || '—';
    const isHandoff = session?.handoff;
    const waLink = `https://wa.me/${(contact?.phone || '').replace(/[^0-9]/g, '')}`;

    body.innerHTML = `
      <div class="wa-chat">
        <div class="wa-chat-header">
          <button class="wa-back" id="wa-back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="wa-chat-header-info">
            <strong>${esc(displayName)}</strong>
            <div class="wa-chat-header-meta">
              <span>${esc(contact?.phone || '')}</span>
              ${contact?.profile_id ? '<span class="wa-pill wa-pill-id">REGISTRADO</span>' : '<span class="wa-pill wa-pill-anon">SIN CUENTA</span>'}
              ${isHandoff ? '<span class="wa-pill wa-pill-handoff">EN HANDOFF</span>' : '<span class="wa-pill wa-pill-active">BOT ACTIVO</span>'}
            </div>
          </div>
          <div class="wa-chat-header-actions">
            <a class="btn line wa-action-btn" href="${waLink}" target="_blank" rel="noopener" title="Abrir en Business Suite">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Business Suite
            </a>
            ${isHandoff ? `<button class="btn red wa-action-btn" id="wa-reactivate">Reactivar bot</button>` : ''}
          </div>
        </div>

        ${isHandoff && session?.handoff_reason ? `
          <div class="wa-handoff-banner">
            <strong>Motivo del handoff:</strong> ${esc(session.handoff_reason)}
          </div>` : ''}

        <div class="wa-chat-body" id="wa-chat-scroll">
          ${msgs.length
            ? msgs.map(m => {
                const isIn = m.direction === 'inbound';
                const intentLbl = m.intent ? INTENT_LABELS[m.intent] || m.intent : null;
                const toolCallsHtml = m.tool_calls
                  ? `<div class="wa-tool-calls">${(Array.isArray(m.tool_calls) ? m.tool_calls : []).map(t => `<code>${esc(t.name)}(${esc(JSON.stringify(t.input || {}))})</code>`).join('')}</div>`
                  : '';
                return `<div class="wa-msg ${isIn ? 'in' : 'out'}">
                  <div class="wa-msg-bubble">
                    <div class="wa-msg-content">${esc(m.content)}</div>
                    ${toolCallsHtml}
                    ${m.error ? `<div class="wa-msg-error">⚠ ${esc(m.error)}</div>` : ''}
                  </div>
                  <div class="wa-msg-meta">
                    ${intentLbl ? `<span class="wa-msg-intent">${esc(intentLbl)}</span>` : ''}
                    <span class="wa-msg-time">${fmtTime(m.created_at)}</span>
                  </div>
                </div>`;
              }).join('')
            : '<div class="admin-empty"><p>Sin mensajes</p></div>'
          }
        </div>

        <div class="wa-chat-footer">
          <p class="wa-footer-hint">
            Para responder al cliente, abre <strong>Meta Business Suite</strong> (web o app móvil). Este panel es solo lectura: ves el historial del bot y puedes reactivarlo cuando termines de atender manualmente.
          </p>
        </div>
      </div>
    `;

    body.querySelector('#wa-back')?.addEventListener('click', () => {
      selectedContactId = null;
      renderConversationsList();
    });
    body.querySelector('#wa-reactivate')?.addEventListener('click', async () => {
      if (!confirm('¿Reactivar el bot para esta conversación? El bot volverá a responder los próximos mensajes del cliente.')) return;
      try {
        await reactivateBot(selectedContactId);
        showToast('Bot reactivado', 'success');
        renderChat();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });

    // Auto-scroll al final
    const scroll = body.querySelector('#wa-chat-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  // ---- Leads list ----
  async function renderLeadsList() {
    const body = container.querySelector('#wa-body');
    body.innerHTML = `<div class="admin-skeleton"><div class="admin-skeleton-row"><div class="admin-skeleton-block w-full h-card"></div></div></div>`;

    const rows = await fetchLeads(leadFilter);
    const filterBtn = (k, l) => `<button class="wa-filter ${leadFilter === k ? 'active' : ''}" data-f="${k}">${l}</button>`;

    body.innerHTML = `
      <div class="wa-filters">
        ${filterBtn('', 'Todos')}
        ${filterBtn('new', 'Nuevos')}
        ${filterBtn('contacted', 'Contactados')}
        ${filterBtn('converted', 'Convertidos')}
        ${filterBtn('discarded', 'Descartados')}
      </div>
      ${!rows.length
        ? '<div class="admin-empty"><p>Sin leads todavía.</p><p style="font-size:.85rem;color:var(--color-muted);margin-top:4px">El bot crea leads cuando un nuevo interesado (sin cuenta) pregunta por probar clases.</p></div>'
        : `<div class="act-form-card" style="padding:0;overflow:hidden">
            <div class="table-wrap">
              <table>
                <thead><tr>
                  <th>Fecha</th><th>Nombre</th><th>Teléfono</th><th>Nivel</th>
                  <th>Interés</th><th>Disponibilidad</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  ${rows.map(l => `
                    <tr>
                      <td>${relTime(l.created_at)}</td>
                      <td>${esc(l.name) || '—'}</td>
                      <td>${esc(l.contact?.phone) || '—'}</td>
                      <td>${esc(l.level) || '—'}</td>
                      <td>${esc(l.interest) || '—'}</td>
                      <td>${esc(l.availability) || '—'}</td>
                      <td>
                        <select class="wa-lead-status" data-id="${l.id}">
                          ${Object.entries(LEAD_STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${v}</option>`).join('')}
                        </select>
                      </td>
                      <td>
                        <a class="btn line" href="https://wa.me/${(l.contact?.phone || '').replace(/[^0-9]/g, '')}" target="_blank" rel="noopener" style="font-size:.72rem;padding:4px 10px">WhatsApp</a>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>`
      }
    `;

    body.querySelectorAll('.wa-filter').forEach(b => b.addEventListener('click', () => {
      leadFilter = b.dataset.f;
      renderLeadsList();
    }));
    body.querySelectorAll('.wa-lead-status').forEach(s => s.addEventListener('change', async (e) => {
      try {
        await updateLeadStatus(e.target.dataset.id, e.target.value);
        showToast('Estado actualizado', 'success');
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    }));
  }

  renderShell();
}
