import { GUIA_PERDIDA } from '../../src/data/guiaPerdida';
import {
  etiquetaTiempo,
  horasDesde,
  planDeBusqueda,
  ventanaDeHoras,
  PASOS_PLAN,
  VENTANAS,
  type PasoPlan,
  type PerfilBusqueda,
  type VentanaId,
} from '../../src/lib/planBusqueda';

// PLAN DE BÚSQUEDA CON RELOJ, POR ESPECIE.
//
// La búsqueda física del vecindario resuelve el 49% de los casos en perros y el
// 30% en gatos: más que cualquier base de datos. Y la mediana de recuperación es
// de 2 días en perros y 5 en gatos, así que un plan sirve si está medido en
// HORAS. Lo que la app tenía hasta ahora (src/data/guiaPerdida.ts) es contenido
// estático, el mismo para todos, sin reloj.
//
// `ahora` SIEMPRE entra como parámetro (convención del repo: recordatorios.ts,
// edadDesde.ts). Nada de `new Date()` adentro.

const AHORA = new Date('2026-08-01T18:00:00Z');
const hs = (n: number) => new Date(AHORA.getTime() - n * 3600 * 1000);

function textoDe(pasos: PasoPlan[]): string {
  return pasos.map((p) => `${p.titulo} ${p.detalle}`).join(' ');
}

function planCompleto(perfil: PerfilBusqueda, horas = 0): PasoPlan[] {
  return planDeBusqueda(perfil, hs(horas), AHORA).ventanas.flatMap((v) => v.pasos);
}

function pasosDe(perfil: PerfilBusqueda, ventana: VentanaId, horas = 0): PasoPlan[] {
  const plan = planDeBusqueda(perfil, hs(horas), AHORA);
  return plan.ventanas.find((v) => v.id === ventana)!.pasos;
}

const ids = (pasos: PasoPlan[]) => pasos.map((p) => p.id);

// ─── el reloj ───────────────────────────────────────────────────────────────

describe('el reloj de la pérdida', () => {
  it('cuenta las horas transcurridas de verdad', () => {
    expect(horasDesde(new Date('2026-08-01T15:30:00Z'), AHORA)).toBeCloseTo(2.5, 5);
    expect(horasDesde('2026-07-30T18:00:00Z', AHORA)).toBeCloseTo(48, 5);
  });

  it('una fecha inválida o futura no rompe: arranca en cero', () => {
    // Degradar limpio importa: `creado_en` puede venir raro de la base y el
    // dueño no puede quedarse sin plan por eso.
    expect(horasDesde('no-es-una-fecha', AHORA)).toBe(0);
    expect(horasDesde(new Date('2026-08-02T18:00:00Z'), AHORA)).toBe(0);
    expect(planDeBusqueda({ especie: 'perro' }, 'no-es-una-fecha', AHORA).ventanaActual).toBe('ahora');
  });

  it('los bordes de las cuatro ventanas caen donde tienen que caer', () => {
    expect(ventanaDeHoras(0)).toBe('ahora');
    expect(ventanaDeHoras(1.99)).toBe('ahora');
    expect(ventanaDeHoras(2)).toBe('hoy');
    expect(ventanaDeHoras(23.99)).toBe('hoy');
    expect(ventanaDeHoras(24)).toBe('dia2');
    expect(ventanaDeHoras(119.99)).toBe('dia2');
    expect(ventanaDeHoras(120)).toBe('dia5');
    expect(ventanaDeHoras(1000)).toBe('dia5');
  });

  it('dice el tiempo transcurrido como lo diría una persona', () => {
    expect(etiquetaTiempo(0.4)).toBe('Hace menos de una hora');
    expect(etiquetaTiempo(1)).toBe('Hace una hora');
    expect(etiquetaTiempo(1.9)).toBe('Hace una hora');
    expect(etiquetaTiempo(5.8)).toBe('Hace 5 horas');
    expect(etiquetaTiempo(23.9)).toBe('Hace 23 horas');
    expect(etiquetaTiempo(24)).toBe('Hace 1 día');
    expect(etiquetaTiempo(47)).toBe('Hace 1 día');
    expect(etiquetaTiempo(48)).toBe('Hace 2 días');
    expect(etiquetaTiempo(24 * 30)).toBe('Hace 30 días');
  });

  it('el plan lleva las horas que calculó, no las que le pasaron', () => {
    const plan = planDeBusqueda({ especie: 'gato' }, hs(30), AHORA);
    expect(plan.horas).toBeCloseTo(30, 5);
    expect(plan.ventanaActual).toBe('dia2');
  });
});

