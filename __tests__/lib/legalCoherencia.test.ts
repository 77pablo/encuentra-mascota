import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BloqueLegal,
  DOCUMENTOS_LEGALES,
  HAY_CORREO_DE_CONTACTO,
  TramoLegal,
} from '../../src/content/legalGenerado';

// Este archivo antes verificaba que LegalScreen.tsx —una tercera copia de los
// documentos, escrita a mano en JSX— no se contradijera con docs/legal/*.md.
// Lo hacía con una lista de compromisos escrita dentro del propio test, y solo
// cachaba los que alguien se acordó de anotar acá.
//
// Ya no hay tercera copia: la pantalla se genera desde el markdown
// (scripts/generar-legales.js → src/content/legalGenerado.ts), así que "la
// pantalla dice algo distinto al documento" dejó de ser posible por
// construcción. Lo que sí sigue siendo posible, y es lo que se prueba acá:
//
//   1. que alguien vuelva a escribir texto legal a mano en la pantalla;
//   2. que un compromiso concreto del documento se pierda por el camino (un
//      bloque que el generador descarta de más al limpiar los marcadores);
//   3. que un marcador del borrador se le escape al usuario;
//   4. que la app termine prometiendo un correo de contacto que no existe.
//
// Los compromisos se buscan con la MISMA expresión en el markdown y en lo que
// la app muestra: no hay una lista de valores escrita a mano que pueda quedar
// desactualizada en silencio.

const raiz = join(__dirname, '..', '..');
const leer = (...ruta: string[]) => readFileSync(join(raiz, ...ruta), 'utf8');

const pantalla = leer('src', 'screens', 'LegalScreen.tsx');
const md = {
  privacidad: leer('docs', 'legal', 'politica-privacidad.md'),
  terminos: leer('docs', 'legal', 'terminos-de-uso.md'),
};

/** Todo el texto que la app efectivamente pinta, en orden. */
function aplanar(bloques: BloqueLegal[]): string {
  const tramos = (t: TramoLegal[]) => t.map((x) => x.texto).join('');
  const trozos: string[] = [];
  for (const b of bloques) {
    if (b.tipo === 'titulo' || b.tipo === 'parrafo') trozos.push(tramos(b.texto));
    else if (b.tipo === 'lista') trozos.push(...b.items.map(tramos));
    else if (b.tipo === 'nota') trozos.push(aplanar(b.bloques));
    else if (b.tipo === 'tabla') {
      trozos.push(...b.columnas.map(tramos));
      for (const fila of b.filas) trozos.push(...fila.map(tramos));
    }
  }
  return trozos.join('\n');
}

function textoDeLaApp(ruta: string): string {
  const doc = DOCUMENTOS_LEGALES.find((d) => d.ruta === ruta);
  if (!doc) throw new Error(`el módulo generado no trae el documento ${ruta}`);
  return aplanar(doc.bloques);
}

const app = {
  privacidad: textoDeLaApp('/privacidad'),
  terminos: textoDeLaApp('/terminos'),
};
const appTodo = `${app.privacidad}\n${app.terminos}`;
const mdTodo = `${md.privacidad}\n${md.terminos}`;

describe('la pantalla legal no vuelve a ser una copia a mano', () => {
  it('LegalScreen.tsx lee el módulo generado', () => {
    expect(pantalla).toMatch(/from '\.\.\/content\/legalGenerado'/);
  });

  it('LegalScreen.tsx no contiene ningún compromiso del documento', () => {
    // Si alguien vuelve a escribir una cifra legal en el JSX, este test falla:
    // ahí es donde empezaba la desincronización vieja.
    for (const cifra of [/250\s*metros/i, /72\s*horas/i, /30 días corridos/i, /14 años/i]) {
      expect(pantalla).not.toMatch(cifra);
    }
  });

  it('trae los dos documentos', () => {
    expect(DOCUMENTOS_LEGALES.map((d) => d.ruta).sort()).toEqual(['/privacidad', '/terminos']);
    expect(app.privacidad.length).toBeGreaterThan(5000);
    expect(app.terminos.length).toBeGreaterThan(5000);
  });
});

