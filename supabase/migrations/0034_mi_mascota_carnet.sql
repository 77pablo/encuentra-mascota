-- 0034 · Carnet de "Mi mascota": edad + próximas dosis (aviso solo in-app).
--
-- Decisión de Pablo: vacuna + antiparasitarios (interno/externo), con aviso
-- SOLO in-app (banner en Mis mascotas e Inicio) — sin push ni correo: el push
-- nativo todavía no está en producción y Resend sigue en modo prueba. La base
-- solo guarda las fechas; el cálculo de edad y el estado de cada dosis
-- (al_dia/vence_pronto/vencida) vive en el cliente (src/lib/edadDesde.ts,
-- src/lib/recordatorios.ts), igual que el ciclo de vida de un reporte
-- (migración 0028). RLS: `my_pets` ya es solo-dueño desde la 0027 y cubre
-- estas columnas nuevas sin cambios.
alter table public.my_pets
  add column if not exists fecha_nacimiento date,
  add column if not exists vacuna_proxima date,
  add column if not exists antiparasitario_interno_proximo date,
  add column if not exists antiparasitario_externo_proximo date;

-- Rango sano (la API es pública, patrón 0016). Fechas fijas y no current_date:
-- un CHECK con current_date se comporta distinto en restore y confunde.
alter table public.my_pets
  add constraint my_pets_nacimiento_rango check (fecha_nacimiento is null or
    fecha_nacimiento between date '1985-01-01' and date '2100-12-31'),
  add constraint my_pets_vacuna_rango check (vacuna_proxima is null or
    vacuna_proxima between date '2020-01-01' and date '2100-12-31'),
  add constraint my_pets_antiint_rango check (antiparasitario_interno_proximo is null or
    antiparasitario_interno_proximo between date '2020-01-01' and date '2100-12-31'),
  add constraint my_pets_antiext_rango check (antiparasitario_externo_proximo is null or
    antiparasitario_externo_proximo between date '2020-01-01' and date '2100-12-31');
