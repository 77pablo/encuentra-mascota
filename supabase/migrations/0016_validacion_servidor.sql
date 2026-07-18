-- VALIDACIÓN EN EL SERVIDOR
--
-- Hasta acá los límites de longitud los ponía SOLO el cliente (zod en el
-- formulario). Eso no es una defensa: la API de Supabase es pública y cualquiera
-- con la anon key puede saltarse la app y escribir directo con `curl`. Sin estas
-- restricciones se podía guardar una descripción de 5 MB, un nombre de mascota
-- de 100.000 caracteres o una latitud de 9.999.
--
-- La regla que seguimos: la base repite los mismos límites que ya valida el
-- formulario, para que un usuario normal NUNCA los vea, y solo los toque quien
-- esté intentando escribir por fuera de la app.
--
-- Nota sobre inyección SQL: no aplica en esta arquitectura. La app no arma SQL
-- por concatenación; PostgREST parametriza todo. Estas restricciones son contra
-- datos abusivos o corruptos, que es el riesgo que sí existe.

-- ---------------------------------------------------------------------------
-- REPORTES
-- ---------------------------------------------------------------------------
alter table public.pets
  -- Los mismos números que src/schemas/pet.ts
  add constraint pets_descripcion_largo
    check (length(btrim(descripcion)) between 1 and 1000),
  add constraint pets_nombre_largo
    check (nombre is null or length(nombre) <= 60),
  add constraint pets_raza_largo
    check (raza is null or length(raza) <= 60),
  add constraint pets_recompensa_largo
    check (recompensa is null or length(recompensa) <= 100),
  -- Coordenadas dentro del planeta. Sin esto, un valor fuera de rango rompe el
  -- cálculo geográfico de la búsqueda (migración 0014).
  add constraint pets_lat_rango check (lat between -90 and 90),
  add constraint pets_lng_rango check (lng between -180 and 180),
  -- Máximo 4 fotos, igual que el formulario, y un tope al peso total de las
  -- URLs para que nadie use el arreglo como bolsa de texto.
  add constraint pets_fotos_cantidad
    check (fotos is null or coalesce(array_length(fotos, 1), 0) <= 4),
  add constraint pets_fotos_largo
    check (fotos is null or length(array_to_string(fotos, ',')) <= 2000);

-- ---------------------------------------------------------------------------
-- PISTAS DEL BARRIO  (el límite del cliente es TIP_MAX = 500)
-- ---------------------------------------------------------------------------
alter table public.pet_tips
  add constraint pet_tips_texto_largo
    check (length(btrim(texto)) between 1 and 500);

-- ---------------------------------------------------------------------------
-- NOVEDADES DEL DUEÑO
-- ---------------------------------------------------------------------------
alter table public.pet_updates
  add constraint pet_updates_texto_largo
    check (length(btrim(texto)) between 1 and 1000);

-- ---------------------------------------------------------------------------
-- AVISTAMIENTOS
-- ---------------------------------------------------------------------------
alter table public.sightings
  add constraint sightings_nota_largo
    check (nota is null or length(nota) <= 500),
  add constraint sightings_foto_largo
    check (foto is null or length(foto) <= 500),
  add constraint sightings_lat_rango check (lat between -90 and 90),
  add constraint sightings_lng_rango check (lng between -180 and 180);

-- ---------------------------------------------------------------------------
-- MENSAJES DEL CHAT
-- ---------------------------------------------------------------------------
alter table public.messages
  add constraint messages_texto_largo
    check (length(btrim(texto)) between 1 and 2000);

-- ---------------------------------------------------------------------------
-- PERFILES
-- ---------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_nombre_largo
    check (length(btrim(nombre)) between 1 and 60),
  add constraint profiles_telefono_largo
    check (telefono is null or length(telefono) <= 30),
  add constraint profiles_red_social_largo
    check (red_social is null or length(red_social) <= 120),
  add constraint profiles_foto_largo
    check (foto_perfil is null or length(foto_perfil) <= 500);

-- ---------------------------------------------------------------------------
-- ZONA DE ALERTA
-- ---------------------------------------------------------------------------
alter table public.alert_zones
  -- La app ofrece 2, 5 y 10 km; dejamos margen pero con techo, para que nadie
  -- se suscriba a "todo el planeta" y se lleve un aviso por cada reporte.
  add constraint alert_zones_radio_rango check (radio_km between 1 and 100),
  add constraint alert_zones_lat_rango
    check (lat is null or lat between -90 and 90),
  add constraint alert_zones_lng_rango
    check (lng is null or lng between -180 and 180);

-- ---------------------------------------------------------------------------
-- FINAL FELIZ  (nota y foto del reencuentro)
-- ---------------------------------------------------------------------------
alter table public.pets
  add constraint pets_final_feliz_largo
    check (final_feliz is null or length(final_feliz) <= 500),
  add constraint pets_final_foto_largo
    check (final_foto is null or length(final_foto) <= 500);