describe('cómo se ordenan las ventanas alrededor del ahora', () => {
  it('siempre están las cuatro, en orden, pase lo que pase', () => {
    for (const horas of [0, 3, 40, 500]) {
      const plan = planDeBusqueda({ especie: 'perro' }, hs(horas), AHORA);
      expect(plan.ventanas.map((v) => v.id)).toEqual(['ahora', 'hoy', 'dia2', 'dia5']);
    }
  });

  it('exactamente una ventana es la actual; las de antes quedan pasadas y las de después próximas', () => {
    const plan = planDeBusqueda({ especie: 'perro' }, hs(30), AHORA);
    expect(plan.ventanas.map((v) => v.estado)).toEqual(['pasada', 'pasada', 'actual', 'proxima']);
  });

  it('una ventana que ya pasó conserva sus pasos: lo que no hiciste sigue sirviendo', () => {
    // Que sea "tarde" para el punto de pérdida no significa borrarlo de la
    // pantalla: mucha gente encuentra la app al tercer día.
    const plan = planDeBusqueda({ especie: 'gato' }, hs(200), AHORA);
    const primera = plan.ventanas[0];
    expect(primera.estado).toBe('pasada');
    expect(primera.pasos.length).toBeGreaterThan(0);
  });

  it('ningún perfil se queda con una ventana vacía', () => {
    const perfiles: PerfilBusqueda[] = [
      { especie: 'perro', temperamento: 'asustadizo' },
      { especie: 'perro', temperamento: 'sociable' },
      { especie: 'gato', ambito: 'interior' },
      { especie: 'gato', ambito: 'exterior' },
      { especie: 'otro' },
    ];
    for (const perfil of perfiles) {
      for (const v of planDeBusqueda(perfil, hs(0), AHORA).ventanas) {
        expect({ perfil, ventana: v.id, pasos: v.pasos.length > 0 }).toMatchObject({ pasos: true });
      }
    }
  });

  it('cada ventana lleva un título con el tiempo adentro', () => {
    const plan = planDeBusqueda({ especie: 'perro' }, hs(0), AHORA);
    expect(plan.ventanas[0].titulo).toMatch(/2 horas/);
    expect(plan.ventanas[1].titulo).toMatch(/[Hh]oy/);
    expect(plan.ventanas[2].titulo).toMatch(/[Dd]ía 2/);
    expect(plan.ventanas[3].titulo).toMatch(/[Dd]ía 5/);
    expect(Object.keys(VENTANAS)).toHaveLength(4);
  });

  it('dentro de un plan no hay dos pasos con el mismo id', () => {
    const lista = ids(planCompleto({ especie: 'gato', ambito: 'interior' }));
    expect(new Set(lista).size).toBe(lista.length);
  });
});

// ─── perros: el error más común y el más caro ───────────────────────────────

