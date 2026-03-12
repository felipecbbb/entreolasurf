# Sistema de Reservas con Bonos, Familia y Calendario — Progreso

## Estado general: FASES 1-6 COMPLETADAS, FASE 7 PENDIENTE

---

## FASE 1: Migración de Base de Datos ✅

**Archivo:** `supabase/migration-reservation-system.sql`

### Tablas nuevas creadas
- **`family_members`** — Sub-perfiles familiares (nombre, fecha nacimiento, nivel, notas). RLS: usuario solo ve/edita los suyos, admin ve todos.
- **`bonos`** — Packs de créditos comprados. Campos: user_id, order_id, class_type (grupal/individual/yoga/paddle/surfskate), total_credits, used_credits, status (active/expired/exhausted/cancelled), expires_at. RLS: usuario lee los suyos, admin gestiona todos.
- **`class_enrollments`** — Inscripciones a clases concretas. Campos: class_id, user_id, family_member_id (nullable), bono_id, status (confirmed/cancelled/completed/no_show). Constraint UNIQUE(class_id, user_id, family_member_id). RLS: usuario lee las suyas, admin gestiona todas.

### Modificaciones a `surf_classes`
- Constraint `type` expandido: `grupal`, `individual`, `yoga`, `paddle`, `surfskate`
- Nuevos campos: `level` (principiante/intermedio/avanzado/todos), `published` (boolean), `enrolled_count` (int)

### Triggers automáticos
1. **`update_enrolled_count`** — INSERT/UPDATE/DELETE en class_enrollments → recalcula `surf_classes.enrolled_count` contando enrollments confirmed
2. **`update_bono_credits`** — INSERT/UPDATE/DELETE en class_enrollments → recalcula `bonos.used_credits`, marca `exhausted` si se agotan, vuelve a `active` si se cancela

### Funciones atómicas (RPC)
1. **`book_class(p_class_id, p_bono_id, p_family_member_id)`**
   - Usa `FOR UPDATE` locks en bono y clase
   - Verifica: autenticado, bono pertenece al usuario, bono activo y no expirado, créditos disponibles, clase publicada, plazas libres, tipo bono = tipo clase, clase futura, miembro familiar pertenece al usuario
   - Crea enrollment → triggers actualizan contadores
   - Retorna enrollment_id

2. **`cancel_enrollment(p_enrollment_id)`**
   - Verifica: autenticado, enrollment del usuario, estado confirmed, clase futura (>2h antes)
   - Actualiza status a cancelled → triggers devuelven crédito y liberan plaza

### Estado: Pendiente de ejecutar en Supabase SQL Editor

---

## FASE 2: Módulos compartidos (lib/) ✅

### `lib/family.js` (~35 líneas)
- `fetchFamilyMembers()` — Lista todos los miembros del usuario autenticado
- `createFamilyMember({ full_name, birth_date, level, notes })` — Crea miembro
- `updateFamilyMember(id, fields)` — Actualiza miembro
- `deleteFamilyMember(id)` — Elimina miembro

### `lib/bonos.js` (~25 líneas)
- `fetchUserBonos()` — Todos los bonos del usuario (cualquier estado)
- `fetchActiveBonos(classType)` — Solo bonos activos, no expirados, con créditos restantes, filtrados por tipo

### `lib/booking.js` (~50 líneas)
- `bookClass(classId, bonoId, familyMemberId)` — Llama a `supabase.rpc('book_class')`
- `cancelEnrollment(enrollmentId)` — Llama a `supabase.rpc('cancel_enrollment')`
- `fetchPublishedClasses(filters)` — Clases publicadas, scheduled, futuras. Filtros opcionales: type, level, date
- `fetchUserEnrollments()` — Inscripciones del usuario con joins a surf_classes, family_members, bonos

---

## FASE 3: Checkout modificado ✅

**Archivo:** `finalizar-compra/checkout.js`

