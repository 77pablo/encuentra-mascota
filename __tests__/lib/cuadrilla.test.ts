import {
  TAREA_MAX,
  Tarea,
  agruparTareas,
  puedeCompletar,
  puedeSoltar,
  puedeTomar,
  quienLaTiene,
  resumenCuadrilla,
  sugerenciaDeInvitacion,
  tareasSugeridas,
  validarTarea,
} from '../../src/lib/cuadrilla';

// CUADRILLA — lógica pura de la búsqueda organizada del barrio.
//
// Por qué importa tanto que estas funciones estén bien: la búsqueda física
// resuelve el 49% de los casos en perros y el 30% en gatos; la base de datos,
// entre el 2% y el 6%. Todo lo demás de la app es lo que menos resuelve.
//
// Los dos riesgos de producto que estos tests vigilan (salieron del análisis
// previo, no se descubren acá):
//   1. Si nadie acepta la invitación, una pantalla que diga "0 ayudantes /
//      nadie se sumó" se siente PEOR que no tener la función. Nunca puede
//      salir de acá un texto con esa forma.
//   2. Nada de gamificar la búsqueda de una mascota perdida: sin puntajes,
//      sin rankings, sin insignias. Del otro lado hay alguien angustiado.

const BASE: Tarea = {
  id: 't1',
  cuadrillaId: 'c1',
  titulo: 'Pegar carteles',
  estado: 'pendiente',
  tomadaPor: null,
  tomadaEn: null,
  creadoEn: '2026-08-01T10:00:00Z',
};

const tarea = (over: Partial<Tarea>): Tarea => ({ ...BASE, ...over });

describe('tareasSugeridas: concretas, no genéricas', () => {
  const ROCCO = { comuna: 'Maipú', nombre: 'Rocco', especie: 'perro' as const };

  it('nombra la comuna del reporte en las tareas de calle', () => {
    // "Pegá carteles" sin decir DÓNDE es una tarea que nadie toma. La comuna es
    // el único dato de lugar que tenemos garantizado en el reporte.
    const conLugar = tareasSugeridas(ROCCO).filter((t) => t.includes('Maipú'));
    expect(conLugar.length).toBeGreaterThanOrEqual(3);
  });

  it('sin comuna no escribe "undefined" ni "null": cae a "el barrio"', () => {
    // Los reportes anteriores a la Tanda 3 no tienen comuna.
    const sinComuna = tareasSugeridas({ comuna: null, nombre: 'Rocco', especie: 'perro' });
    expect(sinComuna.join(' ')).not.toMatch(/undefined|null/);
    expect(sinComuna.some((t) => t.includes('el barrio'))).toBe(true);
  });

  it('usa el nombre de la mascota cuando lo hay, y no lo inventa cuando no', () => {
    expect(tareasSugeridas(ROCCO).some((t) => t.includes('Rocco'))).toBe(true);
    const anonima = tareasSugeridas({ comuna: 'Maipú', nombre: null, especie: 'perro' });
    // Sin nombre no puede quedar "llamando a " colgado ni un hueco vacío.
    expect(anonima.join(' ')).not.toMatch(/llamando a\s*($|[,.])/);
    expect(anonima.some((t) => /escuchar/.test(t))).toBe(true);
  });

  it('cubre las cuatro vías de la búsqueda física, no una sola repetida', () => {
    const todas = tareasSugeridas(ROCCO).join(' · ').toLowerCase();
    expect(todas).toContain('cartel');
    expect(todas).toContain('cuadras');
    expect(todas).toContain('veterinaria');
    // "preguntar en los negocios": el kiosco/almacén/panadería de la cuadra.
    expect(todas).toMatch(/kiosco|almac|panader/);
  });

  it('un gato y un perro NO reciben la misma lista', () => {
    // No es un detalle: un gato asustado se esconde a menos de cinco casas y un
    // perro se aleja kilómetros. Buscar un gato "recorriendo el barrio" es
    // perder la tarde. Si la sugerencia fuera la misma para los dos, esta
    // función sería un texto de relleno.
    const perro = tareasSugeridas(ROCCO);
    const gato = tareasSugeridas({ ...ROCCO, especie: 'gato' });
    expect(gato).not.toEqual(perro);
    expect(gato.join(' ').toLowerCase()).toMatch(/esconde|techo|hueco/);
  });

  it('ninguna sugerencia se pasa del largo que acepta la base', () => {
    // La comuna llega a 80 caracteres (constraint de la 0031/0020). Sin recorte,
    // "Pegar carteles en las esquinas de <comuna larguísima>" rebota contra el
    // CHECK de la migración y el alta de la cuadrilla se cae entera.
    const largo = 'Ñ'.repeat(80);
    for (const especie of ['perro', 'gato', 'otro'] as const) {
      for (const t of tareasSugeridas({ comuna: largo, nombre: 'X'.repeat(60), especie })) {
        expect(t.length).toBeGreaterThan(0);
        expect(t.length).toBeLessThanOrEqual(TAREA_MAX);
      }
    }
  });

  it('no se repiten entre sí', () => {
    const t = tareasSugeridas(ROCCO);
    expect(t.length).toBeGreaterThanOrEqual(5);
    expect(new Set(t).size).toBe(t.length);
  });
});

