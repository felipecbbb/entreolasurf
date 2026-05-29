/* ============================================================
   i18n — traducción ES (principal) → EN por diccionario.
   El HTML está en español; si el idioma activo es 'en', se
   recorren los nodos de texto y atributos y se sustituyen por su
   traducción del diccionario. Lo no traducido se queda en español.
   El idioma se guarda en localStorage; al cambiar, se recarga.
   ============================================================ */
const LANG_KEY = 'eo_lang';

export function getLang() {
  try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'es'; } catch { return 'es'; }
}

export function setLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang === 'en' ? 'en' : 'es'); } catch {}
  location.reload();
}

// Diccionario ES → EN. Clave = texto español EXACTO (trim). Ir ampliando.
const EN = {
  // ---- Navegación / header ----
  'Escuela de Surf': 'Surf School',
  'Surf Camp': 'Surf Camp',
  'Servicios': 'Services',
  'Tienda': 'Shop',
  'Contacto': 'Contact',
  'Mi cuenta': 'My account',
  'Clases grupales': 'Group lessons',
  'Clases individuales': 'Private lessons',
  'Alquiler de material': 'Gear rental',
  'Vista general': 'Overview',
  'Clases de yoga': 'Yoga classes',
  'Paddle Surf': 'Paddle Surf',
  'Clases de SurfSkate': 'SurfSkate lessons',
  'Página de contacto': 'Contact page',

  // ---- Footer ----
  'Navegar': 'Browse',
  'Síguenos': 'Follow us',
  'Clases grupales': 'Group lessons',
  'Escuela de surf en Roche, Cádiz. Villa privada, clases para todos los niveles y la mejor experiencia surf de la costa.':
    'Surf school in Roche, Cádiz. Private villa, lessons for all levels and the best surf experience on the coast.',
  'Playa de Roche, Conil de la Frontera, Cádiz': 'Playa de Roche, Conil de la Frontera, Cádiz',
  '© 2026 Entre Olas Surf School. Todos los derechos reservados.': '© 2026 Entre Olas Surf School. All rights reserved.',
  'Aviso Legal': 'Legal Notice',
  'Política de Privacidad': 'Privacy Policy',
  'Política de Cookies': 'Cookie Policy',

  // ---- Home / hero ----
  'Playa de Roche, Cádiz': 'Playa de Roche, Cádiz',
  'Vive la experiencia del surf': 'Experience the surf',
  'Aprende a surfear con instructores profesionales. Clases para todos los niveles, material incluido, packs con descuento y Surf Camp +18 en villa privada.':
    'Learn to surf with professional instructors. Lessons for all levels, gear included, discounted packs and an 18+ Surf Camp in a private villa.',
  'Ver clases de surf': 'See surf lessons',
  'Conoce el Surf Camp': 'Discover the Surf Camp',

  // ---- CTAs / botones comunes ----
  'Reservar': 'Book',
  'Reservar clase': 'Book class',
  'Comprar bono': 'Buy pack',
  'Añadir al carrito': 'Add to cart',
  'Finalizar compra': 'Checkout',
  'Ver carrito': 'View cart',
  'Tu carrito': 'Your cart',
  'Tu carrito está vacío': 'Your cart is empty',
  'Ir a la tienda': 'Go to shop',
  'Seguir comprando': 'Keep shopping',
  'Total': 'Total',
  'Cancelar': 'Cancel',
  'Confirmar': 'Confirm',
  'Continuar': 'Continue',
  'Volver': 'Back',
  'Volver al inicio': 'Back to home',
  'Material incluido': 'Gear included',
  'Seguro de accidentes': 'Accident insurance',
  'Todos los niveles': 'All levels',
  'por persona': 'per person',

  // ---- Cuenta / panel ----
  'Mis datos': 'My details',
  'Mi Familia': 'My Family',
  'Mis Bonos': 'My Packs',
  'Reservar Clases': 'Book Classes',
  'Mis Clases': 'My Classes',
  'Mis Pagos': 'My Payments',
  'Mis Pedidos': 'My Orders',
  'Cerrar sesión': 'Log out',
  'Iniciar sesión': 'Log in',
  'Crear cuenta': 'Create account',
  'Bienvenido de nuevo': 'Welcome back',
  'Email': 'Email',
  'Contraseña': 'Password',
  '¿No tienes cuenta?': "Don't have an account?",
  'Consulta el calendario y reserva': 'Check the calendar and book',
  'No tienes créditos de clases': 'You have no class credits',
  'Compra un pack de clases para poder reservar en el calendario.': 'Buy a class pack to book on the calendar.',
  'Surf Grupal': 'Group Surf',
  'Surf Individual': 'Private Surf',
  'Yoga': 'Yoga',
  'SurfSkate': 'SurfSkate',
  'Todas': 'All',
  'Principiante': 'Beginner',
  'Intermedio': 'Intermediate',
  'Avanzado': 'Advanced',

  // ---- Títulos de página ----
  'Entre Olas | Escuela de Surf en Roche, Cádiz': 'Entre Olas | Surf School in Roche, Cádiz',
  'Clases de Surf Grupales | Entre Olas': 'Group Surf Lessons | Entre Olas',
  'Clases de Surf Individuales | Entre Olas': 'Private Surf Lessons | Entre Olas',
  'Clases de Yoga | Entre Olas': 'Yoga Classes | Entre Olas',
  'Clases de SurfSkate | Entre Olas': 'SurfSkate Lessons | Entre Olas',
  'Paddle Surf | Entre Olas': 'Paddle Surf | Entre Olas',
  'Alquiler de material | Entre Olas': 'Gear Rental | Entre Olas',
  'Surf Camp | Entre Olas': 'Surf Camp | Entre Olas',
  'Tienda | Entre Olas': 'Shop | Entre Olas',
  'Contacto | Entre Olas': 'Contact | Entre Olas',
  'Yoga en Entre Olas': 'Yoga at Entre Olas',

  // ---- Secciones / encabezados ----
  'Clases de surf': 'Surf lessons',
  'Clases Grupales': 'Group Lessons',
  'Clases Individuales': 'Private Lessons',
  'Clases de Surf Grupales': 'Group Surf Lessons',
  'Clases de Surf Individuales': 'Private Surf Lessons',
  'Clases de Yoga': 'Yoga Classes',
  'Clases de Surf Skate': 'Surf Skate Lessons',
  'Surf Skate': 'Surf Skate',
  'Surf Skate en Roche': 'Surf Skate in Roche',
  'Paddle Surf en Conil': 'Paddle Surf in Conil',
  'Alquiler de Material': 'Gear Rental',
  'Más actividades': 'More activities',
  'Lo que dicen nuestros alumnos': 'What our students say',
  'Opiniones reales': 'Real reviews',
  'Reseñas': 'Reviews',
  'Testimonios': 'Testimonials',
  'Review real': 'Real review',
  'Una review vale más que mil palabras': 'A review is worth a thousand words',
  'Vívelo en primera persona': 'Live it firsthand',
  'Preguntas frecuentes': 'Frequently asked questions',
  'Preguntas': 'Questions',
  'Preguntas y respuestas': 'Q&A',
  'Beneficios': 'Benefits',
  'Incluye': 'Includes',
  'Ideal para': 'Ideal for',
  'Elige tu pack': 'Choose your pack',
  'Elige tu material': 'Choose your gear',
  'Fechas disponibles': 'Available dates',
  'Próximos Surf Camps': 'Upcoming Surf Camps',
  'Encuéntranos': 'Find us',
  'Ubicación perfecta': 'Perfect location',
  'Tu evolución': 'Your progress',
  'Completa tu experiencia': 'Complete your experience',
  'Más actividades': 'More activities',

  // ---- Hero / claims home ----
  'Ahorra hasta un 30%': 'Save up to 30%',
  'Aprende surf en la mejor compañía': 'Learn to surf in the best company',
  'Costa de la Luz — El mejor surf del sur de España': 'Costa de la Luz — The best surf in southern Spain',
  'No necesitas experiencia. Solo ganas de pasarlo bien. Elige tu actividad y empieza a surfear.':
    'No experience needed. Just the desire to have fun. Pick your activity and start surfing.',
  'Cuantas más clases, más ahorras': 'The more lessons, the more you save',
  'Cuantas más clases, más ahorras. Packs de 2 a 7 sesiones con material incluido, seguro y grupos reducidos. Válidos 180 días.':
    'The more lessons, the more you save. Packs of 2 to 7 sessions with gear included, insurance and small groups. Valid 180 days.',

  // ---- CTAs / botones ----
  'Reservar tu clase ahora': 'Book your class now',
  'Reserva tu clase ahora': 'Book your class now',
  'Reserva tu plaza': 'Book your spot',
  'Reserva rápida': 'Quick booking',
  'Ver packs': 'See packs',
  'Ver detalle': 'See details',
  'Ver': 'View',
  'Ver clases de surf': 'See surf lessons',
  'Ir a contacto': 'Go to contact',
  'Ir a tienda': 'Go to shop',
  'Añade al carrito': 'Add to cart',
  'Avisarme': 'Notify me',
  'Enviar mensaje': 'Send message',
  'Escríbenos': 'Write to us',
  'Contáctanos': 'Contact us',
  'Contacto directo': 'Direct contact',
  'WhatsApp directo': 'Direct WhatsApp',
  'Reserva 180€': 'Book 180€',

  // ---- Etiquetas / features ----
  'Material incluido': 'Gear included',
  'Material de calidad': 'Quality gear',
  'Material de primera calidad': 'Top-quality gear',
  'Material renovado constantemente': 'Constantly renewed gear',
  'Seguro de accidentes': 'Accident insurance',
  'Todos los niveles': 'All levels',
  'Para todos los niveles': 'For all levels',
  'Todas las edades': 'All ages',
  'Grupos reducidos': 'Small groups',
  'Instructor certificado': 'Certified instructor',
  'Instructor especialista': 'Specialist instructor',
  'Instructor exclusivo': 'Exclusive instructor',
  'Instructores certificados': 'Certified instructors',
  'Instructores surfistas': 'Surfer instructors',
  'Horarios flexibles': 'Flexible schedules',
  'Flexibilidad total de horarios': 'Full schedule flexibility',
  'Análisis de video': 'Video analysis',
  'Circuitos técnicos': 'Technical circuits',
  'Correcciones en tiempo real': 'Real-time corrections',
  'Memoria muscular': 'Muscle memory',
  'Tabla de surf': 'Surfboard',
  'Neopreno': 'Wetsuit',
  'Recogida en la playa': 'Pickup at the beach',
  'Recoge en la playa': 'Pick up at the beach',
  'Rutas guiadas': 'Guided routes',
  'Edad mínima': 'Minimum age',
  'Nivel necesario:': 'Required level:',
  'Plazas:': 'Spots:',
  'Horario': 'Schedule',
  'Estado': 'Status',
  'Lunes – Domingo': 'Monday – Sunday',
  'Próxima fecha': 'Next date',
  'próxima sesión': 'next session',
  'Próximamente': 'Coming soon',
  'Coming Soon': 'Coming Soon',
  'Nueva edición': 'New edition',
  'Oferta': 'Offer',
  'Experiencia +18': '18+ experience',

  // ---- Formulario contacto ----
  'Nombre': 'Name',
  'Asunto': 'Subject',
  'Mensaje': 'Message',
  'Teléfono': 'Phone',
  'Teléfono (opcional)': 'Phone (optional)',
  'Número de teléfono': 'Phone number',
  'Selecciona un tema': 'Select a topic',
  'Otro': 'Other',
  'Envíanos un mensaje': 'Send us a message',
  'Cuéntanos qué necesitas y te responderemos lo antes posible.': "Tell us what you need and we'll reply as soon as possible.",
  'Elige cómo contactarnos': 'Choose how to contact us',
  'Respondemos en menos de 2 horas. Elige el canal que más te convenga.': 'We reply in under 2 hours. Pick the channel that suits you best.',

  // ---- Tienda ----
  'Productos exclusivos de Entre Olas. Ediciones limitadas, hechas con sal y pasión.':
    'Exclusive Entre Olas products. Limited editions, made with salt and passion.',
  'No hay productos disponibles en este momento.': 'No products available at the moment.',
  'Tablas, trajes y más': 'Boards, wetsuits and more',

  // ---- Surf camp ----
  'Villa privada, surf y aventura': 'Private villa, surf and adventure',
  'La experiencia que no olvidarás': "The experience you won't forget",
  'SURF CAMP · NADA ORDINARIO': 'SURF CAMP · NOTHING ORDINARY',
  'Plazas limitadas por edición.': 'Limited spots per edition.',

  // ---- Reseñas (etiquetas) ----
  'Clase grupal · Roche': 'Group class · Roche',
  'Surf Camp · Conil': 'Surf Camp · Conil',

  // ---- Descripciones de actividad ----
  'Aprende a surfear con instructores profesionales. Clases para todos los niveles, material incluido,': 'Learn to surf with professional instructors. Lessons for all levels, gear included,',
  'packs con descuento y Surf Camp +18 en villa privada.': 'discounted packs and an 18+ Surf Camp in a private villa.',
  'Clases privadas con instructor exclusivo. Reserva con solo 15€ y paga el resto en la primera clase. Todos los packs incluyen material, seguro y son válidos 180 días.': 'Private lessons with an exclusive instructor. Book with just 15€ and pay the rest in the first class. All packs include gear, insurance and are valid for 180 days.',
  'Clases de yoga para complementar tu experiencia en el agua y encontrar armonía entre cuerpo y mente. Reserva con solo 15€ y paga el resto en la primera clase. Válidos 365 días.': 'Yoga classes to complement your time in the water and find harmony between body and mind. Book with just 15€ and pay the rest in the first class. Valid 365 days.',
  'Clases en un entorno relajante y tranquilo en Roche, Cádiz.': 'Classes in a relaxing, calm setting in Roche, Cádiz.',
  'Clases y rutas en aguas tranquilas de Conil. Todos los niveles.': 'Lessons and routes in the calm waters of Conil. All levels.',
  'Combina ejercicio, relajación y naturaleza explorando calas y acantilados con instructores certificados. Reserva con solo 15€ y paga el resto en la primera clase. Válidos 365 días.': 'Combine exercise, relaxation and nature exploring coves and cliffs with certified instructors. Book with just 15€ and pay the rest in the first class. Valid 365 days.',
  'Combinamos técnica y rutas guiadas. Explorarás calas escondidas y acantilados de la costa gaditana.': 'We combine technique and guided routes. You\'ll explore hidden coves and cliffs of the Cádiz coast.',
  'Entrena giros, coordinación y memoria muscular con instructores especialistas en surf skate. Reserva con solo 15€ y paga el resto en la primera clase. Válidos 365 días.': 'Train turns, coordination and muscle memory with surf skate specialist instructors. Book with just 15€ and pay the rest in the first class. Valid 365 days.',
  'Material en perfecto estado para todos los niveles. Alquiler por horas, día o semana con reserva online.': 'Gear in perfect condition for all levels. Rent by the hour, day or week with online booking.',
  'Descubre nuestro exclusivo Surf Camp en una villa de lujo con capacidad para 17 personas. Te espera una experiencia inolvidable con pensión completa, clases de surf para todos los niveles, sesiones de yoga, adrenalina en la tirolina y el mejor ambiente.': 'Discover our exclusive Surf Camp in a luxury villa for up to 17 people. An unforgettable experience awaits with full board, surf lessons for all levels, yoga sessions, zip-line adrenaline and the best vibe.',
  'Cada sesión dura 1,5 horas. Incluye calentamiento, ejercicios técnicos, circuitos y análisis.': 'Each session lasts 1.5 hours. It includes warm-up, technical drills, circuits and analysis.',
  'Duración de 90 minutos, tabla, neopreno, seguro de accidentes e instructor certificado. Adaptada a todos los niveles.': '90 minutes, board, wetsuit, accident insurance and certified instructor. Adapted to all levels.',
  'Reserva de 15€ online y el resto se paga en la primera clase. Sin complicaciones.': 'Book 15€ online and pay the rest in the first class. Hassle-free.',
  'Solo 15€ de señal para asegurar tu plaza. El resto se paga en la primera clase.': 'Just a 15€ deposit to secure your spot. The rest is paid in the first class.',
  'Solo 5€ de depósito online. El resto se paga al recoger el material.': 'Only a 5€ deposit online. The rest is paid when you pick up the gear.',

  // ---- "Ideal para" ----
  'Grupos de amigos que quieren compartir la experiencia.': 'Groups of friends who want to share the experience.',
  'Principiantes que quieren aprender en un ambiente motivador.': 'Beginners who want to learn in a motivating setting.',
  'Principiantes que prefieren atención individual sin prisas.': 'Beginners who prefer unhurried one-on-one attention.',
  'Parejas o familias que quieren aprender juntos en privado.': 'Couples or families who want to learn together privately.',
  'Personas con horarios complicados que necesitan flexibilidad.': 'People with busy schedules who need flexibility.',
  'Surfistas intermedios que quieren perfeccionar maniobras específicas.': 'Intermediate surfers who want to refine specific manoeuvres.',
  'Surfistas que buscan progresar con feedback de instructores.': 'Surfers looking to progress with instructor feedback.',
  'Quien busca la mejor relación calidad-precio.': 'Anyone after the best value for money.',

  // ---- FAQ (preguntas) ----
  '¿Cómo funciona la reserva?': 'How does booking work?',
  '¿Cómo funciona?': 'How does it work?',
  '¿Cómo se paga?': 'How do you pay?',
  '¿Cuánto cuesta la reserva?': 'How much is the booking?',
  '¿Cuánto pago al reservar?': 'How much do I pay when booking?',
  '¿Cuánto dura la validez?': 'How long is it valid?',
  '¿Cuánto dura la validez del pack?': 'How long is the pack valid?',
  '¿Cuánto tiempo dura la validez?': 'How long is it valid for?',
  '¿Cuánto tiempo tengo para usar mi pack?': 'How long do I have to use my pack?',
  '¿Qué incluye la clase?': 'What does the class include?',
  '¿Qué incluye cada clase?': 'What does each class include?',
  '¿Qué incluye cada clase grupal?': 'What does each group class include?',
  '¿Qué incluye la clase individual?': 'What does the private class include?',
  '¿Qué duración tienen las clases?': 'How long are the classes?',
  '¿Qué nivel necesito y cuántas plazas hay?': 'What level do I need and how many spots are there?',
  '¿Qué tengo que llevar?': 'What do I need to bring?',
  '¿Qué trabajamos en clase?': 'What do we work on in class?',
  '¿Necesito experiencia previa?': 'Do I need previous experience?',
  '¿Necesito experiencia previa en yoga?': 'Do I need previous yoga experience?',
  '¿Necesito traer mi propia esterilla?': 'Do I need to bring my own mat?',
  '¿Necesito traer mi propio skate?': 'Do I need to bring my own skateboard?',
  '¿Me sirve si soy principiante?': 'Is it suitable if I\'m a beginner?',
  '¿Las clases ayudan a mejorar en el surf?': 'Do the classes help improve your surfing?',
  '¿Realmente mejora mi surf?': 'Does it really improve my surfing?',
  '¿Por qué elegir clases privadas?': 'Why choose private lessons?',
  '¿Por qué paddle surf con nosotros?': 'Why paddle surf with us?',
  '¿Por qué surf skate con nosotros?': 'Why surf skate with us?',
  '¿Por qué yoga con nosotros?': 'Why yoga with us?',
  '¿Cuál es la edad mínima?': 'What is the minimum age?',
  '¿Cuántas personas hay por grupo?': 'How many people per group?',
  '¿Hacemos rutas o es solo clase en la orilla?': 'Do we do routes or is it just shore classes?',
  '¿Hay tallas de neopreno para niños?': 'Are there wetsuit sizes for kids?',
  '¿Para qué niveles es el material?': 'What levels is the gear for?',
  '¿Puedo combinar alquiler con clases?': 'Can I combine rental with lessons?',
  '¿Puedo cambiar de grupal a individual?': 'Can I switch from group to private?',
  '¿Dónde recojo el material?': 'Where do I pick up the gear?',
  '¿Es solo para una persona?': 'Is it just for one person?',
  '¿Dónde está ubicado el Surf Camp y cómo funciona el transporte?': 'Where is the Surf Camp located and how does transport work?',
  '¿Cómo son las habitaciones?': 'What are the rooms like?',
  '¿Hay gastos extra?': 'Are there extra costs?',
  '¿Alergias o dietas especiales?': 'Allergies or special diets?',
  '¿Qué incluyen las comidas y las actividades?': 'What do meals and activities include?',
  '¿Puedo ir solo/a?': 'Can I go on my own?',

  // ---- FAQ (respuestas frecuentes) ----
  'No. Adaptamos cada clase a tu nivel, desde principiante absoluto hasta surfista avanzado que quiere perfeccionar técnica.': 'No. We adapt each class to your level, from absolute beginner to advanced surfer refining technique.',
  'No. Las clases están diseñadas para todos los niveles. Comenzamos con técnica básica en aguas tranquilas.': 'No. Classes are designed for all levels. We start with basic technique in calm waters.',
  'No. Las clases se adaptan a todos los niveles, desde principiantes absolutos hasta practicantes avanzados.': 'No. Classes adapt to all levels, from absolute beginners to advanced practitioners.',
  'No. Nuestras clases son para todos los niveles, desde principiantes absolutos hasta surfistas que quieren perfeccionar técnica.': 'No. Our classes are for all levels, from absolute beginners to surfers refining technique.',
  'No. Todo el material está incluido en la clase: esterillas, bloques y cualquier accesorio necesario.': 'No. All gear is included in the class: mats, blocks and any needed accessories.',
  'No. Todo el material está incluido: surf skate, protecciones y casco.': 'No. All gear is included: surf skate, pads and helmet.',
  'La reserva tiene una validez de 180 días desde la compra.': 'The booking is valid for 180 days from purchase.',
  'Todos los packs tienen una validez de 180 días desde la compra.': 'All packs are valid for 180 days from purchase.',
  'Todos los packs tienen validez de 365 días desde la compra.': 'All packs are valid for 365 days from purchase.',
  'Todos los packs de yoga tienen validez de 365 días desde la compra. Sin prisas.': 'All yoga packs are valid for 365 days from purchase. No rush.',
  'La edad mínima para nuestros Surf Camps es de 18 años.': 'The minimum age for our Surf Camps is 18.',
  'Sí, disponemos de neoprenos a partir de 6 años en todas las tallas.': 'Yes, we have wetsuits from age 6 in all sizes.',
  'Sí. El yoga mejora la flexibilidad, el equilibrio y la concentración, capacidades clave para progresar en el surf.': 'Yes. Yoga improves flexibility, balance and focus, key skills to progress in surfing.',
  'Las clases ya incluyen material. El alquiler es para surfear por tu cuenta fuera de las clases.': 'Classes already include gear. Rental is for surfing on your own outside of classes.',
  'Puede ser para 1 persona o para un grupo privado (pareja, familia, amigos). El precio es por sesión, no por persona.': 'It can be for 1 person or a private group (couple, family, friends). The price is per session, not per person.',

  // ---- Misc ----
  'Roche, Cádiz': 'Roche, Cádiz',
  'Por persona': 'Per person',
  'Disfruta': 'Enjoy',
  'Todo': 'All',
  'WhatsApp': 'WhatsApp',
  'Email': 'Email',
};

