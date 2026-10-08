# Lessons Learned

## Floating Point Precision
- **Pattern**: Bono pending showed "Pagar 0.00€" when fully paid due to floating point comparison
- **Fix**: Always use `Math.round(x * 100) / 100` for money calculations, and `pending <= 0` instead of `paid >= expected`
- **Rule**: Never compare money with `>=` directly. Round first, then check.

## Scope Issues in Large Files
- **Pattern**: `openReservationDetail` was nested inside `openBookingPanel` (4-space indent), inaccessible from calendar click handler (2-space indent)
- **Fix**: Moved function to `renderCalendario` scope
- **Rule**: Before writing a function, verify its scope is accessible from all call sites.

## DB Schema vs Code Mismatch
- **Pattern**: Sent `credit_used` column to `payments` table — doesn't exist. Sent `saldo` as payment_method — not in CHECK constraint.
- **Fix**: Read migration SQL to verify column names and constraints before writing insert code.
- **Rule**: Always verify DB schema (columns, constraints) before writing queries that insert/update.

## Data Format Mismatch (DB vs Local)
- **Pattern**: DB returns `payment_method` and `payment_date`, but code expected `method` and `date`
- **Fix**: Use `p.method || p.payment_method` pattern to handle both
- **Rule**: When code handles both DB records and locally-created objects, normalize field access.

## Cache Structure Assumptions
- **Pattern**: `enrollmentsCache` is an object keyed by classId, not an array. Code used `.find()` on it.
- **Fix**: Access as `enrollmentsCache[classId]` first, then `.find()` on the array
- **Rule**: Read how a cache is populated before assuming its structure.

## Enrollment-Bono Relationship
- **Pattern**: `class_enrollments` has `bono_id` linking to the bono that covers it. When linked, the session cost = 0 (covered by bono).
- **Rule**: Always check `enrollment.bono_id` — if present, pending = bono's pending, not session price.

## Don't Duplicate Panels
- **Pattern**: Two separate detail panels (`openEnrollmentDetail` and `openReservationDetail`) caused inconsistency
- **Fix**: Delete the duplicate, use only one
- **Rule**: Before creating a new UI component, check if one already exists that can be reused.

## Rewrites de Vercel con cleanUrls
- **Pattern**: el rewrite `/surf-camp-:slug+` → `/camp-template/index.html` daba 502 `ROUTER_CANNOT_MATCH` (el cliente lo reportó como "error 505") en cuanto un camp no tenía carpeta propia. Con `cleanUrls: true` la ruta `.html` no existe.
- **Fix**: destino `/camp-template/` (PR #56).
- **Rule**: nunca `.html` en el destino de un rewrite con cleanUrls. Si el usuario da un código de error raro, comprobar la respuesta real (`curl -sI`, cabecera `x-vercel-error`) antes de buscar en el código.

## Contenido nuevo desde el panel que no llega a la web
- **Pattern**: las tarjetas de camps eran HTML fijo; `camp-overview.js` solo actualizaba las existentes, así que un camp creado desde el panel no salía en ningún listado.
- **Rule**: al auditar "crear X desde el panel", seguir el registro hasta la web pública (página propia + listados), no quedarse en que el INSERT funciona.

## vercel --yes
- **Pattern**: `vercel curl --yes` en un repo sin `.vercel` creó y conectó al repo un proyecto nuevo `entreolasur` que desplegaba en cada push.
- **Rule**: nunca `--yes` del CLI de Vercel aquí. Preview protegido → que Felipe lo abra logueado o verificar en prod.
