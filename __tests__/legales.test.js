// Tests del generador de páginas legales (scripts/generar-legales.js).
//
// En JS y no en TS a propósito: el generador es CommonJS (lo corre node como
// script y jest como módulo), y un test .ts que lo importe obligaría a activar
// allowJs en tsconfig solo por esto.
//
// El test que más vale de este archivo es "el HTML del repo está al día":
// docs/legal/*.md los va a editar un abogado, y sin ese test la corrección
// quedaría en el markdown mientras la web sigue sirviendo la versión vieja.

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const {
  escaparHtml,
  unirMarcadores,
  resolverMarcador,
  textoCanal,
  analizar,
  aBloquesApp,
  renderizar,
  construir,
  construirApp,
  generar,
  CONFIG,
  DOCS,
  SALIDA_APP,
} = require('../scripts/generar-legales.js');

const RAIZ = join(__dirname, '..');

// Los dos tests de "está al día" comparan un archivo del disco contra lo que
// produce el generador, y el generador siempre emite LF. Como el repo no tiene
// .gitattributes y `core.autocrlf` está en true, un checkout limpio (o un
// worktree nuevo) materializa esos archivos con CRLF y la comparación byte a
// byte fallaba por los finales de línea y no por el contenido: pasaban acá y se
// ponían rojos en cualquier clon nuevo.
// Normalizamos los dos lados. Lo que estos tests tienen que detectar es que
// alguien corrija docs/legal/*.md y no regenere, no cómo se checkouteó el repo.
const sinCR = (s) => s.replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------
// Piezas puras
// ---------------------------------------------------------------------------

