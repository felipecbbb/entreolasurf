# Ficha de Reserva — Panel de Detalle

## Visión General

La ficha de reserva es un panel fullscreen que muestra toda la información de una inscripción (enrollment) en una clase. Se abre al hacer click en un cliente inscrito en el calendario.

**Archivo:** `admin/sections/calendario.js` — función `openReservationDetail(res, overlay)`

## Flujo de Apertura

### Desde el calendario (click en cliente inscrito)
1. El click handler (línea ~616) detecta `itemType === 'enrollment'`
2. Carga asincrónicamente:
   - `enrollment` desde `enrollmentsCache[classId]`
   - `profile` del usuario desde Supabase (`profiles` table)
   - `familyMember` si `enrollment.family_member_id` existe
   - `payments` desde la tabla `payments` (tipo 'enrollment')
   - `bonos` activos del usuario para ese tipo de clase
3. Construye el objeto `res` con toda la data
4. Crea un overlay fullscreen y llama a `openReservationDetail(res, overlay)`

### Desde el booking panel (después de crear reserva)
1. El paso 3 del booking panel construye el `res` directamente con los datos del formulario
2. Reutiliza el mismo overlay del booking panel
3. Llama a `openReservationDetail(res, overlay)`

## Objeto `res` (Datos de la Reserva)

```js
{
  id: string,                    // enrollment ID (UUID)
  persons: [{                    // Array de personas en la reserva
    id: string,                  // ID local (ej: 'p1' o timestamp)
    nombre: string,
    apellidos: string,
    profileId: string | null,    // UUID del perfil vinculado
    profileName: string | null,
    familyMemberId: string | null,
    sessions: [string],          // IDs de clases asignadas
  }],
  sessions: [{                   // Clases/sesiones reservadas
    id: string,                  // class ID
    date: string,                // YYYY-MM-DD
    time_start: string,          // HH:MM:SS
    time_end: string,
    type: string,                // grupal, individual, yoga, etc.
    title: string,
  }],
  contact: {                     // Datos de contacto
    nombre, apellidos, email, telefono, pais, idioma
  },
  profile: object | null,        // Perfil completo de Supabase
  familyMember: object | null,   // Familiar si aplica
  activityColor: string,         // Color hex del tipo de actividad
  activityLabel: string,         // Nombre de la actividad
  activityType: string,          // Tipo de clase
  totalFinal: number,            // Precio total (del bono si vinculado)
  pending: number,               // Pendiente de pago
  payments: array,               // Pagos registrados
  personCredits: object,         // Bonos y créditos por persona
  linkedBonoId: string | null,   // ID del bono vinculado al enrollment
  status: string,                // 'paid' | 'confirmed'
  createdAt: Date,
  discount: number,
  cobrarAnticipo: boolean,
  anticipoAmount: number,
  paymentMethod: string,
}
```

## Tabs del Panel

### 1. Resumen (tab principal)
- **Header**: ID reserva, fecha creación, total y pendiente
- **Contacto**: nombre, teléfono (WhatsApp), email del responsable
- **Check in/out**: fechas de las sesiones
- **Bonos y Saldo**:
  - Tarjetas de bonos activos del cliente para ese tipo de clase
  - Si el enrollment tiene `bono_id`, el bono aparece pre-seleccionado
  - Bonos pagados: borde verde, badge "PAGADO" o "En uso · Pagado"
  - Bonos con pendiente: barra de progreso naranja + botón "Pagar X€"
  - Saldo a favor: se carga async desde `profiles.credit_balance`
- **Personas**: tarjeta por persona con sesiones asignadas

### 2. Datos del Comprador
- Si es **familiar**: dos secciones
  - "Beneficiario (familiar)": nombre, fecha nacimiento, edad del family_member
  - "Titular de la cuenta": nombre, email, teléfono, dirección del profile
- Si es **titular directo**: datos del perfil (full_name, email, phone, address, city, postal_code)

### 3. Datos Internos
- ID reserva, fecha creación, estado, origen
- Textarea para notas internas

### 4. Pagos
- Resumen: total reserva, descuento, total pagado, pendiente
- Historial de pagos con fecha, método y importe
- Botón "+ Añadir pago"
- Soporta campos de DB (`payment_method`, `payment_date`) y campos locales (`method`, `date`)

