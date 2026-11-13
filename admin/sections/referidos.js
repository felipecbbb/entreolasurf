/* ============================================================
   Referidos — vendedores de Surf Camp (fase 1, solo admin)
   ------------------------------------------------------------
   Cada vendedor tiene su enlace (?ref=codigo). Las ventas online se
   atribuyen solas (create-checkout → stripe-webhook); las de WhatsApp se
   asignan en Reservas con "Vendido por". Comisión y descuento opcionales.
   Esquema: supabase/migration-referidos.sql
   ============================================================ */
import { fetchReferrers, upsertReferrer, deleteReferrer, fetchReferredBookings, fetchCamps } from '../modules/api.js';
import { showToast, formatCurrency, formatDate } from '../modules/ui.js';

const esc = s => s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Las canceladas/reembolsadas no cuentan como venta ni generan comisión
const COUNTS = b => b.status !== 'cancelled' && b.status !== 'refunded';

const STATUS_LBL = { pending: 'Pendiente', deposit_paid: 'Señal pagada', fully_paid: 'Pagado', cancelled: 'Cancelado', refunded: 'Reembolsado' };

export function slugCode(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function commissionFor(ref, b) {
  const v = Number(ref?.commission_value) || 0;
  if (!ref || ref.commission_type === 'none' || v <= 0) return 0;
  if (ref.commission_type === 'percent') return Math.round(Number(b.total_amount || 0) * v) / 100;
  return v * (Number(b.num_spots) || 1);   // per_spot
}

function ruleLabel(type, value, none) {
  const v = Number(value) || 0;
  if (type === 'none' || v <= 0) return none;
  return type === 'percent' ? `${v}% del total` : `${formatCurrency(v)} por plaza`;
}

const linkFor = (code, path = '/surf-camp/') => `${location.origin}${path}?ref=${encodeURIComponent(code)}`;

async function copy(text) {
  try { await navigator.clipboard.writeText(text); showToast('Enlace copiado', 'success'); }
  catch { prompt('Copia el enlace:', text); }   // Safari viejo del iPad sin clipboard API
}

export async function renderReferidos(container) {
  let view = { mode: 'list', id: null };
  let filter = { from: '', to: '', camp: '' };

  async function render() {
    let refs, bookings, camps;
    try {
      [refs, bookings, camps] = await Promise.all([fetchReferrers(), fetchReferredBookings(), fetchCamps()]);
    } catch (err) {
      container.innerHTML = `<p class="rf-error">No se pudieron cargar los referidos: ${esc(err.message)}</p>`;
      return;
    }

    if (view.mode === 'form') return renderForm(view.id ? refs.find(r => r.id === view.id) : null);

    const inRange = b => {
      const d = (b.created_at || '').slice(0, 10);
      if (filter.from && d < filter.from) return false;
      if (filter.to && d > filter.to) return false;
      if (filter.camp && b.camp_id !== filter.camp) return false;
      return true;
    };
    const visible = bookings.filter(inRange);

    if (view.mode === 'detail') {
      const ref = refs.find(r => r.id === view.id);
      if (!ref) { view = { mode: 'list', id: null }; return render(); }
      return renderDetail(ref, visible.filter(b => b.referrer_id === ref.id), camps);
    }

    const stats = refs.map(r => {
      const mine = visible.filter(b => b.referrer_id === r.id && COUNTS(b));
      return {
        r,
        ventas: mine.length,
        plazas: mine.reduce((s, b) => s + (Number(b.num_spots) || 1), 0),
        total: mine.reduce((s, b) => s + Number(b.total_amount || 0), 0),
        comision: mine.reduce((s, b) => s + commissionFor(r, b), 0),
      };
    });
    const sum = k => stats.reduce((s, x) => s + x[k], 0);
    const campOpts = camps.map(c => `<option value="${c.id}" ${filter.camp === c.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('');

    container.innerHTML = `
      <div class="rf-head">
        <p class="rf-intro">Cada vendedor tiene su enlace. Lo que se compre online entrando por él se le apunta solo; las ventas por WhatsApp se asignan en <a href="#reservas">Reservas</a> con «Vendido por». Solo Surf Camps.</p>
        <button class="sc-new-btn" id="rf-new">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo vendedor
        </button>
      </div>

      <div class="rf-filters">
        <label>Desde <input type="date" class="act-form-input" id="rf-from" value="${filter.from}"></label>
        <label>Hasta <input type="date" class="act-form-input" id="rf-to" value="${filter.to}"></label>
        <label>Camp <select class="act-form-input" id="rf-camp"><option value="">Todos</option>${campOpts}</select></label>
      </div>

      <div class="rf-kpis">
        <div><span>Ventas</span><strong>${sum('ventas')}</strong></div>
        <div><span>Plazas</span><strong>${sum('plazas')}</strong></div>
        <div><span>Facturado</span><strong>${formatCurrency(sum('total'))}</strong></div>
        <div><span>Comisiones</span><strong>${formatCurrency(sum('comision'))}</strong></div>
      </div>

      ${refs.length ? `
      <div class="rf-table">
        <div class="rf-row rf-row-head">
          <span>Vendedor</span><span>Ventas</span><span>Plazas</span><span>Facturado</span><span>Comisión</span><span></span>
        </div>
        ${stats.map(({ r, ventas, plazas, total, comision }) => `
          <div class="rf-row ${r.active ? '' : 'is-off'}" data-open="${r.id}">
            <span class="rf-name">
              <strong>${esc(r.name)}</strong>${r.active ? '' : ' <em>desactivado</em>'}
              <small>?ref=${esc(r.code)} · ${esc(ruleLabel(r.commission_type, r.commission_value, 'sin comisión'))} · ${esc(ruleLabel(r.discount_type, r.discount_value, 'sin descuento'))}</small>
            </span>
            <span data-l="Ventas">${ventas}</span>
            <span data-l="Plazas">${plazas}</span>
            <span data-l="Facturado">${formatCurrency(total)}</span>
            <span data-l="Comisión">${r.commission_type === 'none' ? '—' : formatCurrency(comision)}</span>
            <span class="rf-actions">
              <button class="btn line rf-btn" data-copy="${esc(r.code)}">Copiar enlace</button>
              <button class="btn line rf-btn" data-edit="${r.id}">Editar</button>
            </span>
          </div>`).join('')}
      </div>` : '<p class="rf-empty">Todavía no hay vendedores. Crea el primero con «Nuevo vendedor».</p>'}
    `;

    container.querySelector('#rf-new').addEventListener('click', () => { view = { mode: 'form', id: null }; render(); });
    ['from', 'to', 'camp'].forEach(k => container.querySelector(`#rf-${k}`).addEventListener('change', e => { filter[k] = e.target.value; render(); }));
    container.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); copy(linkFor(b.dataset.copy)); }));
    container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); view = { mode: 'form', id: b.dataset.edit }; render(); }));
    container.querySelectorAll('[data-open]').forEach(row => row.addEventListener('click', () => { view = { mode: 'detail', id: row.dataset.open }; render(); }));
  }

  function renderDetail(ref, mine, camps) {
    const counted = mine.filter(COUNTS);
    const totalCom = counted.reduce((s, b) => s + commissionFor(ref, b), 0);
    const futureCamps = camps.filter(c => !c.date_end || c.date_end >= new Date().toISOString().slice(0, 10));
    container.innerHTML = `
      <div class="rf-head">
        <button class="btn line rf-btn" id="rf-back">← Referidos</button>
        <button class="btn line rf-btn" data-edit="${ref.id}">Editar vendedor</button>
      </div>
      <h2 class="rf-title">${esc(ref.name)}</h2>
      <p class="rf-intro">${esc(ruleLabel(ref.commission_type, ref.commission_value, 'Sin comisión'))} · ${esc(ruleLabel(ref.discount_type, ref.discount_value, 'sin descuento para el cliente'))}</p>

      <div class="rf-links">
        <div class="rf-link"><code>${esc(linkFor(ref.code))}</code><button class="btn line rf-btn" data-copy-url="${esc(linkFor(ref.code))}">Copiar</button></div>
        <label class="rf-link-camp">Enlace directo a un camp:
          <select class="act-form-input" id="rf-camp-link"><option value="">Elegir camp…</option>
            ${futureCamps.map(c => `<option value="/${esc(c.slug)}/">${esc(c.title)}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="rf-kpis">
        <div><span>Ventas</span><strong>${counted.length}</strong></div>
        <div><span>Plazas</span><strong>${counted.reduce((s, b) => s + (Number(b.num_spots) || 1), 0)}</strong></div>
        <div><span>Facturado</span><strong>${formatCurrency(counted.reduce((s, b) => s + Number(b.total_amount || 0), 0))}</strong></div>
        <div><span>Comisión</span><strong>${ref.commission_type === 'none' ? '—' : formatCurrency(totalCom)}</strong></div>
      </div>

      ${mine.length ? `
      <div class="rf-table">
        <div class="rf-row rf-row-head rf-row-sales"><span>Cliente</span><span>Camp</span><span>Plazas</span><span>Total</span><span>Estado</span><span>Comisión</span></div>
        ${mine.map(b => {
          const name = [b.profiles?.full_name, b.profiles?.last_name].filter(Boolean).join(' ') || b.guest_name || 'Sin nombre';
          return `
          <div class="rf-row rf-row-sales ${COUNTS(b) ? '' : 'is-off'}">
            <span class="rf-name"><strong>${esc(name)}</strong><small>${formatDate(b.created_at)}</small></span>
            <span data-l="Camp">${esc(b.surf_camps?.title || '—')}</span>
            <span data-l="Plazas">${Number(b.num_spots) || 1}</span>
            <span data-l="Total">${formatCurrency(b.total_amount)}</span>
            <span data-l="Estado">${esc(STATUS_LBL[b.status] || b.status)}</span>
            <span data-l="Comisión">${COUNTS(b) && ref.commission_type !== 'none' ? formatCurrency(commissionFor(ref, b)) : '—'}</span>
          </div>`;
        }).join('')}
      </div>` : '<p class="rf-empty">Sin ventas en este periodo.</p>'}
    `;
    container.querySelector('#rf-back').addEventListener('click', () => { view = { mode: 'list', id: null }; render(); });
    container.querySelector('[data-edit]').addEventListener('click', () => { view = { mode: 'form', id: ref.id }; render(); });
    container.querySelector('[data-copy-url]').addEventListener('click', e => copy(e.currentTarget.dataset.copyUrl));
    container.querySelector('#rf-camp-link').addEventListener('change', e => { if (e.target.value) copy(linkFor(ref.code, e.target.value)); e.target.value = ''; });
  }

  function renderForm(ref) {
    const r = ref || { name: '', code: '', active: true, commission_type: 'none', commission_value: 0, discount_type: 'none', discount_value: 0, notes: '' };
    const typeOpts = (sel, noneLbl) => [
      ['none', noneLbl], ['percent', '% del total del camp'], ['per_spot', '€ fijos por plaza'],
    ].map(([v, l]) => `<option value="${v}" ${sel === v ? 'selected' : ''}>${l}</option>`).join('');

    container.innerHTML = `
      <div class="rf-head"><button class="btn line rf-btn" id="rf-cancel">← Volver</button></div>
      <h2 class="rf-title">${ref ? 'Editar vendedor' : 'Nuevo vendedor'}</h2>
      <form class="rf-form" id="rf-form">
        <label>Nombre<input class="act-form-input" id="rf-name" required value="${esc(r.name)}" placeholder="Lucía Galiño"></label>
        <label>Código del enlace<input class="act-form-input" id="rf-code" required value="${esc(r.code)}" placeholder="lucia" pattern="[a-z0-9-]{2,40}">
          <small id="rf-code-preview">${esc(linkFor(r.code || 'codigo'))}</small>
          ${ref ? '<small class="rf-warn">Si cambias el código, los enlaces que ya haya compartido dejan de funcionar.</small>' : ''}
        </label>

        <fieldset>
          <legend>Comisión del vendedor <span>(opcional)</span></legend>
          <div class="rf-pair">
            <select class="act-form-input" id="rf-ctype">${typeOpts(r.commission_type, 'Sin comisión')}</select>
            <input class="act-form-input" id="rf-cval" type="number" min="0" step="0.01" value="${Number(r.commission_value) || ''}" placeholder="0">
          </div>
          <small>Se calcula sobre el total de cada reserva no cancelada. Solo la ves tú.</small>
        </fieldset>

        <fieldset>
          <legend>Descuento para el cliente <span>(opcional)</span></legend>
          <div class="rf-pair">
            <select class="act-form-input" id="rf-dtype">${typeOpts(r.discount_type, 'Sin descuento')}</select>
            <input class="act-form-input" id="rf-dval" type="number" min="0" step="0.01" value="${Number(r.discount_value) || ''}" placeholder="0">
          </div>
          <small>Se aplica solo al comprar online entrando por su enlace, y rebaja el resto a pagar (la señal no cambia).</small>
        </fieldset>

        <label>Notas <span class="rf-opt">(opcional)</span><textarea class="act-form-input" id="rf-notes" rows="2">${esc(r.notes)}</textarea></label>
        <label class="rf-check"><input type="checkbox" id="rf-active" ${r.active ? 'checked' : ''}> Activo (si lo desactivas, su enlace deja de atribuir ventas nuevas)</label>

        <div class="rf-form-actions">
          <button type="submit" class="sc-new-btn" id="rf-save">Guardar</button>
          ${ref ? '<button type="button" class="btn line rf-btn rf-del" id="rf-del">Eliminar</button>' : ''}
        </div>
      </form>
    `;

    const $ = id => container.querySelector('#' + id);
    let codeTouched = !!ref;
    const preview = () => { $('rf-code-preview').textContent = linkFor($('rf-code').value || 'codigo'); };
    $('rf-name').addEventListener('input', () => { if (!codeTouched) { $('rf-code').value = slugCode($('rf-name').value); preview(); } });
    $('rf-code').addEventListener('input', () => { codeTouched = true; $('rf-code').value = slugCode($('rf-code').value) || $('rf-code').value.toLowerCase(); preview(); });
    $('rf-cancel').addEventListener('click', () => { view = ref ? { mode: 'detail', id: ref.id } : { mode: 'list', id: null }; render(); });

    $('rf-form').addEventListener('submit', async e => {
      e.preventDefault();
      const code = slugCode($('rf-code').value);
      if (!/^[a-z0-9-]{2,40}$/.test(code)) { showToast('El código debe tener 2-40 letras, números o guiones', 'error'); return; }
      const ctype = $('rf-ctype').value, dtype = $('rf-dtype').value;
      const cval = ctype === 'none' ? 0 : Number($('rf-cval').value) || 0;
      const dval = dtype === 'none' ? 0 : Number($('rf-dval').value) || 0;
      if ((ctype === 'percent' && cval > 100) || (dtype === 'percent' && dval > 100)) { showToast('Un porcentaje no puede pasar de 100', 'error'); return; }
      const btn = $('rf-save'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await upsertReferrer({
          ...(ref ? { id: ref.id } : {}),
          name: $('rf-name').value.trim(), code, active: $('rf-active').checked,
          commission_type: cval > 0 ? ctype : 'none', commission_value: cval,
          discount_type: dval > 0 ? dtype : 'none', discount_value: dval,
          notes: $('rf-notes').value.trim() || null,
        });
        showToast('Vendedor guardado', 'success');
        view = { mode: 'list', id: null };
        render();
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Guardar';
        showToast(/duplicate|unique/i.test(err.message) ? 'Ese código ya lo usa otro vendedor' : 'Error: ' + err.message, 'error');
      }
    });

    $('rf-del')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar a ${ref.name}? Sus reservas se conservan, pero dejarán de contar como suyas. Si solo quieres parar su enlace, desactívalo.`)) return;
      try { await deleteReferrer(ref.id); showToast('Vendedor eliminado', 'success'); view = { mode: 'list', id: null }; render(); }
      catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  }

  await render();
}