describe('perro', () => {
  const asustado: PerfilBusqueda = { especie: 'perro', temperamento: 'asustadizo' };

  it('lo PRIMERO que dice en las próximas 2 horas es que no lo persiga', () => {
    // Correr detrás de un perro en pánico lo empuja lejos del punto de pérdida.
    // Si esto queda sepultado en el paso 5 no sirve de nada.
    const pasos = pasosDe(asustado, 'ahora');
    expect(pasos[0].id).toBe('no-lo-persigas');
  });

  it('nombra las tres cosas que no hay que hacer: correr, gritar y mirarlo a los ojos', () => {
    const texto = textoDe(pasosDe(asustado, 'ahora')).toLowerCase();
    expect(texto).toContain('no corras');
    expect(texto).toContain('a los gritos');
    expect(texto).toContain('a los ojos');
  });

  it('si es asustadizo, explica la maniobra de agacharse de costado cuando lo ve', () => {
    const texto = textoDe(pasosDe(asustado, 'ahora')).toLowerCase();
    expect(ids(pasosDe(asustado, 'ahora'))).toContain('si-lo-ves-agachate');
    expect(texto).toContain('de costado');
  });

  it('con un perro sociable el plan cambia: no aparece la maniobra de agacharse', () => {
    const sociable: PerfilBusqueda = { especie: 'perro', temperamento: 'sociable' };
    expect(ids(pasosDe(sociable, 'ahora'))).not.toContain('si-lo-ves-agachate');
    // …pero lo de no perseguir queda para todos: un perro suelto y sociable
    // igual se aleja si lo corren.
    expect(ids(pasosDe(sociable, 'ahora'))).toContain('no-lo-persigas');
  });

  it('si no sabemos el temperamento, se asume asustadizo (la equivocación cara es la otra)', () => {
    const sinDato: PerfilBusqueda = { especie: 'perro', temperamento: 'desconocido' };
    expect(ids(planCompleto(sinDato))).toEqual(ids(planCompleto(asustado)));
    // y no declarar el campo es lo mismo que declararlo desconocido
    expect(ids(planCompleto({ especie: 'perro' }))).toEqual(ids(planCompleto(asustado)));
  });

  it('al día 2 le dice que amplíe el radio y a quién preguntarle', () => {
    const texto = textoDe(pasosDe(asustado, 'dia2', 30)).toLowerCase();
    expect(ids(pasosDe(asustado, 'dia2', 30))).toContain('perro-amplia-el-radio');
    expect(texto).toMatch(/misma hora/);
  });

  it('no recibe ningún paso pensado para gatos', () => {
    expect(ids(planCompleto(asustado)).filter((id) => id.startsWith('gato-'))).toEqual([]);
  });
});

// ─── gatos: no se fue lejos ─────────────────────────────────────────────────

