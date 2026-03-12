# Documentacion Entre Olas (estado actual)

## 1) Resumen del proyecto
Este proyecto es una web multipagina estatica servida con Vite.

Objetivo de diseno actual:
- Mantener la informacion original de Entre Olas.
- Aplicar una linea visual inspirada en Lapoint (header limpio, hero potente, bloques amplios, tipografia marcada, cards, FAQ, CTA).
- Navegacion principal fija en orden:
  - Escuela de Surf
  - Surf Camp
  - Servicios
  - Tienda
  - Contacto
  - Cart

## 2) Stack y ejecucion
- Runtime: Node + Vite.
- Scripts en `package.json`:
  - `npm run dev`: levanta entorno local.
  - `npm run build`: genera build en `dist/`.
  - `npm run preview`: previsualiza el build.

Notas:
- Con Node `22.3.0` aparece warning de version recomendada de Vite, pero el build compila correctamente.

## 3) Estructura de carpetas principal
- `index.html`: home principal.
- `style.css`: estilos globales de todo el sitio.
- `app.js`: logica de navegacion movil + animaciones + video autoplay/sonido.
- Carpetas de paginas internas (cada una con su `index.html`):
  - `informacion-general/`
  - `clases-de-surf-grupales/`
  - `clases-de-surf-individuales/`
  - `alquiler-de-material/`
  - `clases-de-yoga/`
  - `paddle-surf/`
  - `clases-de-surfskate/`
  - `surf-camp/`
  - `surf-camp-20-23-marzo/`
  - `surf-camp-10abril-13abril/`
  - `surf-camp-16-19-abril-sambatrips/`
  - `surf-camp-9-13-septiembre-sambatrips/`
  - `surf-camp-20-23-marzo-landing-ads/`
  - `tienda-2/`, `carrito/`, `finalizar-compra/`, `mi-cuenta/`, `contacto/`
- `research/entreolas/`: extraccion de contenido original (fuente de texto y enlaces).

## 4) Sistema de estilos (style.css)
Variables de marca y base:
- `--color-red` se usa como acento y ahora esta en amarillo de marca (`#FFCC01`).
- Paleta base arena/azules oscuros para contraste visual.

Fuentes:
- Bebas Neue
- Manrope
- Space Grotesk

Bloques clave ya implementados:
- Header transparente para paginas internas (`.site-header`, `.lp-header`).
- Logo normal:
  - `entre` en negro
  - `olas` en amarillo
- Logo especial solo para surf camp principal:
  - `.logo-surf-house`
- Hero de imagen y hero de video (`.hero`, `.hero-video`).
- Secciones de showcase, cards, tablas, FAQ acordeon, CTA/formulario.

Detalles de color pedidos ya aplicados:
- Detalles rojos migrados a amarillo marca.
- Seccion FAQ en negro con lineas divisorias amarillas.

## 5) Logica JS (app.js)
Funciones activas:
1. Menu movil:
- Abre/cierra menu principal.
- Soporta dropdowns en mobile con toggle por item.

2. Reveal on scroll:
- Elementos con `.reveal-up` aparecen al entrar en viewport.

3. Video autoplay por scroll:
- Videos con `.auto-play-scroll` se reproducen al entrar y pausan al salir.

4. Boton de sonido:
- Elementos con `data-toggle-audio` alternan mute/unmute de un video objetivo.

## 6) Estado de Surf Camp principal (`surf-camp/index.html`)
Actualmente incluye:
- Header estilo unificado.
- Hero con video de fondo YouTube sin UI visible, autoplay y mute.
- Texto hero actualizado:
  - "Villa privada, surf y aventura"
  - "todos los niveles · pension completa · experiencia +18."
- Seccion de introduccion visual tipo showcase.
- Seccion de fechas/cards de surf camps.
- Seccion de reviews con:
  - video vertical local
  - panel de copy
  - boton de audio
- FAQ en dos columnas con acordeones independientes.
- Seccion CTA oscura con formulario (nombre, email, telefono, mensaje).

Cambios recientes importantes:
- Se elimino la seccion de "La Surf House / Conil de la Frontera / Lo mejor de la villa" por solicitud.

Asset local relevante:
- `surf-camp/Entrevista CTA (1).mp4`

## 7) Estado de paginas internas de clases/servicios
Se rehizo el diseno de estas paginas con el mismo lenguaje visual que Surf Camp y contenido real de la web original:
- `informacion-general/index.html`
- `clases-de-surf-grupales/index.html`
- `clases-de-surf-individuales/index.html`
- `alquiler-de-material/index.html`
- `clases-de-yoga/index.html`
- `paddle-surf/index.html`
- `clases-de-surfskate/index.html`

Patron comun aplicado:
- Hero visual + lead.
- Bloques de contenido y beneficios.
- Tablas de packs/precios/reserva.
- FAQ acordeon estilo actual.
- CTA final con formulario de contacto.

## 8) Formularios
Los formularios actuales estan preparados con `mailto:` como placeholder funcional:
- Campos: nombre, email, numero de telefono, mensaje.
- No existe backend de envio en este estado.

## 9) Datos y fuentes de contenido
Contenido textual original utilizado desde:
- `research/entreolas/pages_extracted.txt`
- `research/entreolas/page_links_extracted.txt`
- `research/entreolas/resumen_maestro.md`

IDs relevantes usados para clases/servicios:
- 42: informacion-general
- 44: clases-de-surf-grupales
- 46: clases-de-surf-individuales
- 48: alquiler-de-material
- 50: paddle-surf
- 52: clases-de-yoga
- 54: clases-de-surfskate

## 10) Pendientes opcionales (si quieres seguir)
- Unificar tambien `contacto`, `tienda-2`, `carrito`, `finalizar-compra`, `mi-cuenta` al mismo lenguaje visual.
- Reemplazar `mailto:` por backend real (API/email service).
- Conectar cart real y contador dinamico en `Cart`.
- Revisar y depurar assets legacy no usados.
- Subir version de Node para alinear recomendacion de Vite.

## 11) Como continuar rapido
1. Ejecuta `npm run dev`.
2. Revisa visualmente cada ruta interna.
3. Si quieres una siguiente fase, define prioridad:
   - Conversion comercial (checkout real)
   - Contenido (imagenes/videos reales finales)
   - Performance y SEO
