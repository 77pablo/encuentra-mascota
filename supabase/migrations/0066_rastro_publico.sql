-- 0066: el rastro de avistamientos para quien llega por el QR (tanda 14, area C).
--
-- POR QUE: la RLS de `sightings` (0007) es `to authenticated`, asi que quien
-- escanea el afiche —EL CASO DE USO CENTRAL DE TODA LA APP— ve el pin del
-- reporte y ninguna pista. Los datos estan guardados y no se muestran.
--
-- POR QUE ES DEFENDIBLE: las ubicaciones ya salen DIFUMINADAS ~250 m al
-- escribirse (difuminarUbicacion.ts, desplazamiento aleatorio y NO redondeo,
-- justamente porque el redondeo es reversible cruzando reportes). Abrir la
-- lectura no revela una direccion.
--
-- LOS FILTROS SE REPITEN A MANO. Una policy nueva no hereda los de la ficha:
-- sin `activo` y `oculto`, un reporte retirado por moderacion seguiria
-- mostrando su rastro a cualquiera con el link.

create policy "el rastro de un reporte vigente es publico"
  on public.sightings for select to anon
  using (
    exists (
      select 1 from public.pets p
       where p.id = sightings.pet_id
         and p.activo
         and p.oculto = false
    )
  );
