#!/usr/bin/env node
// SEMILLA DE LUGARES — pobla `lugares` (0063) desde OpenStreetMap vía Overpass.
//
// NO ES UNA MIGRACION a proposito: los datos cambian y una migracion los
// congelaria. Se corre a mano cuando haga falta refrescar.
//
// LICENCIA: los datos son ODbL. Quien los muestre TIENE que atribuir
// "© colaboradores de OpenStreetMap". La pantalla del tablero ya lo hace.
//
// LO QUE NO GUARDAMOS: el telefono. Medido el 3-ago-2026 sobre la RM, solo el
// 8% de las veterinarias lo tiene publicado en OSM. Guardar una columna que
// esta vacia en 9 de cada 10 filas invita a que la pantalla prometa "llamá a
// estas 12" y despues no haya a quien llamar.
//
// Uso:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/semilla-lugares.js CL-RM

const CATEGORIAS = { veterinary: 'veterinaria', animal_shelter: 'refugio' };

function normalizarElemento(el) {
  if (!el) return null;                           // tolerar un nulo de la API
  const tags = el.tags || {};
  const nombre = (tags.name || '').trim();
  if (!nombre) return null;                       // sin nombre no sirve de nada
  const categoria = CATEGORIAS[tags.amenity];
  if (!categoria) return null;

  const lat = el.lat != null ? el.lat : el.center && el.center.lat;
  const lng = el.lon != null ? el.lon : el.center && el.center.lon;
  if (lat == null || lng == null) return null;

  const calle = (tags['addr:street'] || '').trim();
  const numero = (tags['addr:housenumber'] || '').trim();
  const direccion = calle ? (numero ? `${calle} ${numero}` : calle) : null;

  return {
    osm_tipo: el.type,
    osm_id: el.id,
    nombre,
    categoria,
    lat,
    lng,
    direccion,
    comuna: (tags['addr:city'] || tags['addr:suburb'] || '').trim() || null,
  };
}

function aFilas(elementos) {
  return elementos.map(normalizarElemento).filter(Boolean);
}

async function main() {
  const region = process.argv[2] || 'CL-RM';
  const query = `[out:json][timeout:180];area["ISO3166-2"="${region}"]->.a;` +
    `(node["amenity"~"veterinary|animal_shelter"](area.a);` +
    `way["amenity"~"veterinary|animal_shelter"](area.a););out tags center;`;

  // EL `User-Agent` NO ES OPCIONAL. Medido el 5-ago-2026 al correr la semilla
  // por primera vez de verdad: sin este header Overpass responde 406 (Not
  // Acceptable) y el script muere antes de traer una sola fila. Su politica de
  // uso aceptable pide identificar la aplicacion, y rechaza el User-Agent que
  // manda el fetch de Node (undici) por defecto. Con curl "sin User-Agent"
  // devuelve 200, asi que el 406 no es "falta el header" sino "ese header no
  // me gusta" — por eso hay que mandar uno propio, no borrarlo.
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
    headers: { 'User-Agent': 'encuentra-mascota/1.0 (semilla de lugares para reportes de mascotas perdidas)' },
  });
  if (!res.ok) throw new Error(`Overpass respondió ${res.status}`);
  const filas = aFilas((await res.json()).elements || []);
  console.log(`${region}: ${filas.length} lugares con nombre y categoría útil`);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');

  // `resolution=merge-duplicates` + el unique (osm_tipo, osm_id) hacen que
  // re-correr la semilla ACTUALICE en vez de duplicar.
  const up = await fetch(`${url}/rest/v1/lugares?on_conflict=osm_tipo,osm_id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(filas.map((f) => ({ ...f, actualizado_en: new Date().toISOString() }))),
  });
  if (!up.ok) throw new Error(`Supabase respondió ${up.status}: ${await up.text()}`);
  console.log('Semilla aplicada.');
}

module.exports = { normalizarElemento, aFilas };

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
