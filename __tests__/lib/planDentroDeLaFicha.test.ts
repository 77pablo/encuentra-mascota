import { GUIA_PERDIDA } from '../../src/data/guiaPerdida';
import { PASOS_PLAN, planDeBusqueda, PerfilBusqueda } from '../../src/lib/planBusqueda';

// EL PLAN NO PUEDE PEDIR ALGO QUE YA ESTA HECHO.
//
// `planBusqueda.ts` reusa pasos de `GUIA_PERDIDA` por id, y eso esta bien: la
// guia dice QUE hacer y el plan lo pone en el reloj. Pero los dos se leen en
// momentos distintos de la historia:
//
//   · la GUIA se lee ANTES de publicar (se entra desde Ayuda, y desde el vacio
//     "todavia no publicaste nada");
//   · el PLAN vive DENTRO de la ficha del reporte — `PetDetailScreen` lo dibuja
//     con `<PlanBusqueda pet={pet} …>`, o sea que el reporte ya existe.
//
// Con `publica-el-reporte` adentro, el primer paso de "las proximas 2 horas"
// era "Publica el reporte", con un boton "Publicar mi reporte" que abre el
// formulario VACIO. A alguien que acaba de publicar, la app le pedia publicar,
// y si tocaba el boton se llevaba un segundo reporte duplicado de la misma
// mascota. El paso sigue existiendo en la guia, que es donde si corresponde.
//
// Este archivo compara el plan CONTRA la pantalla que lo hospeda y contra la
// guia; no declara la respuesta escrita a mano.

const idsDelPlan = (perfil: PerfilBusqueda) =>
  planDeBusqueda(perfil, new Date('2026-08-01T10:00:00Z'), new Date('2026-08-01T11:00:00Z'))
    .ventanas.flatMap((v) => v.pasos)
    .map((p) => p.id);

const PERFILES: PerfilBusqueda[] = [
  { especie: 'perro' },
  { especie: 'perro', temperamento: 'sociable' },
  { especie: 'gato', ambito: 'interior' },
  { especie: 'gato', ambito: 'exterior' },
  { especie: 'otro' },
];

describe('el plan se lee DENTRO de un reporte que ya existe', () => {
  it('el paso "publica el reporte" sigue estando en la guia', () => {
    // No se borro contenido: donde corresponde, sigue. Si este test se pusiera
    // rojo, el de abajo estaria pasando por vacio.
    expect(GUIA_PERDIDA.map((p) => p.id)).toContain('publica-el-reporte');
  });

  it('ninguna especie recibe el paso de publicar', () => {
    for (const perfil of PERFILES) {
      expect({ especie: perfil.especie, pasos: idsDelPlan(perfil) }).toMatchObject({
        pasos: expect.not.arrayContaining(['publica-el-reporte']),
      });
    }
    expect(PASOS_PLAN.map((p) => p.id)).not.toContain('publica-el-reporte');
  });

  it('ningun paso del plan manda al formulario de publicar', () => {
    // La regla de fondo, no el id concreto: si mañana se reusa otro paso de la
    // guia que lleve a `Publicar`, el boton vuelve a abrir el formulario vacio
    // desde adentro de la ficha. La ruta se lee de la guia, no se escribe aca.
    const alFormulario = new Set(
      GUIA_PERDIDA.filter((p) => p.accion?.ruta === 'Publicar').map((p) => p.id),
    );
    expect(alFormulario.size).toBeGreaterThan(0); // si no, el test no cubre nada
    for (const perfil of PERFILES) {
      const rotos = idsDelPlan(perfil).filter((id) => alFormulario.has(id));
      expect({ especie: perfil.especie, rotos }).toMatchObject({ rotos: [] });
    }
  });

  it('la primera ventana no se queda vacia al sacar el paso', () => {
    // Sacar contenido puede dejar una tarjeta hueca, que es peor que el bug.
    for (const perfil of PERFILES) {
      const ahora = planDeBusqueda(
        perfil,
        new Date('2026-08-01T10:00:00Z'),
        new Date('2026-08-01T10:30:00Z'),
      ).ventanas.find((v) => v.id === 'ahora')!;
      expect({ especie: perfil.especie, n: ahora.pasos.length }).toMatchObject({
        n: expect.any(Number),
      });
      expect(ahora.pasos.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('el plan reusa TODA la guia menos los dos pasos que no aplican adentro', () => {
    // El cambio saca UN paso, no la conexion con la guia. Se comprueba con la
    // lista entera, no con un "al menos cuatro": asi, si mañana se cae otro
    // paso de la guia sin querer, esto se pone rojo en vez de seguir pasando.
    //
    // Los dos que quedan afuera, y por que:
    //   · `publica-el-reporte` → el reporte YA existe cuando se lee el plan;
    //   · `respira-y-busca-cerca` → el plan tiene sus propias versiones de eso,
    //     por especie y con reloj (`punto-exacto-de-perdida`, `no-lo-persigas`,
    //     `gato-esta-a-cien-metros`…). Reusarlo seria decir dos veces lo mismo,
    //     una de ellas peor.
    const reusados = PASOS_PLAN.filter((p) => p.desdeGuia).map((p) => p.id);
    const afuera = GUIA_PERDIDA.map((p) => p.id).filter((id) => !reusados.includes(id));
    expect(afuera.sort()).toEqual(['publica-el-reporte', 'respira-y-busca-cerca']);
  });
});
