import { textoDeAviso } from '../../src/lib/avisosBandeja';
import * as app from '../../src/lib/notifyTargets';
import * as edge from '../../supabase/functions/send-notifications/notifyTargets';

// CUANDO EL CHIP COINCIDE, EL AVISO NO PUEDE DECIR LO MISMO DE SIEMPRE.
//
// "Puede que sea la tuya" es el texto correcto para una coincidencia normal:
// mismo tipo de animal, cerca, señas que no se contradicen. Es una posibilidad,
// y prometer más sería cruel.
//
// Un chip igual es otra cosa. El chip es único: si dos reportes de estado
// opuesto lo comparten, es el mismo animal. Decirle a esa persona "puede que
// sea la tuya" la haría postergar el aviso entre otros diez iguales — que es
// exactamente el problema que esta función viene a resolver.
//
// Y al revés importa igual: el texto fuerte NO puede salir cuando no hay chip.

const evento = (chip?: boolean): app.EventoAviso => ({
  id: 'e1',
  tipo: 'coincidencia',
  petId: 'p1',
  actorId: null,
  datos: {
    match_pet_id: 'p2',
    match_estado: 'encontrada',
    match_especie: 'perro',
    ...(chip === undefined ? {} : { chip }),
  },
});

const ctx: app.Contexto = {
  duenoPetId: 'dueno',
  nombrePet: 'Pelusa',
  zonas: [],
  prefs: {},
  seguidoresComuna: [],
};

describe('la bandeja de avisos', () => {
  it('con chip lo dice, y no de costado', () => {
    const d = textoDeAviso({ tipo: 'coincidencia', datos: { match_estado: 'encontrada', chip: true } } as any);
    const texto = `${d.titulo} ${d.detalle}`.toLowerCase();
    expect(texto).toContain('chip');
    expect(d.titulo).not.toBe('Puede que sea la tuya');
  });

  it('sin chip sigue diciendo exactamente lo de siempre', () => {
    // El texto prudente es el correcto para el 99% de las coincidencias. Si el
    // aviso fuerte se escapara ahí, la función perdería todo su valor: se
    // volvería otro "puede que sea" con más mayúsculas.
    const d = textoDeAviso({ tipo: 'coincidencia', datos: { match_estado: 'encontrada' } } as any);
    expect(d.titulo).toBe('Puede que sea la tuya');
    expect(`${d.titulo} ${d.detalle}`.toLowerCase()).not.toContain('chip');
  });

  it('`chip: false` (que es lo que manda el trigger normal) tampoco lo activa', () => {
    const d = textoDeAviso({
      tipo: 'coincidencia',
      datos: { match_estado: 'encontrada', chip: false },
    } as any);
    expect(d.titulo).toBe('Puede que sea la tuya');
  });
});

describe('el push / correo', () => {
  it('con chip, el título y el cuerpo cambian', () => {
    const normal = app.componerAviso(evento(false), ctx);
    const conChip = app.componerAviso(evento(true), ctx);
    expect(conChip.titulo).not.toBe(normal.titulo);
    expect(`${conChip.titulo} ${conChip.cuerpo}`.toLowerCase()).toContain('chip');
    expect(`${normal.titulo} ${normal.cuerpo}`.toLowerCase()).not.toContain('chip');
  });

  it('la ruta sigue llevando al OTRO reporte', () => {
    // Es lo que la persona quiere ver, no el suyo. Cambiar el texto no puede
    // llevarse por delante el destino.
    expect(app.componerAviso(evento(true), ctx).ruta).toBe('/mascota/p2');
  });

  it('nunca aparece el NÚMERO de chip en el aviso', () => {
    // El evento no lo trae —el trigger solo manda el booleano— y no puede
    // empezar a traerlo: un push con el chip adentro lo deja escrito en el
    // centro de notificaciones del teléfono y en la bandeja del correo.
    const m = app.componerAviso(evento(true), ctx);
    expect(JSON.stringify(m)).not.toMatch(/\d{9,}/);
  });
});

describe('las dos copias de notifyTargets siguen diciendo lo mismo', () => {
  it('app y Edge Function coinciden en el aviso con chip', () => {
    // `supabase/functions/send-notifications/notifyTargets.ts` es un ESPEJO:
    // el runtime de Deno no puede importar desde src/. Cambiar una sola de las
    // dos hace que la app diga una cosa y el correo otra.
    for (const chip of [true, false]) {
      expect(edge.componerAviso(evento(chip) as any, ctx as any)).toEqual(
        app.componerAviso(evento(chip), ctx),
      );
    }
  });
});