describe('validarTarea', () => {
  it('recorta los bordes', () => {
    expect(validarTarea('  Avisar en la vet  ')).toEqual({ ok: true, titulo: 'Avisar en la vet' });
  });

  it('rechaza lo vacío y lo que solo tiene espacios', () => {
    expect(validarTarea('   ').ok).toBe(false);
    expect(validarTarea('').ok).toBe(false);
  });

  it('rechaza lo que la base rechazaría, y avisa con el número', () => {
    const r = validarTarea('a'.repeat(TAREA_MAX + 1));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain(String(TAREA_MAX));
  });

  it('acepta el largo exacto del tope (no se pasa de estricta)', () => {
    expect(validarTarea('a'.repeat(TAREA_MAX)).ok).toBe(true);
  });
});

describe('permisos de una tarea (espejo de la RLS de la 0048)', () => {
  const YO = 'u-yo';
  const OTRO = 'u-otro';

  it('una tarea libre la puede tomar cualquiera de la cuadrilla', () => {
    expect(puedeTomar(tarea({}), YO, false)).toBe(true);
  });

  it('una tarea que ya tiene dueño NO se le roba a nadie', () => {
    const tomada = tarea({ estado: 'tomada', tomadaPor: OTRO });
    expect(puedeTomar(tomada, YO, false)).toBe(false);
    // Ni siquiera el dueño del reporte la toma: la suelta primero.
    expect(puedeTomar(tomada, YO, true)).toBe(false);
  });

  it('una tarea hecha no se vuelve a tomar', () => {
    expect(puedeTomar(tarea({ estado: 'hecha', tomadaPor: OTRO }), YO, false)).toBe(false);
  });

  it('la suelta quien la tomó, o el dueño del reporte (que destraba)', () => {
    const mia = tarea({ estado: 'tomada', tomadaPor: YO });
    const ajena = tarea({ estado: 'tomada', tomadaPor: OTRO });
    expect(puedeSoltar(mia, YO, false)).toBe(true);
    expect(puedeSoltar(ajena, YO, false)).toBe(false);
    // Un ayudante que se fue de viaje deja la tarea trabada para siempre si el
    // dueño no puede destrabarla.
    expect(puedeSoltar(ajena, YO, true)).toBe(true);
  });

  it('nada se suelta si nunca se tomó', () => {
    expect(puedeSoltar(tarea({}), YO, true)).toBe(false);
  });

  it('la cierra quien la tomó, o el dueño', () => {
    expect(puedeCompletar(tarea({ estado: 'tomada', tomadaPor: YO }), YO, false)).toBe(true);
    expect(puedeCompletar(tarea({ estado: 'tomada', tomadaPor: OTRO }), YO, false)).toBe(false);
    expect(puedeCompletar(tarea({ estado: 'tomada', tomadaPor: OTRO }), YO, true)).toBe(true);
  });

  it('sin sesión no se puede nada', () => {
    expect(puedeTomar(tarea({}), null, false)).toBe(false);
    expect(puedeSoltar(tarea({ estado: 'tomada', tomadaPor: YO }), null, false)).toBe(false);
    expect(puedeCompletar(tarea({ estado: 'tomada', tomadaPor: YO }), null, true)).toBe(false);
  });
});

describe('agruparTareas: primero lo que falta hacer', () => {
  it('separa por estado y deja las hechas al final', () => {
    const g = agruparTareas([
      tarea({ id: 'a', estado: 'hecha', tomadaPor: 'u1' }),
      tarea({ id: 'b', estado: 'pendiente' }),
      tarea({ id: 'c', estado: 'tomada', tomadaPor: 'u2' }),
    ]);
    expect(g.pendientes.map((t) => t.id)).toEqual(['b']);
    expect(g.tomadas.map((t) => t.id)).toEqual(['c']);
    expect(g.hechas.map((t) => t.id)).toEqual(['a']);
  });

  it('dentro de cada grupo, la más vieja primero (el orden en que se pensaron)', () => {
    const g = agruparTareas([
      tarea({ id: 'nueva', creadoEn: '2026-08-02T10:00:00Z' }),
      tarea({ id: 'vieja', creadoEn: '2026-08-01T10:00:00Z' }),
    ]);
    expect(g.pendientes.map((t) => t.id)).toEqual(['vieja', 'nueva']);
  });

  it('no muta el arreglo que recibe', () => {
    const entrada = [tarea({ id: 'z', creadoEn: '2026-08-09T10:00:00Z' }), tarea({ id: 'a' })];
    const copia = [...entrada];
    agruparTareas(entrada);
    expect(entrada).toEqual(copia);
  });
});

