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
  'Ahorra hasta un 33%': 'Save up to 33%',
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

  // ---- Hero / subtítulos por actividad ----
  'Perfecciona tu surf con atención personalizada': 'Perfect your surfing with personalized attention',
  'Descubre la tranquilidad del mar sobre una tabla de SUP': 'Discover the calm of the sea on a SUP board',
  'Mejora tu técnica de surf en tierra firme': 'Improve your surf technique on dry land',
  'Equilibrio y bienestar holístico en Roche': 'Balance and holistic wellness in Roche',
  'Hablemos de tu próxima sesión': "Let's talk about your next session",
  'Lleva el mar contigo': 'Take the sea with you',

  // ---- Tarjetas: descripciones y bullets ----
  'Asesoramiento personalizado': 'Personalized advice',
  'Atención 100% personalizada': '100% personalized attention',
  'Atención personalizada para que aproveches al máximo cada sesión.': 'Personalized attention so you get the most out of every session.',
  'Circuitos + análisis video': 'Circuits + video analysis',
  'Complemento al surf': 'A complement to surfing',
  'Desarrolla patrones de movimiento que se transfieren directamente al surf.': 'Develop movement patterns that transfer directly to surfing.',
  'Desde 6 años. Progreso rápido para principiantes.': 'From age 6. Fast progress for beginners.',
  'Desde principiantes hasta practicantes avanzados, sin importar la edad.': 'From beginners to advanced practitioners, regardless of age.',
  'Desde principiantes que quieren familiarizarse hasta surfistas avanzados.': 'From beginners getting familiar to advanced surfers.',
  'Disfruta y devuélvelo al terminar.': "Enjoy it and return it when you're done.",
  'Ejercicio completo': 'Full-body workout',
  'Elige tu material y la duración que necesitas.': 'Choose your gear and the duration you need.',
  'Entrena bottom turns, cutbacks y generación de velocidad fuera del agua.': 'Train bottom turns, cutbacks and speed generation out of the water.',
  'Esterilla y todo lo que necesitas para la práctica sin preocupaciones.': 'Mat and everything you need to practice worry-free.',
  'Explora calas escondidas y acantilados de la costa gaditana.': 'Explore hidden coves and cliffs of the Cádiz coast.',
  'Grabamos y analizamos tu técnica para corregir y progresar más rápido.': 'We record and analyze your technique to correct and progress faster.',
  'Máximo 8 personas por clase para una atención personalizada.': 'Maximum 8 people per class for personalized attention.',
  'Mejora técnica de giro': 'Improve turning technique',
  'Mejora tu flexibilidad, fuerza y enfoque para rendir más sobre la tabla.': 'Improve your flexibility, strength and focus to perform better on the board.',
  'Novedades, vídeos de sesiones y contenido exclusivo en nuestras redes.': 'News, session videos and exclusive content on our social media.',
  'Objetivos específicos': 'Specific goals',
  'Practica cuando quieras sin importar las condiciones del oleaje.': 'Practice whenever you want, regardless of wave conditions.',
  'Profesionales con experiencia que adaptan la clase a cada nivel.': 'Experienced professionals who adapt the class to each level.',
  'Profesionales con formación en yoga que adaptan la clase a cada nivel.': 'Yoga-trained professionals who adapt the class to each level.',
  'Progreso más rápido y efectivo': 'Faster, more effective progress',
  'Recoge en la playa el material listo para usar.': 'Pick up your ready-to-use gear at the beach.',
  'Reserva online con solo 5€': 'Book online with just 5€',
  'Añade al carrito y reserva online con solo 5€.': 'Add to cart and book online with just 5€.',
  'Reserva por web, WhatsApp o email. Te ayudamos a elegir clases, packs o Surf Camp.': 'Book via web, WhatsApp or email. We help you choose lessons, packs or Surf Camp.',
  'Ritmo adaptado a ti': 'Pace adapted to you',
  'Sin depender del mar': 'No need to rely on the sea',
  'Tabla SUP + remo + chaleco': 'SUP board + paddle + vest',
  'Tabla SUP, remo y chaleco incluidos en cada sesión.': 'SUP board, paddle and vest included in every session.',
  'Teoría + práctica': 'Theory + practice',
  'Todas las tallas y medidas': 'All sizes',
  'Todos nuestros instructores son surfistas experimentados y especialistas en surf skate.': 'All our instructors are experienced surfers and surf skate specialists.',
  'Trabaja todo el cuerpo, especialmente el core, de forma suave para articulaciones.': 'Works the whole body, especially the core, gently on the joints.',
  'Tabla SUP': 'SUP board',

  // ---- Combos de meta (duración · plazas · material…) ----
  '90 minutos': '90 minutes',
  '90 minutos · Máx. 6 personas · Material incluido · Todos los niveles': '90 minutes · Max. 6 people · Gear included · All levels',
  '90 minutos · 1 persona o grupo privado · Material incluido · Objetivos a medida': '90 minutes · 1 person or private group · Gear included · Tailored goals',
  '1,5 h por sesión · Material incluido · Todos los niveles · Validez 365 días': '1.5 h per session · Gear included · All levels · Valid 365 days',
  'Grupos reducidos · Material incluido · Todos los niveles · Validez 365 días': 'Small groups · Gear included · All levels · Valid 365 days',
  'Desde 6 años · Material incluido · Grupos reducidos · Validez 365 días': 'From age 6 · Gear included · Small groups · Valid 365 days',

  // ---- Surf camp (etiquetas y metas) ----
  '4 días / 3 noches': '4 days / 3 nights',
  '5 días / 4 noches': '5 days / 4 nights',
  '5 días de experiencia • Pensión completa • Ambiente +18': '5-day experience • Full board • 18+ vibe',
  'Dos villas unidas • Pensión completa • Transporte y actividades': 'Two joined villas • Full board • Transport and activities',
  'Villa privada • Pensión completa • Clases y material': 'Private villa • Full board • Lessons and gear',
  'todos los niveles · pensión completa · experiencia +18.': 'all levels · full board · 18+ experience.',
  'Pensión completa': 'Full board',

  // ---- Testimonios (reseñas) ----
  '«El análisis de video es lo que marca la diferencia. Ves los errores y los corriges en el momento. Muy profesional.»': '"Video analysis is what makes the difference. You see your mistakes and fix them on the spot. Very professional."',
  '«El pack de 5 clases merece mucho la pena. Cada sesión fuimos a rutas distintas y descubrimos rincones espectaculares.»': '"The 5-class pack is really worth it. Each session we went on different routes and discovered spectacular spots."',
  '«Grupos pequeños, buena guía y un entorno espectacular. Se nota la mejoría en la flexibilidad y en el surf también.»': '"Small groups, great guidance and a spectacular setting. You really notice the improvement in flexibility and in surfing too."',
  '«Ideal para hacer en familia. Los niños de 7 y 9 años lo pasaron genial y aprendieron rápido. Repetiremos seguro.»': '"Ideal for the whole family. Our 7- and 9-year-olds had a great time and learned fast. We\'ll definitely be back."',
  '«Nunca había hecho yoga y las instructoras me hicieron sentir muy cómoda. Ahora es parte de mi rutina cuando visito Roche.»': '"I had never done yoga and the instructors made me feel very comfortable. Now it\'s part of my routine when I visit Roche."',
  '«Una forma increíble de entrenar cuando no hay olas. Los instructores conectan perfectamente los movimientos de skate con el surf real.»': '"An incredible way to train when there are no waves. The instructors perfectly connect skate moves with real surfing."',

  // ---- Home: tarjetas de actividad ----
  '90 min · Atención 100% personalizada · Progresa el doble de rápido': '90 min · 100% personalized attention · Progress twice as fast',
  '90 min · Máx. 6 personas · Material y seguro incluidos': '90 min · Max. 6 people · Gear and insurance included',
  'Entrenamiento técnico en tierra para mejorar maniobras y equilibrio.': 'Technical training on land to improve manoeuvres and balance.',
  'Sesiones al aire libre para complementar tu evolución en el agua.': 'Outdoor sessions to complement your progress in the water.',
  'Tablas, neoprenos, paddle, bodyboard y skate. Sin complicaciones.': 'Boards, wetsuits, paddle, bodyboard and skate. Hassle-free.',
  'Villa privada +1000 m², piscina, pensión completa, transporte, surf todos los días, aventura y fiestas. Plazas limitadas por edición.': 'Private villa +1000 m², pool, full board, transport, surf every day, adventure and parties. Limited spots per edition.',
  'Surf Camp +18': '18+ Surf Camp',
  'Edición Especial: Camisa Negra y Amarilla · 22€': 'Special Edition: Black & Yellow Shirt · 22€',
  'Edición Especial: Camisa Blanca y Negra · 22€': 'Special Edition: Black & White Shirt · 22€',
  'Progresa el doble de rápido': 'Progress twice as fast',
  '/clase': '/class',
  'Teléfono: +34 634 46 61 30': 'Phone: +34 634 46 61 30',

  // ---- Surf camp landings: etiquetas comunes ----
  'Alojamiento': 'Accommodation',
  'Aventura': 'Adventure',
  'Transporte': 'Transport',
  'Transporte incluido': 'Transport included',
  'Habitaciones': 'Rooms',
  'Plazas limitadas': 'Limited spots',
  'Plazas limitadas — solo 17 por edición': 'Limited spots — only 17 per edition',
  'Reservar ahora': 'Book now',
  'Reservar online': 'Book online',
  'Reserva con 180€ · resto la semana antes del trip.': 'Book with 180€ · rest the week before the trip.',
  '5 días completos': '5 full days',
  'Seguro incluido': 'Insurance included',

  // ---- Surf camp landings: descripciones de las tarjetas ----
  '3 clases con monitor titulado + material de surf disponible 24h para practicar por tu cuenta.': '3 lessons with a certified instructor + surf gear available 24h to practice on your own.',
  'Clases con monitor titulado durante 5 días + material de surf disponible 24h para practicar por tu cuenta.': 'Lessons with a certified instructor for 5 days + surf gear available 24h to practice on your own.',
  'Desayunos, comidas, cenas y BBQ de bienvenida. Una cena libre para disfrutar la gastronomía local.': 'Breakfasts, lunches, dinners and a welcome BBQ. One free dinner to enjoy the local cuisine.',
  'Desde individuales hasta compartidas. La distribución se organiza en el check-in según disponibilidad.': 'From private to shared. Room allocation is organized at check-in based on availability.',
  'Dos villas con variedad de habitaciones. La distribución se organiza en el check-in según disponibilidad.': 'Two villas with a variety of rooms. Allocation is organized at check-in based on availability.',
  'Dos villas privadas unidas con piscina, jardín y zonas comunes. A 2 min de la playa.': 'Two joined private villas with pool, garden and common areas. 2 min from the beach.',
  'Villa privada de lujo con piscina, jardín, terraza y zonas comunes. A 7 min de la playa.': 'Luxury private villa with pool, garden, terrace and common areas. 7 min from the beach.',
  'Ida y vuelta incluido desde aeropuerto de Jerez, Sevilla o estación de San Fernando Bahía Sur.': 'Round trip included from Jerez or Seville airport, or San Fernando Bahía Sur station.',
  'Parque de tirolinas, rutas por la naturaleza y actividades al aire libre.': 'Zip-line park, nature routes and outdoor activities.',
  'Seguro de viaje incluido en el precio. Viaja con total tranquilidad.': 'Travel insurance included in the price. Travel with complete peace of mind.',
  'Un día extra respecto a las ediciones estándar para disfrutar más surf, más playa y más experiencia.': 'An extra day compared to standard editions to enjoy more surf, more beach and more experience.',

  // ---- Surf camp landings: heros / claims por edición ----
  '4 días +18 en villa privada de lujo con todo resuelto. Tú trae la maleta, nosotros nos encargamos del resto.': '4 days, 18+, in a luxury private villa with everything sorted. Just bring your suitcase, we handle the rest.',
  '4 días inolvidables en villa de lujo. Surf, fiesta, pensión completa y transporte incluido. +18.': '4 unforgettable days in a luxury villa. Surf, party, full board and transport included. 18+.',
  'Edición especial de 4 días con todo incluido: transporte, pensión completa, clases de surf, material y seguro. +18.': 'Special 4-day edition, all-inclusive: transport, full board, surf lessons, gear and insurance. 18+.',
  'El plan definitivo: dos villas unidas a 2 min de la playa, transporte incluido, hasta 15 influencers invitados y el mejor ambiente. +18.': 'The ultimate plan: two joined villas 2 min from the beach, transport included, up to 15 invited influencers and the best vibe. 18+.',
  'La edición más larga: 5 días de surf, aventura y fiesta en villa privada con todo incluido. +18.': 'The longest edition: 5 days of surf, adventure and party in a private villa, all-inclusive. 18+.',
  '¡Últimas plazas Surf House 20–23 Marzo!': 'Last spots Surf House 20–23 March!',
  '10–13 Abril · Dos villas, doble diversión': '10–13 April · Two villas, double the fun',
  '16–19 Abril · Villa privada, surf y aventura': '16–19 April · Private villa, surf and adventure',
  '20–23 Marzo · Villa privada, surf y aventura': '20–23 March · Private villa, surf and adventure',
  '9–13 Septiembre · 5 días para alargar el verano': '9–13 September · 5 days to extend the summer',
  'Surf Camp Conil · 20–23 Marzo': 'Surf Camp Conil · 20–23 March',
  'Surf Camp x Sambatrips · 16–19 Abril': 'Surf Camp x Sambatrips · 16–19 April',
  'Surf Camp Entre Olas · 10–13 Septiembre': 'Surf Camp Entre Olas · 10–13 September',
  'Surf Camp XXL · 10–13 Abril': 'Surf Camp XXL · 10–13 April',
  '10–13 Abril': '10–13 April',
  '16–19 Abril': '16–19 April',
  '20–23 Marzo': '20–23 March',
  '9–13 Septiembre': '9–13 September',

  // ---- Surf camp landing ads: ficha técnica ----
  'Precio': 'Price',
  'Plazas': 'Spots',
  'Nivel': 'Level',
  'Ubicación': 'Location',
  'Comidas': 'Meals',
  'Actividades': 'Activities',
  'Reserva hoy': 'Book today',
  'Cupón 10%': 'Coupon 10%',
  'Resto la semana antes del trip.': 'Rest the week before the trip.',
  '17 plazas.': '17 spots.',
  '18 años.': '18 years.',
  'Desde iniciación hasta avanzados.': 'From beginner to advanced.',
  'Incluido (Jerez, Sevilla y San Fernando Bahía Sur).': 'Included (Jerez, Seville and San Fernando Bahía Sur).',
  'Individuales y compartidas, distribución al check-in.': 'Private and shared, allocation at check-in.',
  'Pensión completa + BBQ de bienvenida (1 cena libre).': 'Full board + welcome BBQ (1 free dinner).',
  'Surf, aventura, pool parties y atardeceres.': 'Surf, adventure, pool parties and sunsets.',
  'Av. América, 4, 11149 Roche, Cádiz (7 min playa).': 'Av. América, 4, 11149 Roche, Cádiz (7 min beach).',

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
  [/^Validez (\d+) días$/, 'Valid $1 days'],
  [/^(\d+) sesión$/, '$1 session'],
  [/^(\d+) sesiones$/, '$1 sessions'],
  [/^([\d.,]+) h · (\d+) sesión$/, '$1 h · $2 session'],
  [/^([\d.,]+) h × (\d+) sesiones$/, '$1 h × $2 sessions'],
  [/^Desde (\d+(?:[.,]\d+)?€)\s*\/clase$/, 'From $1 /class'],
  [/^(\d+) clases -(\d+)%$/, '$1 classes -$2%'],
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

// OJO: NO traducir 'value' — alteraría valores de formularios/selects y rompería envíos.
const ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];
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
