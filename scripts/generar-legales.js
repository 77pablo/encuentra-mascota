#!/usr/bin/env node
// Genera las páginas legales públicas desde docs/legal/*.md.
//
// Por qué existe este script en vez de dos .html escritos a mano: Google Play
// exige una URL pública de política de privacidad, y esos documentos los va a
// revisar un abogado. Si el HTML fuera una copia del markdown, la primera
// corrección del abogado dejaría las dos versiones distintas y la publicada
// sería la vieja. Acá docs/legal/*.md es la ÚNICA fuente de verdad y el HTML
// es un artefacto: se regenera y se commitea.
//
//   node scripts/generar-legales.js           → borrador (noindex + franja)
//   node scripts/generar-legales.js --final   → publicable; FALLA si queda algo sin resolver
//
// Correr antes de `npx expo export --platform web`; los archivos salen a
// public/, que expo copia a dist/ tal cual.
//
// CommonJS a propósito (no .mjs): el repo no declara "type": "module", así que
// un .js lo ejecuta node directo Y jest lo importa sin tocar jest.config.js.
// Con .mjs los tests fallaban con "Cannot use import statement outside a module".

const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');

const RAIZ = join(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. Los datos que faltan
// ---------------------------------------------------------------------------
// Todo lo que los documentos dejaron pendiente y que es una SUSTITUCIÓN simple
// (un dato que Pablo sabe o va a decidir) se pone acá, en un solo lugar.
// `null` = todavía no se sabe → sale como marcador visible en la página y
// --final se niega a generar.
//
// Lo que NO está acá son las preguntas abiertas para el abogado (bajo qué
// mecanismo se amparan las transferencias internacionales, cuánto se retienen
// los logs, etc.): esas no son un dato que rellenar, son decisiones. Salen
// resaltadas en la página para que se vean y no se publiquen por descuido.

const CONFIG = {
  // El nombre sigue sin decidirse (Cerquita / Volvió / Volví / Pichicho eran
  // los candidatos con .cl libre). Hasta que se elija, la app se llama por su
  // nombre de trabajo en el título de la página, pero el dato queda marcado.
  NOMBRE_APP: null,
  DOMINIO: null,
  CORREO_CONTACTO: null,
  FECHA_PUBLICACION: null,
  RUT_RAZON_SOCIAL: null,
  DOMICILIO: null,
  // Esta sí se conoce: la página de borrado ya existe y su ruta es estable.
  URL_BORRADO: '/borrar-cuenta',
};

// Cada entrada reconoce un marcador del markdown por su comienzo y lo cambia
// por el valor de CONFIG. El orden importa: se prueba de arriba a abajo.
const SUSTITUCIONES = [
  { empiezaCon: 'nombre de la app', clave: 'NOMBRE_APP' },
  { empiezaCon: 'fecha de publicación', clave: 'FECHA_PUBLICACION' },
  { empiezaCon: 'correo de contacto', clave: 'CORREO_CONTACTO' },
  { empiezaCon: 'dominio definitivo', clave: 'DOMINIO' },
  { empiezaCon: 'si opera como persona natural', clave: 'RUT_RAZON_SOCIAL' },
  { empiezaCon: 'RUT o razón social', clave: 'RUT_RAZON_SOCIAL' },
  { empiezaCon: 'domicilio', clave: 'DOMICILIO' },
  { empiezaCon: 'URL pública de solicitud de borrado', clave: 'URL_BORRADO' },
];

const ETIQUETA = {
  NOMBRE_APP: 'NOMBRE DE LA APP',
  DOMINIO: 'DOMINIO',
  CORREO_CONTACTO: 'CORREO DE CONTACTO',
  FECHA_PUBLICACION: 'FECHA DE PUBLICACIÓN',
  RUT_RAZON_SOCIAL: 'RUT O RAZÓN SOCIAL',
  DOMICILIO: 'DOMICILIO',
  URL_BORRADO: 'URL DE BORRADO',
};

const DOCS = [
  {
    md: 'docs/legal/politica-privacidad.md',
    salida: 'public/privacidad/index.html',
    ruta: '/privacidad',
    titulo: 'Política de privacidad',
  },
  {
    md: 'docs/legal/terminos-de-uso.md',
    salida: 'public/terminos/index.html',
    ruta: '/terminos',
    titulo: 'Términos de uso',
  },
];

// ---------------------------------------------------------------------------
// 2. Markdown → HTML
// ---------------------------------------------------------------------------
// Renderizador a medida, no una librería: el repo no tiene ninguna instalada,
// no se puede correr `npm install` (el node_modules es compartido con los
// worktrees y ya se rompió una vez así), y estos dos documentos usan un
// subconjunto chico y conocido de markdown. Lo que no está acá abajo, no se
// usa en docs/legal/ — el test de cobertura avisa si alguien agrega algo.

function escaparHtml(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Los marcadores [[PENDIENTE: ...]] se parten en varias líneas del markdown, a
// veces con el `> ` de una cita en el medio. Se juntan en uno solo ANTES de
// partir en bloques, si no el parser ve media frase suelta.
function unirMarcadores(md) {
  return md.replace(/\[\[([\s\S]*?)\]\]/g, function (_, dentro) {
    return '[[' + dentro.replace(/\s*\n\s*>?\s*/g, ' ').trim() + ']]';
  });
}

// Un marcador se convierte en el valor de CONFIG si es una sustitución
// conocida y está resuelto; en un resaltado visible si no.
function resolverMarcador(contenido, config) {
  const cfg = config || CONFIG;
  const cuerpo = contenido.replace(/^PENDIENTE:\s*/, '').trim();

  for (const { empiezaCon, clave } of SUSTITUCIONES) {
    if (cuerpo.toLowerCase().startsWith(empiezaCon.toLowerCase())) {
      const valor = cfg[clave];
      if (valor) return { tipo: 'resuelto', clave, html: escaparHtml(valor) };
      return {
        tipo: 'faltante',
        clave,
        html:
          '<mark class="falta" title="Dato pendiente: completar en CONFIG de scripts/generar-legales.js">' +
          escaparHtml(ETIQUETA[clave] || clave) +
          '</mark>',
      };
    }
  }

  // Pregunta abierta (para el abogado o para una decisión técnica).
  return {
    tipo: 'consulta',
    clave: null,
    html:
      '<mark class="consulta"><span class="consulta-et">Pendiente de revisión</span> ' +
      escaparHtml(cuerpo) +
      '</mark>',
  };
}

// Sentinela para sacar los marcadores del camino mientras se aplican las
// reglas de negrita/cursiva/código. NO usar un número entre espacios: el texto
// legal está lleno de cifras sueltas ("unos 250 metros", "14 años") y el
// reemplazo de vuelta se las comería.
const ABRE = '\u0001';
const CIERRA = '\u0002';

function desescapar(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function inline(texto, estado, config) {
  let s = escaparHtml(texto);

  // Marcadores primero: su HTML ya viene armado y escapado por
  // resolverMarcador, y no debe pasar por el resto de las reglas.
  const trozos = [];
  s = s.replace(/\[\[([\s\S]*?)\]\]/g, function (_, dentro) {
    const r = resolverMarcador(desescapar(dentro), config);
    if (estado) estado.marcadores.push(r);
    trozos.push(r.html);
    return ABRE + (trozos.length - 1) + CIERRA;
  });

  s = s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

  return s.replace(new RegExp(ABRE + '(\\d+)' + CIERRA, 'g'), function (_, i) {
    return trozos[Number(i)];
  });
}

function slug(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const ES_TABLA = (l) => l.startsWith('|');
const ES_CITA = (l) => l.startsWith('>');
const ES_VINETA = (l) => /^[-*]\s/.test(l);
const ES_NUMERO = (l) => /^\d+\.\s/.test(l);
const ES_TITULO = (l) => /^#{1,6}\s/.test(l);
const ES_REGLA = (l) => /^-{3,}$/.test(l);

// Junta las líneas de un ítem de lista: en el markdown fuente los párrafos
// vienen cortados a 95 columnas y la continuación va indentada.
function juntarItems(lineas, esItem) {
  const items = [];
  for (const linea of lineas) {
    if (esItem(linea.trim()) && !/^\s/.test(linea)) {
      items.push(linea.trim().replace(/^([-*]|\d+\.)\s+/, ''));
    } else if (items.length) {
      items[items.length - 1] += ' ' + linea.trim();
    }
  }
  return items;
}

function renderTabla(filas, estado, config) {
  const celdas = (l) =>
    l
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  const separador = filas.findIndex((l) => /^\|[\s:|-]+\|$/.test(l) && l.includes('-'));
  if (separador === -1) return '';

  const encabezado = filas.slice(0, separador).map(celdas);
  const cuerpo = filas.slice(separador + 1).map(celdas);

  // Caso `| | |`: la tabla de "Quién trata tus datos" no tiene encabezado real,
  // es una lista de campo/valor. Sin esto saldría una fila vacía arriba.
  const tieneEncabezado = encabezado.some((f) => f.some((c) => c !== ''));

  const thead = tieneEncabezado
    ? '<thead>' +
      encabezado
        .map((f) => '<tr>' + f.map((c) => '<th>' + inline(c, estado, config) + '</th>').join('') + '</tr>')
        .join('') +
      '</thead>'
    : '';

  const tbody =
    '<tbody>' +
    cuerpo
      .map((f) => '<tr>' + f.map((c) => '<td>' + inline(c, estado, config) + '</td>').join('') + '</tr>')
      .join('') +
    '</tbody>';

  // El wrapper con scroll propio es obligatorio: son tablas de hasta 4 columnas
  // de texto y la página se lee en un teléfono. Sin esto el body scrollea en
  // horizontal y se rompe la lectura entera.
  return '<div class="tabla-scroll"><table>' + thead + tbody + '</table></div>';
}

function renderizar(md, estado, config) {
  const st = estado || { marcadores: [], secciones: [] };
  const lineas = unirMarcadores(md).split(/\r?\n/);
  const salida = [];
  let i = 0;

  while (i < lineas.length) {
    const t = lineas[i].trim();

    if (t === '') {
      i++;
      continue;
    }

    if (ES_REGLA(t)) {
      salida.push('<hr />');
      i++;
      continue;
    }

    if (ES_TITULO(t)) {
      const m = t.match(/^(#{1,6})\s+(.*)$/);
      const nivel = m[1].length;
      const texto = m[2];
      // El h1 lo pone la plantilla (con la marca arriba); el del markdown se
      // descarta para no repetirlo.
      if (nivel === 1) {
        i++;
        continue;
      }
      const id = slug(texto);
      if (nivel === 2) st.secciones.push({ id, texto });
      salida.push('<h' + nivel + ' id="' + id + '">' + inline(texto, st, config) + '</h' + nivel + '>');
      i++;
      continue;
    }

    if (ES_TABLA(t)) {
      const filas = [];
      while (i < lineas.length && ES_TABLA(lineas[i].trim())) {
        filas.push(lineas[i].trim());
        i++;
      }
      salida.push(renderTabla(filas, st, config));
      continue;
    }

    if (ES_CITA(t)) {
      const dentro = [];
      while (i < lineas.length && ES_CITA(lineas[i].trim())) {
        dentro.push(lineas[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      salida.push('<blockquote>' + renderizar(dentro.join('\n'), st, config) + '</blockquote>');
      continue;
    }

    if (ES_VINETA(t) || ES_NUMERO(t)) {
      const ordenada = ES_NUMERO(t);
      const esItem = ordenada ? ES_NUMERO : ES_VINETA;
      const bloque = [];
      while (i < lineas.length) {
        const l = lineas[i];
        if (l.trim() === '') break;
        if (!esItem(l.trim()) && !/^\s/.test(l)) break;
        bloque.push(l);
        i++;
      }
      const items = juntarItems(bloque, esItem);
      const tag = ordenada ? 'ol' : 'ul';
      // start= preserva la numeración: la lista de conductas prohibidas de los
      // términos corre del 1 al 25 partida en cuatro subsecciones, y sin esto
      // cada subsección volvería a empezar en 1.
      const inicio = ordenada ? ' start="' + parseInt(bloque[0].trim(), 10) + '"' : '';
      salida.push(
        '<' + tag + inicio + '>' +
          items.map((it) => '<li>' + inline(it, st, config) + '</li>').join('') +
          '</' + tag + '>',
      );
      continue;
    }

    // Párrafo: líneas seguidas hasta un blanco o el comienzo de otro bloque.
    const parrafo = [];
    while (i < lineas.length) {
      const l = lineas[i].trim();
      if (l === '' || ES_REGLA(l) || ES_TITULO(l) || ES_TABLA(l) || ES_CITA(l) || ES_VINETA(l) || ES_NUMERO(l)) {
        break;
      }
      parrafo.push(l);
      i++;
    }
    salida.push('<p>' + inline(parrafo.join(' '), st, config) + '</p>');
  }

  return salida.join('\n');
}

// ---------------------------------------------------------------------------
// 3. La plantilla
// ---------------------------------------------------------------------------
// Misma paleta y tipografía que public/borrar-cuenta/index.html, para que las
// tres páginas públicas se vean como el mismo sitio.

const ESTILOS = [
  ":root{--pino:#0f4e39;--pino-claro:#1c6b4f;--arena:#fbf7ef;--tinta:#21302b;--linea:#e6ddcd;--coral:#e2604a;--suave:#4a5a52}",
  '*{box-sizing:border-box}',
  "body{margin:0;background:var(--arena);color:var(--tinta);line-height:1.65;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}",
  '.wrap{max-width:760px;margin:0 auto;padding:24px 20px 72px}',
  'header{padding:8px 0 4px}',
  '.marca{color:var(--pino);font-weight:700;font-size:15px;letter-spacing:.2px;text-decoration:none;display:inline-block}',
  'h1{font-size:30px;line-height:1.2;margin:20px 0 4px;color:var(--pino)}',
  'h2{font-size:21px;line-height:1.3;margin:40px 0 10px;color:var(--pino);scroll-margin-top:16px}',
  'h3{font-size:17px;margin:26px 0 8px;color:var(--pino-claro);scroll-margin-top:16px}',
  'p{margin:0 0 14px}',
  'a{color:var(--pino-claro);font-weight:600}',
  'ul,ol{margin:0 0 16px;padding-left:22px}',
  'li{margin-bottom:8px}',
  'code{background:#eef1ee;border-radius:5px;padding:1px 5px;font-size:.9em;word-break:break-all}',
  'hr{border:0;border-top:1px solid var(--linea);margin:34px 0}',
  'blockquote{margin:18px 0;padding:14px 18px;background:#fff;border:1px solid var(--linea);border-left:4px solid var(--pino-claro);border-radius:0 12px 12px 0}',
  'blockquote p:last-child{margin-bottom:0}',
  '.tabla-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 0 18px;border:1px solid var(--linea);border-radius:12px;background:#fff}',
  'table{border-collapse:collapse;width:100%;min-width:520px;font-size:15px}',
  'th,td{text-align:left;vertical-align:top;padding:10px 14px;border-bottom:1px solid var(--linea)}',
  'th{background:#f3efe5;color:var(--pino);font-weight:700}',
  'tr:last-child td{border-bottom:0}',
  '.indice{background:#fff;border:1px solid var(--linea);border-radius:14px;padding:16px 20px;margin:24px 0 8px}',
  '.indice h2{font-size:14px;text-transform:uppercase;letter-spacing:.6px;margin:0 0 10px;color:var(--suave)}',
  '.indice ol{margin:0;padding-left:20px;font-size:15px}',
  '.indice li{margin-bottom:5px}',
  'footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--linea);color:#8a978f;font-size:13px}',
  'footer a{margin-right:14px}',
  'mark.falta{background:#ffe9a8;color:#6b4c00;border:1px dashed #c99a00;border-radius:6px;padding:1px 7px;font-weight:700;font-size:.92em;white-space:nowrap}',
  'mark.consulta{display:block;background:#fff6f4;color:#7a3327;border:1px dashed #e2a293;border-radius:10px;padding:10px 13px;margin:10px 0;font-size:14px;line-height:1.5}',
  '.consulta-et{display:inline-block;background:#e2604a;color:#fff;border-radius:999px;padding:1px 9px;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;margin-right:6px}',
  '.franja{background:#7a3327;color:#fff;padding:14px 18px;border-radius:12px;margin:16px 0 8px;font-size:14.5px}',
  '.franja strong{color:#ffd9d0}',
  '@media (max-width:520px){h1{font-size:25px}h2{font-size:19px}.wrap{padding:20px 16px 56px}}',
].join('\n');

const FRANJA_BORRADOR =
  '<div class="franja"><strong>⚠️ Borrador — todavía no publicado.</strong> Esta página se generó ' +
  'con datos pendientes: lo resaltado en amarillo son datos que faltan y lo resaltado en rojo son ' +
  'puntos que tiene que revisar un abogado. No es la versión definitiva y no debe enlazarse desde ' +
  'las tiendas de aplicaciones.</div>';

function plantilla(o) {
  const indice = o.secciones.length
    ? '<nav class="indice" aria-label="Contenidos"><h2>Contenidos</h2><ol>' +
      o.secciones
        .map((s) => '<li><a href="#' + s.id + '">' + escaparHtml(s.texto.replace(/^\d+\.\s*/, '')) + '</a></li>')
        .join('') +
      '</ol></nav>'
    : '';

  return (
    '<!doctype html>\n<html lang="es">\n  <head>\n' +
    '    <meta charset="utf-8" />\n' +
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    '    <meta name="robots" content="' + (o.esBorrador ? 'noindex' : 'index, follow') + '" />\n' +
    '    <title>' + escaparHtml(o.titulo) + ' — ' + escaparHtml(o.nombreApp) + '</title>\n' +
    '    <meta name="description" content="' + escaparHtml(o.titulo) + ' de ' + escaparHtml(o.nombreApp) + '." />\n' +
    '    <!--\n' +
    '      GENERADO — no editar a mano.\n' +
    '      Fuente: docs/legal/*.md · Generador: scripts/generar-legales.js\n' +
    '      Regenerar: node scripts/generar-legales.js\n' +
    '      Cualquier cambio hecho acá se pierde en la próxima corrida.\n' +
    '    -->\n' +
    '    <style>\n' + ESTILOS + '\n    </style>\n' +
    '  </head>\n  <body>\n    <div class="wrap">\n' +
    '      <header><a class="marca" href="/">🐾 ' + escaparHtml(o.nombreApp) + '</a></header>\n' +
    '      <h1>' + escaparHtml(o.titulo) + '</h1>\n' +
    (o.esBorrador ? '      ' + FRANJA_BORRADOR + '\n' : '') +
    '      ' + indice + '\n' +
    o.contenido + '\n' +
    '      <footer>\n' +
    '        <a href="/">Volver a la app</a>\n' +
    '        <a href="' + o.otra.ruta + '">' + escaparHtml(o.otra.titulo) + '</a>\n' +
    '        <a href="/borrar-cuenta">Borrar tu cuenta</a>\n' +
    '      </footer>\n' +
    '    </div>\n  </body>\n</html>\n'
  );
}

// ---------------------------------------------------------------------------
// 4. Main
// ---------------------------------------------------------------------------

// Devuelve el HTML de cada documento sin escribir nada. Separado de generar()
// para que los tests puedan comparar lo generado con lo que hay en disco sin
// pisar los archivos del repo.
function construir(config) {
  const cfg = config || CONFIG;
  const nombreApp = cfg.NOMBRE_APP || 'Encuentra tu Mascota';

  return DOCS.map((doc) => {
    const md = readFileSync(join(RAIZ, doc.md), 'utf8');
    const estado = { marcadores: [], secciones: [] };
    const contenido = renderizar(md, estado, cfg);

    const faltantes = estado.marcadores.filter((m) => m.tipo === 'faltante');
    const consultas = estado.marcadores.filter((m) => m.tipo === 'consulta');
    const esBorrador = faltantes.length > 0 || consultas.length > 0;

    const html = plantilla({
      titulo: doc.titulo,
      contenido,
      secciones: estado.secciones,
      esBorrador,
      otra: DOCS.find((d) => d !== doc),
      nombreApp,
    });

    return {
      doc,
      html,
      esBorrador,
      secciones: estado.secciones.length,
      consultas: consultas.length,
      faltantes: [...new Set(faltantes.map((f) => ETIQUETA[f.clave] || f.clave))],
    };
  });
}

function generar(opciones) {
  const final = !!(opciones && opciones.final);
  const resultados = construir(opciones && opciones.config);

  for (const r of resultados) {
    if (final && r.esBorrador) {
      throw new Error(
        'No se puede generar la version final de ' + r.doc.salida + ': quedan ' +
          r.faltantes.length + ' dato(s) sin completar y ' + r.consultas +
          ' punto(s) sin revisar. Completa CONFIG en scripts/generar-legales.js y ' +
          'resolve los [[PENDIENTE]] de ' + r.doc.md + '.',
      );
    }
  }

  // Se escribe solo si TODOS pasaron el chequeo: mejor no dejar una página
  // final y la otra en borrador.
  for (const r of resultados) {
    const destino = join(RAIZ, r.doc.salida);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, r.html, 'utf8');
  }

  return resultados.map((r) => ({
    salida: r.doc.salida,
    ruta: r.doc.ruta,
    secciones: r.secciones,
    faltantes: r.faltantes,
    consultas: r.consultas,
    esBorrador: r.esBorrador,
  }));
}

module.exports = {
  CONFIG,
  SUSTITUCIONES,
  ETIQUETA,
  DOCS,
  escaparHtml,
  unirMarcadores,
  resolverMarcador,
  renderizar,
  slug,
  construir,
  generar,
};

if (require.main === module) {
  const final = process.argv.includes('--final');
  try {
    for (const r of generar({ final })) {
      console.log('OK  ' + r.salida + '  (' + r.ruta + ')  ' + r.secciones + ' secciones');
      if (r.esBorrador) {
        console.log('    BORRADOR - noindex');
        if (r.faltantes.length) console.log('    datos que faltan: ' + r.faltantes.join(', '));
        if (r.consultas) console.log('    puntos para el abogado: ' + r.consultas);
      }
    }
    if (!final) {
      console.log('\nCuando este todo resuelto: node scripts/generar-legales.js --final');
    }
  } catch (e) {
    console.error('ERROR ' + e.message);
    process.exit(1);
  }
}