describe('los compromisos del documento llegan enteros a la app', () => {
  // Una sola expresión por compromiso, aplicada a los dos lados de verdad: el
  // markdown leído del disco y el texto que la app muestra.
  const compromisos: Array<{ que: string; patron: RegExp; doc: 'privacidad' | 'terminos' }> = [
    { que: 'edad mínima de 14 años', patron: /14 años/i, doc: 'privacidad' },
    { que: 'radio de difuminado de la ubicación', patron: /250\s*metros/i, doc: 'privacidad' },
    { que: 'acuse de recibo en 5 días hábiles', patron: /5 días hábiles/i, doc: 'privacidad' },
    { que: 'plazo máximo de respuesta a los derechos', patron: /30 días corridos/i, doc: 'privacidad' },
    { que: 'plazo de aviso de brechas', patron: /72\s*horas/i, doc: 'privacidad' },
    { que: 'edad mínima en los términos', patron: /14 años/i, doc: 'terminos' },
    { que: 'moderación: estafa y acoso', patron: /24 horas/i, doc: 'terminos' },
    { que: 'moderación: venta de animales y spam', patron: /72 horas/i, doc: 'terminos' },
    { que: 'moderación: todo lo demás', patron: /7 días/i, doc: 'terminos' },
    { que: 'una suspensión se puede levantar', patron: /Una suspensión no es definitiva/, doc: 'terminos' },
    { que: 'aviso previo si se cierra el servicio', patron: /30 días de anticipación/i, doc: 'terminos' },
    { que: 'el correo de seguimiento es de finalidad única', patron: /único\s+correo/i, doc: 'privacidad' },
    {
      que: 'la foto del aviso anónimo no es pública',
      patron: /solo la ve la familia del reporte/i,
      doc: 'privacidad',
    },
  ];

  it.each(compromisos)('$que está en el documento y llega a la app', ({ patron, doc }) => {
    expect(md[doc]).toMatch(patron);
    expect(app[doc]).toMatch(patron);
  });

  it('el punto del chat sigue diciendo que no leemos los mensajes', () => {
    expect(app.privacidad).toMatch(/No los leemos/);
    // Redacción vieja, que sonaba a que guardamos todo para mirarlo.
    expect(appTodo).not.toMatch(/Los mensajes que envías y recibes en el chat de la app\./);
  });
});