describe('quienLaTiene: la tarea dice de quién es, sin exponer ids', () => {
  const miembros = [
    { userId: 'u1', nombre: 'Ana', creadoEn: '2026-08-01T10:00:00Z' },
    { userId: 'u2', nombre: null, creadoEn: '2026-08-01T11:00:00Z' },
  ];

  it('si la tomé yo, lo dice en primera persona', () => {
    expect(quienLaTiene(tarea({ estado: 'tomada', tomadaPor: 'u1' }), miembros, 'u1')).toBe(
      'La tomaste vos',
    );
  });

  it('si la tomó otro, usa su nombre', () => {
    expect(quienLaTiene(tarea({ estado: 'tomada', tomadaPor: 'u1' }), miembros, 'u2')).toBe(
      'La tomó Ana',
    );
  });

  it('un ayudante sin nombre cargado no queda como un uuid en pantalla', () => {
    const t = quienLaTiene(tarea({ estado: 'tomada', tomadaPor: 'u2' }), miembros, 'u1');
    expect(t).not.toContain('u2');
    expect(t).toBe('La tomó un vecino');
  });

  it('una tarea libre no dice nada', () => {
    expect(quienLaTiene(tarea({}), miembros, 'u1')).toBeNull();
  });
});

describe('resumenCuadrilla NUNCA suena a fracaso', () => {
  it('con una sola persona no dice "nadie" ni cuenta ayudantes en cero', () => {
    // El riesgo número uno de esta función: el dueño abre la pantalla al rato de
    // compartir el link y lee "0 ayudantes". Eso duele más que no tener nada.
    const t = resumenCuadrilla(1, [tarea({}), tarea({ id: 't2' })]);
    expect(t.toLowerCase()).not.toContain('nadie');
    expect(t).not.toMatch(/\b0\b/);
    expect(t.toLowerCase()).not.toContain('ayudante');
    // Con una sola persona NO se cuenta gente. "1 persona buscando" es
    // subrayarle al dueño que está solo, justo cuando abrió la pantalla a los
    // dos minutos de mandar el link (y "1 personas" es además una falta de
    // concordancia que se ve en producción).
    expect(t.toLowerCase()).not.toContain('persona');
    // Y sí dice algo útil: qué hay para hacer.
    expect(t).toContain('2 tareas sin tomar');
  });

  it('con dos personas —el caso real— cuenta las personas', () => {
    expect(resumenCuadrilla(2, [tarea({})])).toContain('2 personas buscando');
  });

  it('concuerda en número: 1 tarea, no "1 tareas"', () => {
    const t = resumenCuadrilla(2, [tarea({})]);
    expect(t).toContain('1 tarea sin tomar');
    expect(t).not.toContain('1 tareas');
  });

  it('sin pendientes no inventa un cero', () => {
    const t = resumenCuadrilla(2, [tarea({ estado: 'hecha', tomadaPor: 'u1' })]);
    expect(t).not.toMatch(/\b0\b/);
    expect(t.toLowerCase()).toContain('todo repartido');
  });

  it('no gamifica: ni puntos, ni ranking, ni insignias', () => {
    for (const n of [1, 2, 3, 12]) {
      const t = resumenCuadrilla(n, [tarea({}), tarea({ id: 'x', estado: 'hecha', tomadaPor: 'u' })]);
      expect(t.toLowerCase()).not.toMatch(/punto|ranking|insignia|medalla|nivel|top |récord|record/);
      expect(t).not.toMatch(/🏆|🥇|⭐|🔥/);
    }
  });
});

describe('sugerenciaDeInvitacion: qué se le dice al dueño según cuántos son', () => {
  it('solo: invita a compartir y explica por qué sirve, sin culpar a nadie', () => {
    const t = sugerenciaDeInvitacion(1);
    expect(t.toLowerCase()).not.toContain('nadie');
    expect(t.toLowerCase()).not.toContain('todavía no se sumó');
    expect(t.length).toBeGreaterThan(20);
  });

  it('con dos dice qué hacer AHORA (repartirse), no "invitá más gente")', () => {
    // El objetivo del MVP es que dos personas funcionen bien. Si con dos la
    // pantalla sigue pidiendo más gente, le está diciendo a la persona que lo
    // que consiguió no alcanza.
    const t = sugerenciaDeInvitacion(2).toLowerCase();
    expect(t).toMatch(/rep[aá]rt/);
  });

  it('nunca promete avisos que la app no manda', () => {
    // No tocamos la cola de avisos ni su Edge Function: un ayudante NO recibe
    // nada cuando le asignan o le liberan una tarea. Prometerlo sería mentir.
    for (const n of [1, 2, 5]) {
      const t = sugerenciaDeInvitacion(n).toLowerCase();
      expect(t).not.toMatch(/te avisamos|le avisamos|te notificamos|recibir[áa]s? avisos/);
    }
  });
});
