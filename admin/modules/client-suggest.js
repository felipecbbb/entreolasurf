/* ============================================================
   Autocompletado de fichas de cliente (anti-duplicados)
   ============================================================
   attachClientSuggest(input, { onPick, includeFamily })
   Al escribir en un campo de nombre/email, despliega las fichas existentes que
   coinciden (cliente por nombre/email/teléfono + sus familiares) y, al elegir una,
   llama onPick(picked) para VINCULARLA en vez de crear un duplicado.

   picked = {
     type: 'profile' | 'family',
     id,            // id del PERFIL (cuenta) — para family es el del titular
     full_name, last_name, email, phone,
     familyMemberId,// solo si type==='family'
     label          // texto mostrado
   }
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { searchProfiles } from './api.js';

const esc = s => s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';

export function attachClientSuggest(input, { onPick, includeFamily = true } = {}) {
  if (!input || input._suggestAttached) return;
  input._suggestAttached = true;

  let box = null, timer = null, items = [], picking = false, onDocDown = null;
  const PICK_EVENT = window.PointerEvent ? 'pointerdown' : 'mousedown';

  function closeBox() {
    if (!box) return;
    box.remove();
    box = null;
    picking = false;
    // El desplegable es position:fixed: si no se recoloca al hacer scroll, se queda
    // flotando sobre el formulario (se veía tapando el campo en tablet).
    window.removeEventListener('scroll', positionBox, true);
    window.removeEventListener('resize', positionBox);
    window.visualViewport?.removeEventListener('resize', positionBox);
    window.visualViewport?.removeEventListener('scroll', positionBox);
    if (onDocDown) { document.removeEventListener(PICK_EVENT, onDocDown, true); onDocDown = null; }
  }

  function positionBox() {
    if (!box) return;
    const r = input.getBoundingClientRect();
    // Input fuera de la vista (scroll del panel) → no dejamos el desplegable huérfano
    if (r.bottom < 0 || r.top > window.innerHeight) { closeBox(); return; }

    const margin = 8;
    const vw = window.innerWidth;
    const width = Math.min(Math.max(r.width, 240), vw - margin * 2);
    // Nunca se sale por los lados: se pega al borde si no cabe
    const left = Math.min(Math.max(r.left, margin), vw - width - margin);

    // Si abajo no cabe y arriba sí, se despliega hacia arriba
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
    const maxH = Math.min(260, Math.max(120, openUp ? spaceAbove : spaceBelow));

    box.style.width = `${width}px`;
    box.style.left = `${left}px`;
    box.style.maxHeight = `${maxH}px`;
    if (openUp) {
      box.style.top = 'auto';
      box.style.bottom = `${window.innerHeight - r.top + 2}px`;
    } else {
      box.style.bottom = 'auto';
      box.style.top = `${r.bottom + 2}px`;
    }
  }

  function render() {
    closeBox();
    if (!items.length) return;
    box = document.createElement('div');
    box.className = 'client-suggest-box';
    box.style.cssText = 'position:fixed;z-index:10050;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 8px 24px rgba(15,47,57,.16);overflow:auto;-webkit-overflow-scrolling:touch;font-size:.86rem';
    box.innerHTML = items.map((it, i) => `
      <div class="cs-opt" data-i="${i}" style="padding:12px 11px;min-height:44px;cursor:pointer;border-bottom:1px solid #f1f5f9;${it.type === 'family' ? 'padding-left:24px;border-left:3px solid #0ea5e9' : ''}">
        ${it.type === 'family' ? `<small style="color:#0ea5e9;font-weight:600">↳ Familiar de ${esc(it.parentName)}</small><br>` : ''}
        <strong>${esc(it.label)}</strong>${it.sub ? ` <span style="color:#64748b">· ${esc(it.sub)}</span>` : ''}
      </div>`).join('');
    document.body.appendChild(box);
    positionBox();
    window.addEventListener('scroll', positionBox, true);   // capture: también el scroll de paneles internos
    window.addEventListener('resize', positionBox);
    window.visualViewport?.addEventListener('resize', positionBox);  // teclado del móvil
    window.visualViewport?.addEventListener('scroll', positionBox);

    // Tocar fuera cierra la lista (si se hizo scroll dentro, el blur ya no vuelve a saltar)
    onDocDown = (e) => { if (box && !box.contains(e.target) && e.target !== input) closeBox(); };
    document.addEventListener(PICK_EVENT, onDocDown, true);

    // pointerdown, no mousedown: en táctil el mousedown emulado llega DESPUÉS del
    // blur del input y el desplegable ya se había cerrado → el toque no elegía nada.
    box.addEventListener(PICK_EVENT, () => { picking = true; });
    box.querySelectorAll('.cs-opt').forEach(el => {
      el.addEventListener(PICK_EVENT, (e) => {
        e.preventDefault();   // evita el blur del input
        const it = items[Number(el.dataset.i)];
        closeBox();
        if (it && onPick) onPick(it);
      });
    });
  }

  async function run() {
    const term = input.value.trim();
    if (term.length < 2) { items = []; closeBox(); return; }
    try {
      const profiles = await searchProfiles(term);
      const list = [];
      for (const p of profiles) {
        list.push({ type: 'profile', id: p.id, full_name: p.full_name || '', last_name: p.last_name || '', email: p.email || '', phone: p.phone || '', familyMemberId: null, label: p.full_name || 'Sin nombre', sub: p.phone || p.email || '' });
      }
      if (includeFamily) {
        const safe = term.replace(/[%_\\]/g, '');
        const { data: fams } = await supabase.from('family_members')
          .select('id, full_name, last_name, user_id, profiles:user_id(full_name)')
          .ilike('full_name', `%${safe}%`).limit(8);
        (fams || []).forEach(m => list.push({
          type: 'family', id: m.user_id, familyMemberId: m.id,
          full_name: m.full_name || '', last_name: m.last_name || '',
          email: '', phone: '', parentName: m.profiles?.full_name || 'cuenta',
          label: `${m.full_name || ''}${m.last_name ? ' ' + m.last_name : ''}`.trim(), sub: '',
        }));
      }
      items = list;
      render();
    } catch { items = []; closeBox(); }
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  // Al tocar el desplegable en táctil el input pierde el foco: si ese blur cerrara la
  // lista, el toque se perdería. Mientras el dedo esté dentro, no se cierra.
  input.addEventListener('blur', () => setTimeout(() => { if (!picking) closeBox(); }, 200));
}