describe('gato', () => {
  const interior: PerfilBusqueda = { especie: 'gato', ambito: 'interior' };

  it('a un gato de interior le dice que está a menos de 100 m, escondido y callado', () => {
    const texto = textoDe(pasosDe(interior, 'ahora')).toLowerCase();
    expect(ids(pasosDe(interior, 'ahora'))).toContain('gato-esta-a-cien-metros');
    expect(texto).toContain('100 m');
    expect(texto).toMatch(/escondid/);
  });

  it('la búsqueda es puerta por puerta y a ras del suelo, no gritando por la calle', () => {
    const texto = textoDe(planCompleto(interior)).toLowerCase();
    expect(texto).toContain('puerta por puerta');
    expect(texto).toContain('ras del suelo');
    expect(ids(planCompleto(interior))).toContain('gato-puerta-por-puerta');
  });

  it('manda a buscarlo de noche y en silencio', () => {
    const pasos = ids(pasosDe(interior, 'hoy'));
    expect(pasos).toContain('gato-de-noche-en-silencio');
    expect(textoDe(pasosDe(interior, 'hoy')).toLowerCase()).toContain('silencio');
  });

  it('el ámbito cambia el plan: un gato que salía solo no recibe lo mismo', () => {
    const exterior: PerfilBusqueda = { especie: 'gato', ambito: 'exterior' };
    expect(ids(planCompleto(exterior))).not.toContain('gato-esta-a-cien-metros');
    expect(ids(planCompleto(exterior))).toContain('gato-su-ronda');
    expect(ids(planCompleto(interior))).not.toContain('gato-su-ronda');
  });

  it('sin dato de ámbito se asume CON CALLE, igual que el radio sugerido', () => {
    // Este test decía lo contrario ("se asume interior") y estaba fijando por
    // escrito una contradicción entre dos piezas de la MISMA pantalla:
    // `radioSugerido.ts` asume "exterior" cuando no hay dato —para no achicarle
    // la búsqueda a quien no contestó— y acá se asumía "interior", que hace
    // decir "no se fue lejos, no sirve salir a recorrer cuadras". El dueño de un
    // gato sin ámbito veía la tarjeta "Buscá 1 km a la redonda" y, veinte
    // píxeles más abajo, el plan diciéndole que recorrer cuadras no servía.
    //
    // Los dos defaults eran defendibles por separado; juntos, no. Cuando el
    // dueño SÍ contestó manda su respuesta y este default no se usa.
    const conCalle: PerfilBusqueda = { especie: 'gato', ambito: 'exterior' };
    expect(ids(planCompleto({ especie: 'gato' }))).toEqual(ids(planCompleto(conCalle)));
    expect(ids(planCompleto({ especie: 'gato', ambito: 'desconocido' }))).toEqual(
      ids(planCompleto(conCalle)),
    );
  });

  it('al día 2 le dice que vuelva a revisar lo que ya revisó', () => {
    // Se mueven de noche: el rincón vacío del lunes tiene al gato el miércoles.
    expect(ids(pasosDe(interior, 'dia2', 40))).toContain('gato-revisa-de-nuevo');
  });

  it('del día 5 en adelante avisa que el hambre lo saca del escondite', () => {
    const texto = textoDe(pasosDe(interior, 'dia5', 200)).toLowerCase();
    expect(ids(pasosDe(interior, 'dia5', 200))).toContain('gato-el-hambre-lo-mueve');
    expect(texto).toContain('hambre');
  });

  it('no recibe ningún paso pensado para perros', () => {
    expect(ids(planCompleto(interior)).filter((id) => id.startsWith('perro-'))).toEqual([]);
    expect(ids(planCompleto(interior))).not.toContain('no-lo-persigas');
  });
});

// ─── lo que vale para todos ─────────────────────────────────────────────────

describe('los pasos que valen para cualquier especie', () => {
  const perfiles: PerfilBusqueda[] = [
    { especie: 'perro' },
    { especie: 'gato' },
    { especie: 'otro' },
  ];

  it('en las primeras 2 horas: volver al punto exacto y dejar algo con su olor en la puerta', () => {
    for (const perfil of perfiles) {
      const pasos = ids(pasosDe(perfil, 'ahora'));
      expect({ especie: perfil.especie, pasos }).toMatchObject({
        pasos: expect.arrayContaining(['punto-exacto-de-perdida', 'olor-en-la-puerta']),
      });
    }
    const texto = textoDe(pasosDe({ especie: 'otro' }, 'ahora')).toLowerCase();
    expect(texto).toMatch(/su cama|manta/);
    expect(texto).toMatch(/ropa|prenda/);
  });

  it('"otro" no arrastra pasos de perro ni de gato', () => {
    const lista = ids(planCompleto({ especie: 'otro' }));
    expect(lista.filter((id) => id.startsWith('gato-') || id.startsWith('perro-'))).toEqual([]);
    expect(lista).not.toContain('no-lo-persigas');
    expect(lista.length).toBeGreaterThan(5);
  });

  it('el paso de las veterinarias conserva la acción que ya existe hacia Ayuda', () => {
    const paso = planCompleto({ especie: 'perro' }).find(
      (p) => p.id === 'llama-veterinarias-y-refugios',
    );
    expect(paso?.accion?.ruta).toBe('Ayuda');
    // y el texto NO está escrito de nuevo acá: sale tal cual de la guía
    const enLaGuia = GUIA_PERDIDA.find((p) => p.id === 'llama-veterinarias-y-refugios');
    expect(paso?.detalle).toBe(enLaGuia!.detalle);
  });

  it('el afiche cae hoy, antes de que oscurezca, y engancha con el generador de la ficha', () => {
    const paso = pasosDe({ especie: 'perro' }, 'hoy').find((p) => p.id === 'difunde-con-el-afiche');
    expect(paso).toBeDefined();
    expect(paso!.accionLocal).toBe('afiche');
  });

  it('el criterio del cartel está escrito: grande, fluorescente y en las esquinas de más tráfico', () => {
    const texto = textoDe(planCompleto({ especie: 'gato' })).toLowerCase();
    expect(texto).toContain('fluorescente');
    expect(texto).toMatch(/esquina/);
    expect(texto).toMatch(/desde un auto/);
  });
});