describe('escaparHtml', () => {
  it('escapa los cinco caracteres peligrosos', () => {
    expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('deja intacto el texto chileno con tildes y ñ', () => {
    expect(escaparHtml('Ñuñoa, Maipú, señas')).toBe('Ñuñoa, Maipú, señas');
  });

  it('convierte null y undefined en texto vacío', () => {
    expect(escaparHtml(null)).toBe('');
    expect(escaparHtml(undefined)).toBe('');
  });
});

describe('unirMarcadores', () => {
  it('junta un marcador partido en varias líneas', () => {
    const md = '[[PENDIENTE: repetir la verificación de EXIF\nen el build nativo]]';
    expect(unirMarcadores(md)).toBe('[[PENDIENTE: repetir la verificación de EXIF en el build nativo]]');
  });

  it('junta un marcador partido DENTRO de una cita, comiéndose los "> "', () => {
    const md = '> [[PENDIENTE: revisar con un abogado bajo qué mecanismo\n> del capítulo de transferencias\n> se ampara esto]]';
    expect(unirMarcadores(md)).toBe(
      '> [[PENDIENTE: revisar con un abogado bajo qué mecanismo del capítulo de transferencias se ampara esto]]',
    );
  });
});

describe('resolverMarcador', () => {
  it('reemplaza por el valor cuando el dato está en CONFIG', () => {
    const r = resolverMarcador('PENDIENTE: correo de contacto', { CORREO_CONTACTO: 'hola@ejemplo.cl' });
    expect(r.tipo).toBe('resuelto');
    expect(r.html).toBe('hola@ejemplo.cl');
  });

  it('escapa el valor que venga de CONFIG', () => {
    const r = resolverMarcador('PENDIENTE: nombre de la app', { NOMBRE_APP: '<script>x</script>' });
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
  });

  it('deja un resaltado visible cuando el dato falta', () => {
    const r = resolverMarcador('PENDIENTE: correo de contacto', { CORREO_CONTACTO: null });
    expect(r.tipo).toBe('faltante');
    expect(r.html).toContain('class="falta"');
    expect(r.html).toContain('CORREO DE CONTACTO');
  });

  it('trata como consulta para el abogado lo que no es una sustitución conocida', () => {
    const r = resolverMarcador('PENDIENTE: confirmar la retención de logs en el plan de Supabase');
    expect(r.tipo).toBe('consulta');
    expect(r.html).toContain('class="consulta"');
    expect(r.html).toContain('retención de logs');
  });
});

describe('renderizar — bloques', () => {
  it('descarta el h1 del markdown (lo pone la plantilla) y le da id a los h2', () => {
    const html = renderizar('# Política de privacidad\n\n## 1. Quién trata tus datos');
    expect(html).not.toContain('<h1');
    expect(html).toContain('<h2 id="1-quien-trata-tus-datos">');
  });

  it('una tabla con encabezado sale con thead', () => {
    const html = renderizar('| Dato | Para qué |\n|---|---|\n| Correo | Entrar |');
    expect(html).toContain('<thead>');
    expect(html).toContain('<th>Dato</th>');
    expect(html).toContain('<td>Correo</td>');
  });

  it('una tabla sin encabezado real (| | |) NO genera una fila vacía arriba', () => {
    const html = renderizar('| | |\n|---|---|\n| **Responsable** | Pablo Espinoza |');
    expect(html).not.toContain('<thead>');
    expect(html).toContain('<strong>Responsable</strong>');
  });

  it('envuelve la tabla en un contenedor con scroll propio (se lee en un teléfono)', () => {
    const html = renderizar('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('class="tabla-scroll"');
  });

  it('una lista numerada que no empieza en 1 conserva su numeración', () => {
    const html = renderizar('7. Pedir una transferencia\n8. Decir que tienes a una mascota');
    expect(html).toContain('<ol start="7">');
  });

  it('junta las líneas de continuación de un ítem en vez de partir la frase', () => {
    const html = renderizar('- La ubicación que se ve en el mapa no es la exacta. La movemos\n  al azar unos 250 metros.');
    expect(html).toContain('<li>La ubicación que se ve en el mapa no es la exacta. La movemos al azar unos 250 metros.</li>');
  });

  it('renderiza una cita con varios párrafos', () => {
    const html = renderizar('> Primer párrafo.\n>\n> Segundo párrafo.');
    expect(html).toContain('<blockquote>');
    expect((html.match(/<p>/g) || []).length).toBe(2);
  });
});

describe('renderizar — texto en línea', () => {
  it('convierte negrita, cursiva y código', () => {
    const html = renderizar('Esto es **fuerte**, esto *suave* y esto `codigo`.');
    expect(html).toContain('<strong>fuerte</strong>');
    expect(html).toContain('<em>suave</em>');
    expect(html).toContain('<code>codigo</code>');
  });

  it('escapa HTML que venga en el markdown', () => {
    const html = renderizar('Un parrafo con <script>alert(1)</script> adentro.');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  // Regresión: la primera versión usaba un número entre espacios como
  // separador interno para apartar los marcadores, y el reemplazo de vuelta se
  // comía cualquier cifra suelta del texto legal. Los plazos y las distancias
  // de estos documentos son justamente cifras sueltas.
  it('NO toca las cifras sueltas del texto aunque haya un marcador en el mismo párrafo', () => {
    const html = renderizar(
      'Te respondemos en 30 días. La movemos unos 250 metros. Escribinos a [[PENDIENTE: correo de contacto]] si tenés 14 años.',
    );
    expect(html).toContain('en 30 días');
    expect(html).toContain('unos 250 metros');
    expect(html).toContain('tenés 14 años');
    expect(html).toContain('class="falta"');
  });
});

// ---------------------------------------------------------------------------
// Los documentos reales
// ---------------------------------------------------------------------------

describe('las dos páginas legales generadas', () => {
  const construidas = construir();

  it('genera una página por documento declarado', () => {
    expect(construidas).toHaveLength(DOCS.length);
  });

  // ESTE es el test que importa: el markdown lo va a editar un abogado y el
  // HTML publicado es un artefacto generado. Si alguien corrige docs/legal/ y
  // no regenera, la web sigue sirviendo la versión vieja sin que nadie lo note.
  it('el HTML commiteado está al día con docs/legal/*.md', () => {
    for (const r of construidas) {
      const enDisco = readFileSync(join(RAIZ, r.doc.salida), 'utf8');
      expect(sinCR(enDisco)).toBe(sinCR(r.html));
    }
  });

  it('no deja ningún marcador [[...]] sin procesar', () => {
    for (const r of construidas) {
      expect(r.html).not.toContain('[[');
    }
  });

  it('no deja markdown sin convertir (negritas, pipes, almohadillas)', () => {
    for (const r of construidas) {
      const cuerpo = r.html.slice(r.html.indexOf('<h1>'));
      const sinTablas = cuerpo.replace(/<table>[\s\S]*?<\/table>/g, '');
      expect(cuerpo).not.toContain('**');
      expect(sinTablas).not.toContain('|');
      expect(cuerpo).not.toMatch(/^#{1,6} /m);
    }
  });

  it('mientras sea borrador va con noindex y con la franja de advertencia', () => {
    for (const r of construidas) {
      expect(r.esBorrador).toBe(true);
      expect(r.html).toContain('name="robots" content="noindex"');
      expect(r.html).toContain('class="franja"');
      expect(r.html).toContain('todavía no publicado');
    }
  });

  it('cada página enlaza a la otra y a la de borrado de cuenta', () => {
    const privacidad = construidas.find((r) => r.doc.ruta === '/privacidad');
    const terminos = construidas.find((r) => r.doc.ruta === '/terminos');
    expect(privacidad.html).toContain('href="/terminos"');
    expect(terminos.html).toContain('href="/privacidad"');
    expect(privacidad.html).toContain('href="/borrar-cuenta"');
  });

  it('avisa en el propio archivo que es generado y no se edita a mano', () => {
    for (const r of construidas) {
      expect(r.html).toContain('GENERADO — no editar a mano');
      expect(r.html).toContain('scripts/generar-legales.js');
    }
  });
});

// ---------------------------------------------------------------------------
// El canal de contacto
// ---------------------------------------------------------------------------
// `[[CANAL: …]]` existe porque un dato faltante en medio de "escríbenos a ___ y
// te respondemos" no se puede rellenar con un hueco: hay que cambiar la frase.

describe('el canal de contacto', () => {
  it('sin correo, no promete un canal y manda a lo que sí funciona hoy', () => {
    const t = textoCanal('ejercer un derecho', null);
    expect(t).not.toMatch(/escríbenos/i);
    expect(t).toContain('Perfil → Editar perfil');
    expect(t).toContain('Perfil → Avisos');
    expect(t).toContain('Perfil → Borrar mi cuenta');
  });

  it('con correo, sí lo da y dice para qué', () => {
    const t = textoCanal('ejercer un derecho', 'hola@ejemplo.cl');
    expect(t).toContain('Para ejercer un derecho, escríbenos a hola@ejemplo.cl');
  });

  it('mientras no haya correo sigue siendo un dato faltante, así que --final sigue cerrado', () => {
    const r = resolverMarcador('CANAL: lo que sea', { CORREO_CONTACTO: null });
    expect(r.tipo).toBe('faltante');
    expect(r.clave).toBe('CORREO_CONTACTO');
  });

  it('con correo deja de bloquear', () => {
    expect(resolverMarcador('CANAL: lo que sea', { CORREO_CONTACTO: 'a@b.cl' }).tipo).toBe('resuelto');
  });
});

// ---------------------------------------------------------------------------
// El módulo de datos de la app
// ---------------------------------------------------------------------------

describe('aBloquesApp — qué hace la app con cada tipo de marcador', () => {
  const app = (md, config) =>
    aBloquesApp(analizar(md, { marcadores: [], secciones: [] }, config || CONFIG));
  const texto = (bloques) => JSON.stringify(bloques);

  it('una pregunta para el abogado no llega a la app, pero la frase sigue entera', () => {
    const bloques = app('Lo que retenga cada proveedor. [[PENDIENTE: confirmar la retención de logs]]');
    expect(texto(bloques)).toContain('Lo que retenga cada proveedor.');
    expect(texto(bloques)).not.toContain('retención de logs');
  });

  it('si la pregunta era el bloque entero, el bloque no llega', () => {
    expect(app('> [[PENDIENTE: que el abogado confirme la comuna]]')).toEqual([]);
  });

  it('al sacar la pregunta se lleva el guión que la introducía', () => {
    const bloques = app('Servidores de AWS fuera de Chile — [[PENDIENTE: confirmar la región exacta]]');
    expect(texto(bloques)).toContain('Servidores de AWS fuera de Chile');
    expect(texto(bloques)).not.toContain('Chile —');
  });

  it('pero NO se lleva los dos puntos de una frase que presenta una lista', () => {
    expect(texto(app('Lo que hacemos al respecto:'))).toContain('Lo que hacemos al respecto:');
  });

  it('un dato que falta se cuenta en castellano, no como marcador', () => {
    const bloques = app('El canal: [[PENDIENTE: correo de contacto]]', { CORREO_CONTACTO: null });
    expect(texto(bloques)).toContain('todavía no hay uno publicado');
    expect(texto(bloques)).not.toContain('CORREO DE CONTACTO');
  });

  it('cuando el dato existe, se usa el dato', () => {
    const bloques = app('El canal: [[PENDIENTE: correo de contacto]]', { CORREO_CONTACTO: 'a@b.cl' });
    expect(texto(bloques)).toContain('a@b.cl');
  });
});

describe('el módulo de datos que renderiza la pantalla', () => {
  const generado = construirApp();

  // El gemelo del test de arriba, por la misma razón: la pantalla de la app es
  // un artefacto de docs/legal/*.md. Si alguien corrige el markdown y no
  // regenera, la app sigue mostrando el texto viejo.
  it('el archivo commiteado está al día con docs/legal/*.md', () => {
    expect(sinCR(readFileSync(join(RAIZ, SALIDA_APP), 'utf8'))).toBe(sinCR(generado));
  });

  // Solo los datos: la cabecera del archivo declara tipos como TramoLegal[][],
  // y hasta ahí llega el parecido con un marcador.
  const datos = generado.slice(generado.indexOf('DOCUMENTOS_LEGALES'));

  it('no deja marcadores crudos ni los resaltados de la web', () => {
    expect(datos).not.toContain('[[PENDIENTE');
    expect(datos).not.toContain('[[CANAL');
    expect(datos).not.toContain('PENDIENTE');
    expect(datos).not.toContain('class=\\"falta\\"');
    expect(datos).not.toContain('Pendiente de revisión');
  });

  it('no deja markdown ni HTML sin convertir', () => {
    expect(datos).not.toContain('**');
    expect(datos).not.toContain('<strong>');
    expect(datos).not.toContain('<mark');
  });

  it('avisa en el propio archivo que es generado y no se edita a mano', () => {
    expect(generado).toContain('GENERADO — no editar a mano');
    expect(generado).toContain('scripts/generar-legales.js');
  });

  it('lleva los dos documentos, con el mismo título y ruta que las páginas web', () => {
    for (const doc of DOCS) {
      expect(generado).toContain('"titulo": ' + JSON.stringify(doc.titulo));
      expect(generado).toContain('"ruta": ' + JSON.stringify(doc.ruta));
    }
  });
});

describe('la puerta de publicación', () => {
  // Sin esto, la forma de equivocarse es publicar en Google Play una política
  // de privacidad que todavía dice "CORREO DE CONTACTO" en amarillo.
  it('--final se niega a generar mientras queden datos sin completar', () => {
    expect(() => generar({ final: true })).toThrow(/No se puede generar la version final/);
  });

  it('el error dice qué documento y cuántos pendientes tiene', () => {
    expect(() => generar({ final: true })).toThrow(/politica-privacidad\.md/);
  });
});
