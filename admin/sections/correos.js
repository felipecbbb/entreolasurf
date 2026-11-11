/* ============================================================
   Correos — email marketing del panel (solo admin)
   Pestañas: Campañas · Plantillas · Historial · Ajustes
   Los envíos los hace la Edge Function email-campaign vía Brevo.
   Datos: email_templates, email_campaigns, email_sends, site_settings
   (ver supabase/migration-correos.sql).
   ============================================================ */
import { renderCampanas } from './correos/campanas.js';
import { renderPlantillas } from './correos/plantillas.js';
import { renderHistorial } from './correos/historial.js';
import { renderAjustesCorreo } from './correos/ajustes.js';

const TABS = [
  ['campanas', 'Campañas'],
  ['plantillas', 'Plantillas'],
  ['historial', 'Historial y bajas'],
  ['ajustes', 'Ajustes'],
];

export async function renderCorreos(container) {
  let tab = 'campanas';

  async function mount(opts = {}) {
    container.innerHTML = `
      <div class="ch-tabs" role="tablist">
        ${TABS.map(([k, v]) => `<button class="ch-tab ${tab === k ? 'is-active' : ''}" data-tab="${k}" role="tab">${v}</button>`).join('')}
      </div>
      <div id="co-body"></div>`;
    container.querySelectorAll('.ch-tab').forEach(b => b.addEventListener('click', () => {
      if (tab === b.dataset.tab) return;
      tab = b.dataset.tab; mount();
    }));
    const body = container.querySelector('#co-body');
    if (tab === 'plantillas') {
      await renderPlantillas(body, { onUse: (t) => { tab = 'campanas'; mount({ fromTemplate: t }); } });
    } else if (tab === 'historial') await renderHistorial(body);
    else if (tab === 'ajustes') await renderAjustesCorreo(body);
    else await renderCampanas(body, opts);
  }

  await mount();
}
