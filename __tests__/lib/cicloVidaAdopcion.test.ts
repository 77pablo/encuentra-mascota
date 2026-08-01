import {
  DIAS_VIGENCIA_ADOPCION,
  diasDesdeRenovacionAdopcion,
  enPausa,
} from '../../src/lib/cicloVidaAdopcion';

// CICLO DE VIDA DE UNA PUBLICACIÓN DE ADOPCIÓN — espejo de `cicloVida.ts`
// (reportes), pero con dos diferencias que NO son cosméticas y por eso tienen
// test propio:
//
//  1. El umbral es más largo. Un reporte de mascota perdida se resuelve o se
//     enfría en semanas; un refugio con 40 animales publicados no puede estar
//     renovando cada mes y medio. Si el auto-archivado se le come las
//     publicaciones, le rompimos la app justo a quien queremos servir.
//  2. `renovado_en` AUSENTE (undefined) no es lo mismo que `renovado_en` en
//     null. Ausente = la migración 0052 todavía no corrió y PostgREST ni
//     devuelve la clave: en ese caso NADA está en pausa, porque la RPC vieja
//     tampoco filtra por vigencia. Si acá cayéramos a `creado_en`, toda
//     publicación de más de 90 días se mostraría "en pausa" mientras sigue
//     perfectamente visible en el feed.

const DIA = 86400000;
const AHORA = Date.parse('2026-08-01T12:00:00Z');
const haceDias = (d: number) => new Date(AHORA - d * DIA).toISOString();

const publicacion = (over: Partial<Parameters<typeof enPausa>[0]> = {}) => ({
  creado_en: haceDias(400),
  renovado_en: haceDias(1),
  adoptada_en: null,
  ...over,
});

describe('diasDesdeRenovacionAdopcion', () => {
  it('cuenta desde renovado_en cuando existe', () => {
    expect(
      diasDesdeRenovacionAdopcion({ creado_en: haceDias(200), renovado_en: haceDias(4) }, AHORA),
    ).toBe(4);
  });

  it('cae a creado_en cuando renovado_en es null (fila anterior al backfill)', () => {
    expect(
      diasDesdeRenovacionAdopcion({ creado_en: haceDias(30), renovado_en: null }, AHORA),
    ).toBe(30);
  });

  it('devuelve null cuando la columna no vino: no hay reloj que leer', () => {
    expect(diasDesdeRenovacionAdopcion({ creado_en: haceDias(300) }, AHORA)).toBeNull();
  });
});

describe('enPausa — el umbral, justo antes y justo después', () => {
  it(`no está en pausa un día antes de los ${DIAS_VIGENCIA_ADOPCION}`, () => {
    expect(enPausa(publicacion({ renovado_en: haceDias(DIAS_VIGENCIA_ADOPCION - 1) }), AHORA)).toBe(
      false,
    );
  });

  it(`está en pausa justo a los ${DIAS_VIGENCIA_ADOPCION} días`, () => {
    expect(enPausa(publicacion({ renovado_en: haceDias(DIAS_VIGENCIA_ADOPCION) }), AHORA)).toBe(
      true,
    );
  });

  it('el umbral de adopción es más largo que el de un reporte perdido (45 días)', () => {
    // Un refugio publica y espera; no está buscando algo que se le escapó hace
    // tres días. Con 45 días le archivaríamos el catálogo entero.
    expect(DIAS_VIGENCIA_ADOPCION).toBeGreaterThan(45);
    expect(enPausa(publicacion({ renovado_en: haceDias(46) }), AHORA)).toBe(false);
  });
});

describe('enPausa — los casos que NO se archivan', () => {
  it('la que ya encontró familia nunca queda "en pausa"', () => {
    // Está cerrada con su final feliz, no archivada por abandono: decirle "en
    // pausa" al refugio sería pedirle que reactive algo que ya salió bien.
    expect(
      enPausa(
        publicacion({ renovado_en: haceDias(500), adoptada_en: haceDias(300) }),
        AHORA,
      ),
    ).toBe(false);
  });

  it('sin la columna (migración sin aplicar) NADA está en pausa, por vieja que sea', () => {
    // La RPC vieja no filtra por vigencia: la publicación SIGUE en el feed.
    // Decir "en pausa" acá sería mentirle al dueño y mandarlo a reactivar algo
    // que no está apagado (y el update fallaría, porque la columna no existe).
    expect(enPausa({ creado_en: haceDias(900), adoptada_en: null }, AHORA)).toBe(false);
  });

  it('con renovado_en null cae a creado_en y sí puede pausarse', () => {
    expect(
      enPausa({ creado_en: haceDias(900), renovado_en: null, adoptada_en: null }, AHORA),
    ).toBe(true);
  });
});