### Cambios realizados
- **Detección de packs de clases**: Si el carrito tiene items `class_reservation` y el usuario no está logueado → muestra mensaje amarillo pidiendo registro/login + bloquea submit
- **Creación de bonos**: En vez de insertar en `class_bookings`, ahora inserta en `bonos` con:
  - `total_credits` = sessions × quantity
  - `expires_at` = 180 días para surf (grupal/individual), 365 días para yoga/paddle/surfskate
  - `status` = 'active'
- **Mensaje post-compra**: Si se compraron clases, muestra link a Mi cuenta para reservar en el calendario
- **Guest checkout**: Sigue funcionando para productos y camps, pero se bloquea para packs de clases

### Función auxiliar nueva
- `getBonoExpiry(classType)` — Calcula fecha de expiración según tipo

---

## FASE 4: Panel del Cliente (mi-cuenta/) ✅

### `mi-cuenta/account.js` — Reescrito
- **7 tabs**: Mis datos | Mi Familia | Mis Bonos | Reservar Clases | Mis Clases | Mis Pedidos | Cerrar sesión
- **Lazy loading**: Cada tab se carga solo al hacer click por primera vez (Set `loaded`)
- **Función `switchTab()`**: Permite navegación programática entre tabs (ej: desde Bonos → Calendario)
- Imports de los 4 módulos de tabs nuevos

### `mi-cuenta/tabs/family.js`
- Lista de miembros familiares en cards (nombre, nivel, fecha nacimiento, notas)
- Formulario inline toggle para añadir/editar (reutiliza el mismo form)
- Botón eliminar con `confirm()`
- Tras cada operación CRUD → re-render

### `mi-cuenta/tabs/bonos.js`
- Cards por bono activo: badge de tipo, barra de progreso visual (`bono-progress-bar`), contador "X/Y clases usadas", fecha caducidad
- Bonos inactivos (agotados/expirados) en sección inferior con opacidad reducida
- Botón "Reservar clase" en bonos activos → llama `switchTab('calendario')`
- Recibe `switchTab` como segundo parámetro de `renderBonos()`

### `mi-cuenta/tabs/calendar.js` — El más complejo
- **Filtros**: Select de tipo de clase + select de nivel
- **Tira de fechas**: 10 días con flechas prev/next (offset de 10 en 10)
- **Lista de clases**: Cards con hora (Bebas Neue), tipo badge, instructor, nivel, plazas (X/Y con badge verde/rojo)
- **Modal de reserva**:
  - "¿Para quién?" → select con "Yo mismo" + miembros familiares
  - "Usar bono:" → select con bonos activos del tipo correcto y créditos restantes
  - Si no hay bonos → mensaje informativo, botón confirmar oculto
  - Confirmar → `bookClass()` RPC → toast + re-render
- **Toast propio**: `.account-toast` con animación CSS

### `mi-cuenta/tabs/enrollments.js`
- **Próximas clases**: Cards con título, tipo badge, fecha, horario, instructor, asistente (nombre familiar o "Yo")
  - Botón "Cancelar reserva" (habilitado solo si >2h antes de la clase)
  - Cancelar → `confirm()` → `cancelEnrollment()` → re-render
- **Historial**: `<details>` colapsable con clases pasadas/canceladas en opacidad reducida

---

## FASE 5: Panel de Admin ✅

### `admin/sections/clases.js` — Modificado
- **5 tipos**: grupal, individual, yoga, paddle, surfskate (con labels legibles)
- **Campo nivel** en tabla y modal (todos/principiante/intermedio/avanzado)
- **Checkbox "Publicada"** en modal + columna "Publicada" en tabla con badge verde ✓
- **Columna "Inscritos"**: Muestra enrolled_count/max_students
- **Bulk publish**: Checkboxes en primera columna + botón "Publicar seleccionadas"
- Checkbox handling en submit: `obj.published = e.target.published.checked`

