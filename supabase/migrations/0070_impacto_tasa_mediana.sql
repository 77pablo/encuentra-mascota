-- 0070_impacto_tasa_mediana.sql — Tanda 21
--
-- Dos cosas:
--  1) `impacto_comunidad()` suma `perdidas_historicas` (denominador de la
--     tasa) y `mediana_dias` (mediana de reunida_en − creado_en). Cambiar el
--     `returns table` EXIGE drop + create: van en el MISMO archivo y la API
--     de administración lo corre en una transacción, así que no hay ventana.
--     Las columnas nuevas van AL FINAL: la app vieja ignora campos extra.
--  2) `impacto_por_comuna()` para la página pública /impacto: desglose por
--     comuna, SOLO comunas con al menos un dato (nada de filas en cero).
--
-- ⚠️ ANTES DE APLICAR: traer el cuerpo vivo con
--   select pg_get_functiondef('public.impacto_comunidad()'::regprocedure);
-- y comparar contra la 0044. Los criterios de `reencuentros` y `buscando`
-- están VERBATIM (hay guard de test): si el vivo difiere, PARAR y mirar.
--
-- `mediana_dias` es null con < 3 reencuentros: "0 días" con un caso miente.
-- El guard `reunida_en >= creado_en` descarta relojes torcidos (una resta
-- negativa arruinaría la mediana en silencio).

drop function public.impacto_comunidad();
create function public.impacto_comunidad()
returns table (reencuentros bigint, buscando bigint, adopciones bigint, aportes bigint, perdidas_historicas bigint, mediana_dias numeric)
language sql security definer set search_path = public, pg_temp stable
as $$
  select
    (select count(*) from public.pets where reunida_en is not null and oculto = false),
    (select count(*) from public.pets where activo = true and oculto = false and estado = 'perdida'),
    (select count(*) from public.adoptions where adoptada_en is not null),
    (select (select count(*) from public.sightings) + (select count(*) from public.pet_tips)),
    (select count(*) from public.pets where estado = 'perdida' and oculto = false),
    (select case when count(*) >= 3
       then round((percentile_cont(0.5) within group (
              order by extract(epoch from (reunida_en - creado_en)) / 86400.0))::numeric, 1)
     end
     from public.pets
     where reunida_en is not null and oculto = false and reunida_en >= creado_en)
$$;
revoke all on function public.impacto_comunidad() from public;
grant execute on function public.impacto_comunidad() to anon, authenticated;

create function public.impacto_por_comuna()
returns table (comuna text, reencuentros bigint, buscando bigint)
language sql security definer set search_path = public, pg_temp stable
as $$
  select
    comuna,
    count(*) filter (where reunida_en is not null),
    count(*) filter (where activo = true and estado = 'perdida')
  from public.pets
  where comuna is not null and oculto = false
  group by comuna
  having count(*) filter (where reunida_en is not null) > 0
      or count(*) filter (where activo = true and estado = 'perdida') > 0
  order by 2 desc, 1
  limit 50
$$;
revoke all on function public.impacto_por_comuna() from public;
grant execute on function public.impacto_por_comuna() to anon, authenticated;