const DICTS = { en: EN };

// ---- Caché de auto-traducción (rellena lo que no está en el diccionario) ----
const TR_CACHE_KEY = 'eo_tr_en';
let autoCache = (() => { try { return JSON.parse(localStorage.getItem(TR_CACHE_KEY)) || {}; } catch { return {}; } })();
let _saveTimer = null;
function saveCache() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { try { localStorage.setItem(TR_CACHE_KEY, JSON.stringify(autoCache)); } catch {} }, 400);
}

// Reglas por patrón (precios, sesiones, validez…) — se aplican si no hay match exacto
const PATTERNS = [
  [/^Ahorras (.+)$/, 'Save $1'],
  [/^Resto: (.+) en la primera clase$/, 'Rest: $1 in the first class'],
  [/^Desde (\d+(?:[.,]\d+)?€)$/, 'From $1'],
  [/^Desde (\d+) años en adelante\.?$/, 'From age $1 onwards.'],
  [/^Desde (\d+) años\.?$/, 'From age $1.'],
  [/^Válido (\d+) días$/, 'Valid $1 days'],
  [/^Valido (\d+) dias$/, 'Valid $1 days'],
  [/^Reservar? (\d+(?:[.,]\d+)?€)$/, 'Book $1'],
  [/^Reserva (\d+(?:[.,]\d+)?€) online y el resto se paga en la primera clase\. Sin complicaciones\.$/, 'Book with $1 online and pay the rest in the first class. Hassle-free.'],
  [/^(\d+) min · (\d+) sesi[oó]n$/, '$1 min · $2 session'],
  [/^(\d+) min × (\d+) sesiones$/, '$1 min × $2 sessions'],
  [/^(.+) por clase$/, '$1 per class'],
  [/^Máximo (\d+) personas$/, 'Maximum $1 people'],
  [/^(\d+) Clases?$/, (m, n) => `${n} ${n === '1' ? 'Class' : 'Classes'}`],
  [/^Grupos máx\. (\d+) personas$/, 'Groups of max. $1 people'],
  [/^Grupos reducidos \(máx (\d+)\)$/, 'Small groups (max $1)'],
];
function tryPatterns(key) {
  for (const [re, rep] of PATTERNS) {
    const m = key.match(re);
    if (m) return typeof rep === 'function' ? rep(...m) : key.replace(re, rep);
  }
  return undefined;
}