### `admin/sections/calendario.js` — Nuevo
- **Vista semanal**: Grid 7 columnas (Lun-Dom), headers con color navy
- **Navegación**: Flechas ← Anterior / Siguiente → por semanas
- **Mini-cards por clase**: Hora, título, inscritos/max, indicador published (borde amarillo izquierdo)
- **Click en slot** → Modal con detalle de clase + lista de inscritos (nombre + estado)
- **Botón "Publicar semana"**: Publica todas las clases no publicadas de la semana visible
- Usa `fetchClassesInRange()` y `fetchClassEnrollments()` de api.js

### `admin/sections/bonos-admin.js` — Nuevo
- **Tabla de bonos**: Cliente, tipo, créditos (used/total), estado, caducidad, fecha creación
- **Filtro por estado**: Select con active/exhausted/expired/cancelled
- **Click "Ver detalle"** → Modal con:
  - Barra de progreso visual
  - Todos los campos del bono
  - Referencia al pedido (order_id)
- Usa `fetchAllBonos()` de api.js

### `admin/modules/api.js` — 4 funciones nuevas
- `fetchClassesInRange(dateFrom, dateTo)` — Clases en rango de fechas, ordenadas por fecha+hora
- `fetchClassEnrollments(classId)` — Enrollments de una clase con joins a profiles y family_members
- `publishClasses(ids)` — Update masivo `published: true` con `.in('id', ids)`
- `fetchAllBonos(statusFilter)` — Todos los bonos con join a profiles, filtro opcional por estado

### `admin/admin.js` — Modificado
- Imports: `renderCalendario`, `renderBonosAdmin`
- Routes: `register('calendario', renderCalendario)`, `register('bonos', renderBonosAdmin)`

### `admin/modules/router.js` — Modificado
- `sectionTitles`: Añadidos `calendario: 'Calendario'` y `bonos: 'Bonos'`

### `admin/index.html` — Modificado
- Sidebar: 2 nuevos `<li>` entre Clases y Productos:
  - `#calendario` con icono 📅
  - `#bonos` con icono 🎫

---

## FASE 6: CSS ✅

### `style.css` — ~200 líneas nuevas (después de línea 2270 original)
- **Bono cards**: `.bono-card`, `.bono-dimmed`, `.bono-type-badge` (amarillo, Space Grotesk, uppercase), `.bono-counter` (Bebas Neue), `.bono-progress` + `.bono-progress-bar` (amarillo sobre gris)
- **Date strip**: `.date-strip` (flex, scroll horizontal), `.date-strip-arrow`, `.date-strip-day` + `.active` (amarillo), `.date-strip-weekday`, `.date-strip-num`
- **Class slot cards**: `.class-slot-card`, `.class-slot-full`, `.class-slot-header`, `.class-slot-time`, `.class-slot-body`, `.class-slot-footer`, `.spots-badge` + `.spots-full`
- **Family cards**: `.family-member-card`, `.family-member-info`, `.family-member-actions`, `.family-form` (background sand)
- **Booking modal**: `.booking-modal` (overlay fixed), `.booking-modal-content` (card centrada)
- **Account toast**: `.account-toast` + `.visible` (fixed bottom center, animación opacity+translate)
- **Responsive**: `@media 620px` para account-tabs wrap y date-strip compacta

### `admin/admin.css` — ~80 líneas nuevas
- **Calendar grid**: `.admin-calendar-grid` (7 columnas), `.admin-cal-day`, `.admin-cal-day-header` (navy), `.admin-cal-slot` + `.published` (borde amarillo izquierdo), `.admin-cal-slot-time/title/meta`
- **Published badge**: `.published-badge` (verde)
- **Enrollment list**: `.enrollment-list` (max-height scroll)
- **Responsive**: `@media 820px` → 3 columnas, `@media 520px` → 2 columnas

---

## FASE 7: Notificaciones (Edge Functions) ❌ PENDIENTE

### Email de confirmación
- Trigger: webhook en INSERT class_enrollments
- Contenido: fecha, hora, tipo, instructor, quién asiste
- Servicio sugerido: Resend vía Supabase Edge Function

### Email recordatorio
- Cron diario a las 20:00
- Consulta enrollments del día siguiente con status confirmed
- Envía recordatorio con detalles de la clase

