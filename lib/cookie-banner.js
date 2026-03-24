/* Cookie consent banner — LSSI / RGPD compliance */
(function () {
  if (localStorage.getItem('cookie_consent')) return;

  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.innerHTML = `
    <div class="cookie-banner-inner">
      <p>Utilizamos cookies propias y de terceros para mejorar tu experiencia. Puedes aceptar todas, rechazar las no esenciales o consultar nuestra <a href="/politica-cookies/">Política de Cookies</a>.</p>
      <div class="cookie-banner-actions">
        <button class="btn cookie-accept">Aceptar</button>
        <button class="btn line cookie-reject">Solo esenciales</button>
      </div>
    </div>`;

  document.body.appendChild(banner);

  banner.querySelector('.cookie-accept').addEventListener('click', () => {
    localStorage.setItem('cookie_consent', 'all');
    banner.remove();
  });

  banner.querySelector('.cookie-reject').addEventListener('click', () => {
    localStorage.setItem('cookie_consent', 'essential');
    banner.remove();
  });
})();
