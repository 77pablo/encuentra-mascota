-- FINAL FELIZ — verificación de reencuentro
-- Registro celebratorio de cuando una mascota vuelve con su familia.
--
-- Mantenemos `activo=false` como señal de "reporte cerrado". El campo
-- `reunida_en not null` es lo que distingue un reencuentro feliz de un
-- cierre común (por ejemplo, dado de baja o resuelto por otra vía).
-- El dueño ya puede hacer UPDATE de su reporte gracias a la política
-- "editar mis reportes" de 0001_init.sql, así que no hace falta RLS nueva.

alter table public.pets add column if not exists reunida_en timestamptz;
alter table public.pets add column if not exists final_feliz text; -- nota feliz opcional
alter table public.pets add column if not exists final_foto text;  -- foto del reencuentro (opcional)

-- Índice para listar los finales felices recientes sin recorrer toda la tabla.
create index if not exists pets_reunida_en_idx on public.pets (reunida_en desc);