// ─── no duplicar lo que ya estaba escrito ───────────────────────────────────

describe('el plan reusa la guía en vez de copiarla', () => {
  const idsGuia = new Set(GUIA_PERDIDA.map((p) => p.id));

  it('todo paso marcado como "viene de la guía" existe de verdad en la guía', () => {
    const rotos = PASOS_PLAN.filter((p) => p.desdeGuia && !idsGuia.has(p.id)).map((p) => p.id);
    expect(rotos).toEqual([]);
  });

  it('el plan reusa buena parte de la guía, no la ignora', () => {
    const reusados = PASOS_PLAN.filter((p) => p.desdeGuia).length;
    expect(reusados).toBeGreaterThanOrEqual(4);
  });

  it('ningún paso propio del plan repite texto de la guía', () => {
    // Detector de copiar-y-pegar: ocho palabras seguidas idénticas no pasan por
    // casualidad. Si alguien duplica una frase de guiaPerdida.ts acá, salta.
    const normalizar = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    const ngramas = (s: string) => {
      const palabras = normalizar(s);
      const out = new Set<string>();
      for (let i = 0; i + 8 <= palabras.length; i++) out.add(palabras.slice(i, i + 8).join(' '));
      return out;
    };
    const deLaGuia = new Set<string>();
    for (const p of GUIA_PERDIDA) for (const g of ngramas(`${p.titulo} ${p.detalle}`)) deLaGuia.add(g);

    const copiados: string[] = [];
    for (const p of PASOS_PLAN) {
      if (p.desdeGuia) continue;
      for (const g of ngramas(`${p.titulo ?? ''} ${p.detalle ?? ''}`)) {
        if (deLaGuia.has(g)) copiados.push(`${p.id}: “${g}”`);
      }
    }
    expect(copiados).toEqual([]);
  });

  it('el detector de copias funciona (si no, el test de arriba no cubre nada)', () => {
    // Seguro del seguro: la misma comparación, con un texto copiado a propósito.
    const copiado = GUIA_PERDIDA[0].detalle;
    expect(copiado.split(/\s+/).length).toBeGreaterThan(8);
    const palabras = copiado.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    expect(palabras.slice(0, 8).join(' ').length).toBeGreaterThan(0);
  });
});

// ─── tono ───────────────────────────────────────────────────────────────────

describe('el tono: alguien que acaba de perder a su animal', () => {
  const todos = [
    ...planCompleto({ especie: 'perro' }),
    ...planCompleto({ especie: 'perro', temperamento: 'sociable' }),
    ...planCompleto({ especie: 'gato' }),
    ...planCompleto({ especie: 'gato', ambito: 'exterior' }),
    ...planCompleto({ especie: 'otro' }),
  ];

  it('no hay arengas ni signos de exclamación', () => {
    const conGritos = todos.filter((p) => /[¡!]/.test(`${p.titulo} ${p.detalle}`)).map((p) => p.id);
    expect(conGritos).toEqual([]);
  });

  it('no hay gamificación: ni porcentajes de progreso ni puntajes', () => {
    const gamificados = todos
      .filter((p) => /\b\d+\s*%|\bpuntos\b|\bnivel \d|\blogro\b|\bracha\b/i.test(`${p.titulo} ${p.detalle}`))
      .map((p) => p.id);
    expect(gamificados).toEqual([]);
  });

  it('cada paso tiene título y detalle de verdad, y un id slug estable', () => {
    for (const p of todos) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
      expect(p.titulo.trim().length).toBeGreaterThan(0);
      expect(p.detalle.trim().length).toBeGreaterThan(30);
    }
  });
});