### 5. Histórico
- **Timeline de la reserva**: creación, anticipo, todos los pagos registrados
- **Historial del cliente** (carga async):
  - Estadísticas: asistencias, cancelaciones, total reservas
  - Saldo a favor del cliente
  - Tabla de últimas 20 inscripciones con fecha, actividad, hora, estado, asistencia
  - Bonos del usuario con créditos restantes y estado de pago

## Sidebar Derecha (Acciones)

| Acción | Comportamiento |
|--------|---------------|
| Cancelar | Elimina enrollment de DB (`deleteEnrollment`) o marca como 'cancelled' |
| Ampliar | Cierra panel y abre booking panel para la misma clase |
| Enviar Email | Placeholder (próximamente) |

## Sistema de Bonos

### Concepto
- Un **bono** es un pack de clases prepagadas (ej: 5 clases grupales)
- Cada inscripción (`class_enrollment`) puede estar vinculada a un bono via `bono_id`
- Si está vinculada, la sesión está cubierta por el bono — no hay coste adicional
- El pendiente mostrado es el del bono, no de la sesión individual

### Estados del bono en el panel
| Estado | Visual | Acción disponible |
|--------|--------|------------------|
| Pagado + seleccionado | Borde verde, shadow verde, badge "En uso · Pagado" | Click para deseleccionar |
| Pagado + no seleccionado | Borde verde, fondo verde claro, badge "PAGADO" | Click para seleccionar |
| Pendiente + seleccionado | Borde amarillo, fondo amarillo, badge "En uso" | Botón "Pagar X€" |
| Pendiente + no seleccionado | Borde gris, badge "Disponible" | Click para seleccionar + botón pagar |

### Cálculo de precios del bono
```js
// Precio esperado según pack pricing
expectedPrice = getPackPrice(classType, totalCredits, classFallbackPrice)

// Total pagado real (payments en DB o total_paid del bono)
totalPaidReal = payments.reduce(sum) || bono.total_paid

// Pendiente (redondeado a 2 decimales para evitar floating point)
pendingAmount = Math.max(0, Math.round((expectedPrice - totalPaidReal) * 100) / 100)

// Está totalmente pagado
isFullyPaid = pendingAmount <= 0
```

## Sistema de Pagos

### Persistencia
Todos los pagos se guardan en la tabla `payments` de Supabase:
- `reservation_type`: 'enrollment' | 'rental'
- `reference_id`: UUID del enrollment o bono
- `amount`: importe
- `payment_method`: 'efectivo' | 'tarjeta' | 'transferencia' | 'voucher' | 'saldo' | 'online'
- `concept`: descripción del pago

### Modales de pago
1. **Añadir Pago** (`openAddPaymentModal`):
   - Input importe + select método
   - Opción "Usar saldo a favor" si el cliente tiene saldo
   - Guarda via `createPayment()` + actualiza estado enrollment si pagado completo

2. **Pagar Bono** (`openBonoPayModal`):
   - Muestra info del bono (tipo, créditos, pagado/total)
   - Actualiza `bonos.total_paid` en DB
   - Crea registro en `payments`
   - Si paga con saldo, deduce de `profiles.credit_balance`

3. **Usar Saldo** (`openUseCreditModal`):
   - Muestra saldo disponible del cliente
   - Deduce de `profiles.credit_balance`
   - Crea registro en `payments`
   - Actualiza estado enrollment

## Migración SQL Necesaria

Para que el método de pago `saldo` funcione, ejecutar en Supabase:
```sql
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('efectivo', 'tarjeta', 'transferencia', 'voucher', 'saldo', 'online'));
```

## CSS

- Prefijos: `rv-` para reservation detail, `bk-` para booking panel overlay
- Panel fullscreen: `.bk-panel-fullscreen` + `.bk-overlay-fullscreen`
- Header con gradiente del color de la actividad
- Sidebar izquierda con nav tipo pill (amarillo activo)
- Sidebar derecha con acciones
- Cards con radio 14px, sombras sutiles, hover con translateY(-1px)
- Colores de estado: verde (#166534) pagado, rojo (#b91c1c) pendiente, azul (#0ea5e9) confirmado
