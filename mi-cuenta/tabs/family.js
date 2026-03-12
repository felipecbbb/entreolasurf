import { fetchFamilyMembers, createFamilyMember, updateFamilyMember, deleteFamilyMember } from '/lib/family.js';

const LEVELS = ['principiante', 'intermedio', 'avanzado'];

export async function renderFamily(panel) {
  async function render() {
    const members = await fetchFamilyMembers();

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <h3 style="margin:0;font-family:'Space Grotesk',sans-serif;text-transform:uppercase;font-size:.85rem;color:var(--color-navy)">Miembros de la familia</h3>
        <button class="btn red" id="add-member-btn" style="font-size:.85rem;padding:8px 16px">+ Añadir miembro</button>
      </div>`;

    if (members.length) {
      html += members.map(m => `
        <div class="family-member-card" data-id="${m.id}">
          <div class="family-member-info">
            <strong>${m.full_name}</strong>
            <span class="meta">${m.level ? m.level : 'Sin nivel'} ${m.birth_date ? ' · ' + new Date(m.birth_date).toLocaleDateString('es-ES') : ''}</span>
            ${m.notes ? `<span class="meta">${m.notes}</span>` : ''}
          </div>
          <div class="family-member-actions">
            <button class="btn line" data-action="edit" data-id="${m.id}" style="font-size:.8rem;padding:6px 12px">Editar</button>
            <button class="btn line" data-action="delete" data-id="${m.id}" style="font-size:.8rem;padding:6px 12px;color:#c0392b;border-color:#c0392b">Eliminar</button>
          </div>
        </div>`).join('');
    } else {
      html += '<p style="color:var(--color-muted)">No has añadido miembros familiares. Añade a tus hijos o acompañantes para poder reservar clases para ellos.</p>';
    }

    // Inline form (hidden by default)
    html += `
      <div id="family-form-wrap" class="family-form" style="display:none">
        <h4 id="family-form-title">Añadir miembro</h4>
        <form id="family-form">
          <input type="hidden" name="id" value="">
          <label>Nombre completo <input type="text" name="full_name" required></label>
          <label>Fecha de nacimiento <input type="date" name="birth_date"></label>
          <label>Nivel
            <select name="level">
              <option value="">Sin definir</option>
              ${LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}
            </select>
          </label>
          <label>Notas <input type="text" name="notes" placeholder="Alergias, observaciones..."></label>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button type="submit" class="btn red" style="font-size:.85rem">Guardar</button>
            <button type="button" class="btn line" id="cancel-family-form" style="font-size:.85rem">Cancelar</button>
          </div>
        </form>
      </div>`;

    panel.innerHTML = html;

    // Event: add member
    panel.querySelector('#add-member-btn').addEventListener('click', () => {
      const wrap = panel.querySelector('#family-form-wrap');
      const form = panel.querySelector('#family-form');
      form.reset();
      form.querySelector('[name="id"]').value = '';
      panel.querySelector('#family-form-title').textContent = 'Añadir miembro';
      wrap.style.display = 'block';
    });

    // Event: cancel form
    panel.querySelector('#cancel-family-form')?.addEventListener('click', () => {
      panel.querySelector('#family-form-wrap').style.display = 'none';
    });

    // Event: edit
    panel.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = members.find(x => x.id === btn.dataset.id);
        if (!m) return;
        const wrap = panel.querySelector('#family-form-wrap');
        const form = panel.querySelector('#family-form');
        form.querySelector('[name="id"]').value = m.id;
        form.querySelector('[name="full_name"]').value = m.full_name;
        form.querySelector('[name="birth_date"]').value = m.birth_date || '';
        form.querySelector('[name="level"]').value = m.level || '';
        form.querySelector('[name="notes"]').value = m.notes || '';
        panel.querySelector('#family-form-title').textContent = 'Editar miembro';
        wrap.style.display = 'block';
      });
    });

    // Event: delete
    panel.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este miembro familiar?')) return;
        try {
          await deleteFamilyMember(btn.dataset.id);
          render();
        } catch (err) {
          alert('Error: ' + err.message);
        }
      });
    });

    // Event: form submit
    panel.querySelector('#family-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const obj = Object.fromEntries(fd);
      const id = obj.id;
      delete obj.id;

      try {
        if (id) {
          await updateFamilyMember(id, obj);
        } else {
          await createFamilyMember(obj);
        }
        render();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
  }

  await render();
}
