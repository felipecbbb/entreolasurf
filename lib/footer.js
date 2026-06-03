/* ============================================================
   Footer — fuente ÚNICA del footer del sitio. Se inyecta por JS en
   todas las páginas (no se duplica markup en cada HTML).
   ============================================================ */

import { langSelectorHtml, wireLangSelector } from '/lib/i18n.js';

function footerHtml() {
  return `
  <div class="container footer-grid">
    <div class="footer-col">
      <a class="logo footer-logo" href="/" data-i18n-skip><span class="logo-entre">entre</span><span class="logo-olas">olas</span></a>
      <p class="footer-tagline">Escuela de surf en Roche, Cádiz. Villa privada, clases para todos los niveles y la mejor experiencia surf de la costa.</p>
    </div>
    <div class="footer-col">
      <h4>Navegar</h4>
      <a href="/surf-camp/">Surf Camp</a>
      <a href="/clases-de-surf-grupales/">Clases grupales</a>
      <a href="/clases-de-surf-individuales/">Clases individuales</a>
      <a href="/tienda-2/">Tienda</a>
      <a href="/contacto/">Contacto</a>
    </div>
    <div class="footer-col">
      <h4>Contacto</h4>
      <a href="https://wa.me/34634466130?text=%C2%A1Hola!" target="_blank" rel="noopener">+34 634 46 61 30</a>
      <a href="mailto:entreolasurf@gmail.com">entreolasurf@gmail.com</a>
      <p>Playa de Roche, Conil de la Frontera, Cádiz</p>
    </div>
    <div class="footer-col">
      <h4>Síguenos</h4>
      <div class="footer-social">
        <a href="https://www.instagram.com/entreolasurf/" target="_blank" rel="noopener" aria-label="Instagram">Instagram</a>
        <a href="https://www.tiktok.com/@entreolasurf" target="_blank" rel="noopener" aria-label="TikTok">TikTok</a>
        <a href="https://wa.me/34634466130?text=%C2%A1Hola!%20Quer%C3%ADa%20informaci%C3%B3n" target="_blank" rel="noopener" aria-label="WhatsApp">WhatsApp</a>
      </div>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>&copy; 2026 Entre Olas Surf School. Todos los derechos reservados.</p>
    <div class="footer-bottom-right">
      ${langSelectorHtml('footer')}
      <div class="footer-legal">
        <a href="/aviso-legal/">Aviso Legal</a>
        <a href="/politica-privacidad/">Política de Privacidad</a>
        <a href="/politica-cookies/">Política de Cookies</a>
      </div>
    </div>
  </div>`;
}

export function initFooter() {
  let footer = document.querySelector('footer.site-footer');
  if (!footer) {
    footer = document.createElement('footer');
    document.body.appendChild(footer);
  }
  footer.className = 'site-footer';
  footer.innerHTML = footerHtml();
  wireLangSelector(footer);
}
