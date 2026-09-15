/* ============================================================
   Lista de espera de clases
   ------------------------------------------------------------
   Cuando no hay ninguna clase disponible, el cliente se quedaba
   mirando un calendario vacío y se iba. Aquí vive el cuadro que
   recoge sus datos para avisarle en cuanto se publiquen fechas.

   Se usa en dos sitios (mismo cuadro, mismo alta):
   · lib/class-picker.js  — al comprar un bono y elegir día
   · mi-cuenta/tabs/calendar.js — calendario del cliente

   El admin lo enciende y lo apaga en Ajustes (site_settings).
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { getProfile, getSession } from '/lib/auth-client.js';
import { TYPE_LABELS, showToast } from '/lib/utils.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// El ajuste se consulta una vez por carga de página, no por render.
let settingsPromise = null;
export function getWaitlistSettings() {
  if (!settingsPromise) {
    settingsPromise = supabase
      .from('site_settings')
      .select('waitlist_enabled, waitlist_title, waitlist_text')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        // Si la tabla aún no existe (migración sin aplicar) el cuadro
        // simplemente no sale: nunca debe tumbar el calendario.
        if (error) return { waitlist_enabled: false };
        return data || { waitlist_enabled: true };
      })
      .catch(() => ({ waitlist_enabled: false }));
  }
  return settingsPromise;
}

export async function isWaitlistEnabled() {
  return !!(await getWaitlistSettings()).waitlist_enabled;
}

/* ---- Alta ---- */
export async function joinWaitlist({ name, email, phone, classType, wantsWhatsapp, userId, source }) {
  const row = {
    name: String(name || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    phone: String(phone || '').trim() || null,
    class_type: classType || '',   // '' = cualquier clase (ver la clave única)
    wants_whatsapp: wantsWhatsapp !== false,
    user_id: userId || null,
    source: source || 'class-picker',
  };
  if (!row.name || !row.email) throw new Error('Faltan nombre o email');

  // Reapuntarse actualiza los datos en vez de fallar por la clave única
  // (email, class_type). Si la carrera la gana otro alta idéntica, para el
  // cliente el resultado es el mismo: está apuntado.
  const { error } = await supabase
    .from('class_waitlist')
    .upsert(row, { onConflict: 'email,class_type', ignoreDuplicates: false });

  if (error && !/duplicate key/i.test(error.message || '')) throw error;
}

/* ---- Cuadro ---- */
// `variant`: 'full' pinta el formulario; 'oneclick' el botón para quien ya
// tiene sesión y todos sus datos (lo pide Felipe: un clic y dentro).
export function waitlistBoxHtml({ classType, profile, title, text } = {}) {
  const tipo = classType ? (TYPE_LABELS[classType] || classType) : 'clases';
  const heading = title || 'No hay clases disponibles ahora mismo';
  const lead = text || `Déjanos tus datos y te avisamos en cuanto publiquemos nuevas fechas de ${esc(tipo)}.`;
  const completo = profile && profile.full_name && profile.email && profile.phone;

  const cuerpo = completo ? `
      <p class="wl-asuser">Te avisaremos en <strong>${esc(profile.email)}</strong>${profile.phone ? ` · ${esc(profile.phone)}` : ''}</p>
      <label class="wl-check">
        <input type="checkbox" class="wl-wa" checked>
        <span>Quiero recibir información por WhatsApp y unirme a la comunidad</span>
      </label>
      <button type="button" class="wl-submit wl-oneclick">Avísame de las próximas fechas</button>
      <button type="button" class="wl-edit">Usar otros datos</button>
    ` : `
      <div class="wl-fields">
        <label class="wl-field">
          <span>Nombre</span>
          <input type="text" class="wl-name" value="${esc(profile?.full_name || '')}" placeholder="Tu nombre" autocomplete="name">
        </label>
        <label class="wl-field">
          <span>Email</span>
          <input type="email" class="wl-email" value="${esc(profile?.email || '')}" placeholder="tu@email.com" autocomplete="email">
        </label>
        <label class="wl-field">
          <span>Teléfono</span>
          <input type="tel" class="wl-phone" value="${esc(profile?.phone || '')}" placeholder="+34 600 000 000" autocomplete="tel">
        </label>
      </div>
      <label class="wl-check">
        <input type="checkbox" class="wl-wa" checked>
        <span>Quiero recibir información por WhatsApp y unirme a la comunidad</span>
      </label>
      <button type="button" class="wl-submit">Avísame de las próximas fechas</button>
    `;

  return `
    <div class="wl-box" data-type="${esc(classType || '')}">
      <div class="wl-head">
        <span class="wl-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        </span>
        <div>
          <h4 class="wl-title">${esc(heading)}</h4>
          <p class="wl-lead">${lead}</p>
        </div>
      </div>
      <div class="wl-body">${cuerpo}</div>
      <p class="wl-legal">Solo lo usamos para avisarte de nuevas fechas. Puedes pedir la baja cuando quieras.</p>
    </div>`;
}

// Engancha el cuadro ya pintado dentro de `root`.
export function bindWaitlistBox(root, { classType, profile, source, onDone } = {}) {
  const box = root.querySelector('.wl-box');
  if (!box) return;

  const done = () => {
    box.innerHTML = `
      <div class="wl-done">
        <span class="wl-done-tick" aria-hidden="true">✓</span>
        <div>
          <h4 class="wl-title">¡Apuntado!</h4>
          <p class="wl-lead">Te escribimos en cuanto haya fechas nuevas.</p>
        </div>
      </div>`;
    if (typeof onDone === 'function') onDone();
  };

  // "Usar otros datos": cambia el botón de un clic por el formulario
  box.querySelector('.wl-edit')?.addEventListener('click', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = waitlistBoxHtml({ classType, profile: null });
    box.replaceWith(wrap.firstElementChild);
    bindWaitlistBox(root, { classType, profile: null, source, onDone });
  });

  box.querySelector('.wl-submit')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const oneClick = btn.classList.contains('wl-oneclick');
    const name  = oneClick ? profile.full_name : box.querySelector('.wl-name')?.value;
    const email = oneClick ? profile.email     : box.querySelector('.wl-email')?.value;
    const phone = oneClick ? profile.phone     : box.querySelector('.wl-phone')?.value;

    // Validación propia: el globo nativo no se ve dentro de un modal con scroll
    if (!String(name || '').trim())  { showToast('Dinos tu nombre', 'error'); box.querySelector('.wl-name')?.focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '').trim())) {
      showToast('Revisa el email', 'error'); box.querySelector('.wl-email')?.focus(); return;
    }
    if (!String(phone || '').trim()) { showToast('Necesitamos tu teléfono para avisarte', 'error'); box.querySelector('.wl-phone')?.focus(); return; }

    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Apuntando…';
    try {
      await joinWaitlist({
        name, email, phone, classType,
        wantsWhatsapp: box.querySelector('.wl-wa')?.checked !== false,
        userId: profile?.id || null,
        source,
      });
      done();
    } catch (err) {
      showToast('No se pudo apuntar: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = prev;
    }
  });
}

// Atajo: ¿está activo? → devuelve el HTML del cuadro (o '' si no toca).
export async function waitlistBoxIfEnabled({ classType } = {}) {
  const settings = await getWaitlistSettings();
  if (!settings.waitlist_enabled) return { html: '', profile: null };
  let profile = await getProfile().catch(() => null);
  // profiles.email puede venir vacío (hay perfiles antiguos sin rellenar);
  // el de la sesión siempre está, y sin él no habría alta de un clic.
  if (profile && !profile.email) {
    const session = await getSession().catch(() => null);
    if (session?.user?.email) profile = { ...profile, email: session.user.email };
  }
  return {
    html: waitlistBoxHtml({
      classType, profile,
      title: settings.waitlist_title || null,
      text: settings.waitlist_text || null,
    }),
    profile,
  };
}
