#!/usr/bin/env node
// SEMILLA DE REFUGIOS Y CANILES — pobla `lugares` (0063) desde
// data/refugios-curados.json. A diferencia de semilla-lugares.js NO consulta
// Overpass: OSM no mapea animal_shelter en Chile de forma util (la semilla del
// 5-ago trajo 301 veterinarias y CERO refugios en toda la RM), asi que el dato
// se cura A MANO y cada entrada lleva su fuente verificable en el JSON.
//
// La tabla no tiene columna `fuente` ni `region`: quedan en el repo para
// auditoria y organizacion, y NO viajan a la base (hay un test de igualdad de
// claves que lo vigila). `osm_tipo='curado'` + id entero estable reusan la
// unique (osm_tipo, osm_id): re-correr ACTUALIZA en vez de duplicar. Un id no
// se recicla jamas: si un refugio cierra, su entrada se borra y su numero se
// retira con el.
//
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/semilla-refugios.js

const LAT_CHILE = [-56, -17];
const LNG_CHILE = [-76, -66];

function validarRefugio(r) {
  if (!r) return 'entrada nula';
  if (!Number.isInteger(r.id) || r.id <= 0) return 'id debe ser un entero positivo estable';
  if (!(r.nombre || '').trim()) return 'nombre vacio';
  if (!(r.comuna || '').trim()) return 'comuna vacia';
  if (!(r.region || '').trim()) return 'region vacia';
  if (typeof r.lat !== 'number' || r.lat < LAT_CHILE[0] || r.lat > LAT_CHILE[1]) return 'lat fuera de Chile';
  if (typeof r.lng !== 'number' || r.lng < LNG_CHILE[0] || r.lng > LNG_CHILE[1]) return 'lng fuera de Chile';
  if (!/^https:\/\/.+/.test(r.fuente || '')) return 'fuente debe ser una URL https verificable';
  return null;
}

function aFilas(refugios) {
  const errores = [];
  const ids = new Set();
  refugios.forEach((r, i) => {
    const motivo = validarRefugio(r);
    if (motivo) errores.push(`entrada ${i}: ${motivo}`);
    else if (ids.has(r.id)) errores.push(`entrada ${i}: id ${r.id} repetido`);
    else ids.add(r.id);
  });
  if (errores.length) throw new Error('Dataset invalido:\n' + errores.join('\n'));
  return refugios.map((r) => ({
    osm_tipo: 'curado',
    osm_id: r.id,
    nombre: r.nombre.trim(),
    categoria: 'refugio',
    lat: r.lat,
    lng: r.lng,
    direccion: (r.direccion || '').trim() || null,
    comuna: r.comuna.trim(),
  }));
}

async function main() {
  const { refugios } = require('../data/refugios-curados.json');
  const filas = aFilas(refugios);
  console.log(`${filas.length} refugios/caniles curados con fuente`);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');

  // Mismo canal que semilla-lugares.js: merge-duplicates + la unique
  // (osm_tipo, osm_id) hacen que re-correr ACTUALICE en vez de duplicar.
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

module.exports = { validarRefugio, aFilas };

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
