# Tasks

## Completed
- [x] Unify reservation detail panel (delete openEnrollmentDetail, use openReservationDetail everywhere)
- [x] Move openReservationDetail to renderCalendario scope
- [x] CSS modernization of reservation detail panel
- [x] Remove Agencia tab, Mensajes tab, Compartir/Descargar buttons
- [x] Fix bono selection (stays selected, green when paid, no "Pagar 0€")
- [x] Persist payments to DB via createPayment
- [x] Cancel button actually deletes enrollment from DB
- [x] Datos del comprador shows real profile + family member data
- [x] Histórico loads real enrollment history from DB
- [x] Fix floating point precision in bono pending calculations
- [x] Pre-select linked bono when enrollment has bono_id
- [x] Update payment method constraint to support 'saldo' and 'online'
- [x] Push to GitHub + documentation + memory

## Pending
- [ ] Run SQL migration `supabase/migration-payments.sql` (payment_method constraint update)
- [ ] Run SQL migration `supabase/migration-audit-fixes.sql`
- [ ] Implement "pay with saldo" option in booking panel paso 2