describe('el borrador no se le escapa al usuario', () => {
  it('no llega ningún marcador crudo', () => {
    expect(appTodo).not.toMatch(/\[\[/);
    expect(appTodo).not.toMatch(/PENDIENTE/);
    expect(appTodo).not.toMatch(/Pendiente de revisión/);
  });

  it('las preguntas para el abogado se quedan en el borrador', () => {
    // Se leen los dos lados: están en el markdown (es un borrador interno) y no
    // están en la app (es un producto).
    const preguntas = [
      /confirmar la región exacta del proyecto/i,
      /confirmar si el envío de correos queda en Resend/i,
      /revisar con un abogado bajo qué mecanismo/i,
      /que el abogado confirme la comuna/i,
    ];
    for (const pregunta of preguntas) {
      expect(mdTodo).toMatch(pregunta);
      expect(appTodo).not.toMatch(pregunta);
    }
  });

  it('los resaltados de dato faltante de la web no llegan a la app', () => {
    expect(appTodo).not.toMatch(/CORREO DE CONTACTO/);
    expect(appTodo).not.toMatch(/RUT O RAZÓN SOCIAL/);
  });
});

describe('no se promete un canal de contacto que no existe', () => {
  it('la constante del módulo generado refleja que todavía no hay correo', () => {
    // Si algún día se publica uno, este test avisa que hay que revisar los de
    // abajo en vez de dejarlos pasar en silencio.
    expect(HAY_CORREO_DE_CONTACTO).toBe(false);
  });

  it('ningún texto le dice al usuario que escriba a alguna parte', () => {
    if (HAY_CORREO_DE_CONTACTO) return; // ya hay correo: la promesa es legítima
    expect(appTodo).not.toMatch(/escríbenos/i);
    expect(appTodo).not.toMatch(/escríbanos/i);
    expect(appTodo).not.toContain('@');
    // Y tampoco lo prometen los documentos, que es de donde sale la app.
    expect(mdTodo).not.toMatch(/escríbenos/i);
  });

  it('en su lugar apunta a lo que sí funciona hoy dentro de la app', () => {
    if (HAY_CORREO_DE_CONTACTO) return;
    expect(appTodo).toContain('Perfil → Editar perfil');
    expect(appTodo).toContain('Perfil → Avisos');
    expect(appTodo).toContain('Perfil → Borrar mi cuenta');
  });

  it('dice por qué no lo hay y cuándo lo habrá', () => {
    if (HAY_CORREO_DE_CONTACTO) return;
    expect(appTodo).toMatch(/no atenderíamos/);
    expect(appTodo).toMatch(/App Store y Google Play/);
  });
});

describe('suspender una cuenta no promete un aviso ni una apelación', () => {
  // Hasta el 30-jul los documentos prometían, con tres redacciones distintas,
  // algo que la app no hace:
  //
  //   terminos §7  «Puedes apelar. […] responder una apelación en un plazo
  //                 máximo de 10 días hábiles»
  //   terminos §7  «Retiro del contenido y aviso al correo de la cuenta»
  //   terminos §9  «te avisamos al correo registrado explicando el motivo, y
  //                 puedes apelar (§7)»
  //   privacidad §10  «las toma una persona, y se pueden apelar»
  //
  // Ninguna de las dos cosas ocurre. `moderar_suspender` (migración 0040) solo
  // escribe `suspendido_en`; la cola de `send-notifications` no tiene ningún
  // tipo de evento de moderación, así que no sale ni un correo; y el canal de
  // apelación depende de un correo de contacto que todavía no existe. Se
  // decidió BAJAR la promesa en vez de implementarla, porque una promesa
  // incumplida por escrito juega en contra y en Chile no hay safe harbor para
  // intermediarios: lo que defiende es la diligencia demostrable.
  //
  // Este bloque está para que la promesa no vuelva sola.
  //
  // Los patrones se aplican sobre el texto con los espacios normalizados. NO es
  // cosmético: el markdown fuente viene cortado a 95 columnas y con sangría de
  // continuación, así que "te avisamos al correo\n  registrado" no lo encuentra
  // ningún patrón escrito con un espacio simple. La primera versión de este
  // test pasó en verde con la promesa vieja puesta de vuelta justo por eso.
  const plano = (s: string) => s.replace(/\s+/g, ' ');
  const doc = {
    privacidad: [plano(md.privacidad), plano(app.privacidad)],
    terminos: [plano(md.terminos), plano(app.terminos)],
  };
  const todos = [...doc.privacidad, ...doc.terminos];

  it('ningún documento promete un correo al retirar contenido ni al suspender', () => {
    for (const texto of todos) {
      expect(texto).not.toMatch(/te avisamos al correo registrado/i);
      expect(texto).not.toMatch(/aviso al correo de la cuenta/i);
    }
  });

  it('ningún documento promete apelar ni un plazo para responder una apelación', () => {
    // El guard es a propósito y no una excusa: el día que haya un correo
    // publicado, prometer una apelación vuelve a ser legítimo y el test se
    // aparta solo en vez de obligar a borrarlo. Ver `textoCanal()`.
    if (HAY_CORREO_DE_CONTACTO) return;
    for (const texto of todos) {
      expect(texto).not.toMatch(/puedes apelar/i);
      expect(texto).not.toMatch(/se pueden apelar/i);
      expect(texto).not.toMatch(/10 días hábiles/i);
    }
  });

  it('en su lugar dice lo que sí es verdad, y llega igual a la app', () => {
    // Lo verificable contra el código: la decide una persona desde el panel de
    // moderación (no hay proceso automático) y `moderar_reactivar` (migración
    // 0045) la levanta dejando la cuenta como estaba.
    for (const texto of doc.terminos) {
      expect(texto).toMatch(/Una suspensión no es definitiva/);
      expect(texto).toMatch(/no te mandamos un correo/i);
      expect(texto).toMatch(/la suspensión se puede levantar/i);
    }
    for (const texto of doc.privacidad) {
      expect(texto).toMatch(/no un proceso automático/);
    }
  });

  it('bajar la promesa no se convirtió en una cláusula de exoneración', () => {
    // Art. 16 e) de la ley 19.496: eximirse anticipadamente de toda
    // responsabilidad es nulo, y además le cae pésimo a un revisor de tienda.
    // Decir «hoy no te avisamos» está bien; decir «y no respondemos de nada»
    // sería cambiar una promesa incumplible por una cláusula inválida.
    for (const texto of doc.terminos) {
      expect(texto).toMatch(/nada de esto te quita derechos/i);
      expect(texto).toMatch(/del daño que causemos por nuestra propia culpa respondemos/i);
    }
  });
});