### WhatsApp (fase posterior, opcional)
- WhatsApp Business API vía Twilio

### Requiere
- Configurar Supabase Edge Functions
- API key de Resend u otro servicio de email
- Configurar webhook/cron en Supabase Dashboard

---

## Resumen de archivos

### Archivos nuevos (8)
| Archivo | Líneas aprox | Descripción |
|---------|-------------|-------------|
| `supabase/migration-reservation-system.sql` | ~220 | Tablas, triggers, funciones RPC, RLS |
| `lib/family.js` | ~35 | CRUD miembros familiares |
| `lib/bonos.js` | ~25 | Consultas de bonos del usuario |
| `lib/booking.js` | ~50 | Reservas y cancelaciones vía RPC |
| `mi-cuenta/tabs/family.js` | ~110 | Tab familia en cuenta cliente |
| `mi-cuenta/tabs/bonos.js` | ~70 | Tab bonos en cuenta cliente |
| `mi-cuenta/tabs/calendar.js` | ~170 | Tab calendario/reservas en cuenta cliente |
| `mi-cuenta/tabs/enrollments.js` | ~90 | Tab mis clases en cuenta cliente |
| `admin/sections/calendario.js` | ~100 | Vista semanal admin |
| `admin/sections/bonos-admin.js` | ~90 | Gestión bonos admin |

### Archivos modificados (9)
| Archivo | Cambios |
|---------|---------|
| `finalizar-compra/checkout.js` | Crea bonos en vez de class_bookings, requiere login para packs |
| `mi-cuenta/account.js` | 7 tabs con lazy loading, imports de tab modules |
| `style.css` | +200 líneas CSS (bonos, calendario, familia, modal, toast) |
| `admin/admin.css` | +80 líneas CSS (calendar grid, published badge) |
| `admin/admin.js` | +2 imports, +2 register() |
| `admin/modules/router.js` | +2 sectionTitles |
| `admin/modules/api.js` | +4 funciones export |
| `admin/sections/clases.js` | 5 tipos, nivel, published, bulk publish, enrolled_count |
| `admin/index.html` | +2 nav items en sidebar |

---

## Verificación / Testing

### Build
- `npx vite build` → ✅ Compila sin errores

### Tests funcionales pendientes (requieren migración SQL ejecutada)
1. **Familia**: Crear miembro → aparece en lista → editar → eliminar
2. **Compra bono**: Pack al carrito → checkout logueado → bono creado en "Mis Bonos"
3. **Admin publica**: Crear clase → marcar published → visible en calendario cliente
4. **Reservar**: Seleccionar clase → elegir quién va → confirmar → crédito descontado
5. **Reserva compartida**: Padre reserva 2 hijos → 2 créditos del mismo bono
6. **Cancelar**: Cancelar reserva → crédito devuelto, plaza liberada
7. **Bono agotado**: Todos los créditos usados → "exhausted" → no más reservas
8. **Clase llena**: max_students alcanzado → "Clase completa"
9. **Guest + pack**: Intento sin login → mensaje pidiendo registro
10. **Notificación**: (pendiente FASE 7)

---

## Notas técnicas

- **Import paths**: lib/ usa rutas absolutas `/lib/...`, admin usa relativas `../modules/...`, tabs usan absolutas `/lib/...` y `/mi-cuenta/tabs/...`
- **Patrón admin sections**: `export async function renderXxx(container)` con inner `async function render()` para re-render tras mutaciones
- **Patrón tabs cliente**: Cada tab exporta una función async que recibe el panel DOM element, renderiza HTML y bindea eventos
- **Race conditions**: Manejadas con `FOR UPDATE` locks en las funciones RPC de PostgreSQL
- **Expiración bonos**: Surf (grupal/individual) = 180 días, Otros (yoga/paddle/surfskate) = 365 días
- **Cancelación**: Solo posible >2h antes del inicio de la clase
- **UNIQUE constraint**: (class_id, user_id, family_member_id) evita reservas duplicadas para la misma persona en la misma clase