// Devuelve la traducción conocida (diccionario, patrón o caché) o undefined
function known(key) {
  if (EN[key] !== undefined) return EN[key];
  const p = tryPatterns(key);
  if (p !== undefined) return p;
  return autoCache[key];
}
function translateText(s) {
  const key = s.trim();
  if (!key) return null;
  const hit = known(key);
  if (hit === undefined) return null;
  return s.replace(key, hit);
}

// ¿merece la pena auto-traducir esta cadena? (evita números, símbolos, muy cortas)
function shouldAuto(key) {
  if (key.length < 3 || key.length > 600) return false;
  if (!/[a-záéíóúñü]/i.test(key)) return false;
  return true;
}

const _pending = new Map();
async function fetchTranslation(key) {
  if (known(key) !== undefined) return known(key);
  if (_pending.has(key)) return _pending.get(key);
  const p = (async () => {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(key)}&langpair=es|en&de=entreolasurf@gmail.com`;
      const r = await fetch(url);
      const d = await r.json();
      const t = d && d.responseData && d.responseData.translatedText;
      if (t && d.responseStatus === 200 && !/MYMEMORY WARNING|QUOTA/i.test(t)) {
        autoCache[key] = t; saveCache(); return t;
      }
    } catch {}
    return null;
  })();
  _pending.set(key, p);
  const out = await p;
  _pending.delete(key);
  return out;
}

// Cola de auto-traducción con concurrencia limitada
const _queue = [];
let _active = 0;
function enqueueAuto(key, apply) {
  _queue.push({ key, apply });
  pumpQueue();
}
function pumpQueue() {
  while (_active < 4 && _queue.length) {
    const { key, apply } = _queue.shift();
    _active++;
    fetchTranslation(key).then(t => { if (t) apply(t); }).finally(() => { _active--; pumpQueue(); });
  }
}

const ATTRS = ['placeholder', 'title', 'alt', 'aria-label', 'value'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE']);

export function translateTree(root) {
  if (getLang() !== 'en') return;
  if (!root) root = document.body;
  if (root.nodeType === 1 && root.closest && root.closest('[data-i18n-skip]')) return;

  // Nodos de texto
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && SKIP_TAGS.has(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && node.parentElement.closest('[data-i18n-skip]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    const original = n.nodeValue;
    const out = translateText(original);
    if (out !== null) { n.nodeValue = out; return; }
    const key = original.trim();
    if (shouldAuto(key)) {
      enqueueAuto(key, (t) => { if (n.nodeValue === original) n.nodeValue = original.replace(key, t); });
    }
  });

  // Atributos traducibles
  const els = root.querySelectorAll ? root.querySelectorAll('[placeholder],[title],[alt],[aria-label]') : [];
  els.forEach(el => {
    if (el.closest('[data-i18n-skip]')) return;
    ATTRS.forEach(attr => {
      if (!el.hasAttribute(attr)) return;
      const original = el.getAttribute(attr);
      const out = translateText(original);
      if (out !== null) { el.setAttribute(attr, out); return; }
      const key = original.trim();
      if (shouldAuto(key)) {
        enqueueAuto(key, (t) => { if (el.getAttribute(attr) === original) el.setAttribute(attr, original.replace(key, t)); });
      }
    });
  });
}

// Aplica al documento + marca <html lang>
export function applyLang() {
  const lang = getLang();
  document.documentElement.setAttribute('lang', lang);
  if (lang === 'en') translateTree(document.body);
}

// Inicializa: traduce lo presente y observa contenido dinámico (tabs, modales,
// páginas de actividad, carrito, picker…) para traducirlo según se inserta.
let _observer = null;
export function initI18n() {
  applyLang();
  if (getLang() !== 'en' || _observer) return;
  _observer = new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(n => {
        if (n.nodeType === 1) translateTree(n);
        else if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) {
          const original = n.nodeValue;
          const out = translateText(original);
          if (out !== null) { n.nodeValue = out; return; }
          const key = original.trim();
          if (shouldAuto(key)) enqueueAuto(key, (t) => { if (n.nodeValue === original) n.nodeValue = original.replace(key, t); });
        }
      });
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });
}

// Selector ES/EN (devuelve el HTML del control)
export function langSelectorHtml(variant = 'header') {
  const lang = getLang();
  return `
    <div class="lang-switch lang-switch-${variant}" data-i18n-skip>
      <button class="lang-opt ${lang === 'es' ? 'active' : ''}" data-lang="es">ES</button>
      <span class="lang-sep">/</span>
      <button class="lang-opt ${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
    </div>`;
}

// Enlaza los clicks de un selector dentro de un contenedor
export function wireLangSelector(root) {
  (root || document).querySelectorAll('.lang-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const l = btn.dataset.lang;
      if (l !== getLang()) setLang(l);
    });
  });
}
