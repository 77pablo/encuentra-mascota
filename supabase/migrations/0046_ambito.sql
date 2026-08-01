-- 0046_ambito.sql
-- EL RADIO DE BÚSQUEDA CALIBRADO POR ESPECIE — la parte de la base.
--
-- Hasta acá la app usaba un radio fijo para todo el mundo. El estudio de la U.
-- de Queensland junto a Missing Animal Response (n=1.232 gatos perdidos) dice
-- que la mediana de la distancia a la que aparece el animal es de 315 m para un
-- gato con acceso al exterior y de 50 m para un gato de interior escapado. Con
-- 5 km de radio, el aviso de un gato de interior se diluye entre cientos de
-- personas que no pueden hacer nada y no le llega con urgencia a los tres
-- vecinos que sí. Para distinguir esos dos casos hace falta UN dato: si el
-- animal salía a la calle o no.
--
-- ---------------------------------------------------------------------------
-- LA APP TIENE QUE FUNCIONAR IGUAL SIN ESTA MIGRACIÓN APLICADA
-- ---------------------------------------------------------------------------
-- Es la regla dura de esta tanda y acá está el detalle de cómo se cumple:
--
--  · ESCRITURA. `createPet` (src/services/pets.ts) manda `ambito` en el mismo
--    insert que el resto del reporte. PostgREST no guarda filas parciales: si
--    no conoce la columna, rebota el insert ENTERO con PGRST204 y la persona no
--    puede publicar su mascota perdida. Por eso `createPet` reintenta SIN el
--    campo cuando el error es "columna faltante" (`esColumnaFaltante`, en
--    src/lib/dbErrors.ts) y solo entonces. Se pierde la calibración fina del
--    radio; no se pierde el reporte. Está cubierto en
--    __tests__/services/petsAmbitoDegrada.test.ts.
--
--  · LECTURA. Ninguna consulta de la app nombra `ambito` en una lista de
--    columnas — la trampa clásica de PostgREST es que pedir una columna nueva
--    junto a las viejas rompe la consulta entera en vez de devolverla sin ese
--    campo. Las pantallas que lo usan leen el reporte con `select('*')`, que
--    simplemente no lo trae si no existe. Hay un test que barre src/ buscando
--    un `.select('… ambito …')` (__tests__/db/migracion0046.test.ts).
--
--  · A PROPÓSITO NO SE TOCA `buscar_reportes`. Sumarle `ambito` al retorno
--    obligaría a `drop function` (un `create or replace` no puede cambiar el
--    `returns table (...)`; ya nos mordió antes) y a una ventana en la que la
--    búsqueda no existe para NADIE. El listado no necesita el ámbito: lo usan
--    la ficha del reporte y el formulario de publicación, que van por
--    `select('*')`.
--
-- ---------------------------------------------------------------------------
-- 1. La columna
-- ---------------------------------------------------------------------------
-- NULLABLE y sin default, y no es un descuido: la pregunta es OMITIBLE. Un
-- `not null` obligaría a inventar una respuesta en el peor momento posible, y
-- un `default 'exterior'` haría pasar por dato del dueño algo que nadie
-- contestó. `null` significa "no sabemos", y quien lo lee (src/lib/radioSugerido
-- .ts) trata "no sabemos" con el criterio conservador: el radio ANCHO. Omitir
-- la pregunta nunca puede achicarle la búsqueda a nadie.
--
-- Los reportes anteriores a esta migración quedan en null, que es exactamente
-- lo que corresponde: de ellos tampoco sabemos.
alter table public.pets
  add column if not exists ambito text;

-- ---------------------------------------------------------------------------
-- 2. Valores válidos
-- ---------------------------------------------------------------------------
-- Mismo criterio que el resto de la tabla (ver 0016): la validación de verdad
-- vive en la base, no en el cliente. `text` + check y no un enum de Postgres,
-- para no arrastrar el ALTER TYPE si algún día aparece un tercer ámbito.
--
-- El `drop ... if exists` de arriba deja el archivo re-ejecutable: `add
-- constraint` a secas revienta la segunda corrida.
alter table public.pets
  drop constraint if exists pets_ambito_valido;

alter table public.pets
  add constraint pets_ambito_valido
  check (ambito is null or ambito in ('interior', 'exterior'));

-- ---------------------------------------------------------------------------
-- 3. Permisos: nada que hacer
-- ---------------------------------------------------------------------------
-- `pets` no tiene grants POR COLUMNA (eso es cosa de `profiles`, desde la
-- 0018): los permisos son de tabla y los recorta la RLS, así que la columna
-- nueva hereda lo mismo que las demás. Si alguna vez se le ponen grants por
-- columna a `pets`, este comentario deja de ser cierto y hay que agregarla ahí.
--
-- Y sí, `ambito` es PÚBLICO como el resto del reporte. No dice dónde vive nadie:
-- dice si el animal salía a la calle. La ubicación sigue difuminada en el
-- cliente (src/lib/difuminarUbicacion.ts) igual que siempre.
