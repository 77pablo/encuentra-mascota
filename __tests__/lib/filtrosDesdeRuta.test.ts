import { filtrosDesdeRuta } from '../../src/lib/petFilters';
import { ACCESOS_INICIO } from '../../src/screens/HomeScreen';

// LOS ACCESOS DE INICIO TIENEN QUE LLEGAR A EXPLORAR CON ALGO PUESTO.
//
// Los cuatro chips de Inicio ("Cerca de ti", "Perros", "Gatos", "Perdidos")
// hacían `navigate('Explorar')` PELADO: viajabas a una pantalla idéntica a la
// que ves entrando por la pestaña, sin nada filtrado. Eran decoración con
// aspecto de control.
//
// Este archivo prueba las dos mitades y, sobre todo, que se toquen:
//   · `filtrosDesdeRuta` (el que LEE los parámetros, en src/lib) traduce lo que
//     llega por la ruta a un juego completo de filtros;
//   · `ACCESOS_INICIO` (el que los ESCRIBE, en la pantalla) manda parámetros
//     que ese lector reconoce.
// Si alguien agrega un chip con una clave inventada, el último bloque se pone
// rojo aunque los dos archivos compilen y la app no se queje de nada.

// `@expo/vector-icons` arrastra `expo-font` → `expo-asset`, que no está en el
// node_modules compartido. Acá solo se importa una constante de la pantalla,
// pero el módulo se evalúa entero igual.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

describe('filtrosDesdeRuta', () => {
  it('sin parámetros no hay nada que aplicar', () => {
    expect(filtrosDesdeRuta(undefined)).toBeNull();
    expect(filtrosDesdeRuta(null)).toBeNull();
    expect(filtrosDesdeRuta({})).toBeNull();
  });

  it('ignora parámetros que no son de filtro (no pisa lo que el usuario eligió)', () => {
    // A Explorar también le pueden llegar parámetros de navegación ajenos;
    // ninguno debe resetear los filtros que la persona ya tenía puestos.
    expect(filtrosDesdeRuta({ id: 'p-123' })).toBeNull();
  });

  it('una comuna llega como comuna y sin arrastrar nada más', () => {
    expect(filtrosDesdeRuta({ comuna: 'Ñuñoa' })).toEqual({
      comuna: 'Ñuñoa',
      especie: null,
      estado: null,
      cerca: false,
    });
  });

  it('recorta la comuna y descarta la vacía', () => {
    expect(filtrosDesdeRuta({ comuna: '  Ñuñoa  ' })?.comuna).toBe('Ñuñoa');
    expect(filtrosDesdeRuta({ comuna: '   ' })).toBeNull();
  });

  it('acepta las especies y los estados que la búsqueda entiende', () => {
    expect(filtrosDesdeRuta({ especie: 'perro' })?.especie).toBe('perro');
    expect(filtrosDesdeRuta({ especie: 'gato' })?.especie).toBe('gato');
    expect(filtrosDesdeRuta({ especie: 'otro' })?.especie).toBe('otro');
    expect(filtrosDesdeRuta({ estado: 'perdida' })?.estado).toBe('perdida');
    expect(filtrosDesdeRuta({ estado: 'encontrada' })?.estado).toBe('encontrada');
  });

  it('un valor que la base no conoce no se cuela hasta la consulta', () => {
    // Los parámetros de ruta pueden venir de un deep link, o sea de fuera.
    expect(filtrosDesdeRuta({ especie: 'dinosaurio' })).toBeNull();
    expect(filtrosDesdeRuta({ estado: 'perdido' })).toBeNull(); // el estado es 'perdida'
    expect(filtrosDesdeRuta({ especie: 7 })).toBeNull();
  });

  it('"cerca" solo cuenta si es exactamente true', () => {
    expect(filtrosDesdeRuta({ cerca: true })?.cerca).toBe(true);
    expect(filtrosDesdeRuta({ cerca: 'si' })).toBeNull();
    expect(filtrosDesdeRuta({ cerca: false })).toBeNull();
  });

  it('un acceso deja SOLO su filtro: los demás vuelven a neutro', () => {
    // Tocar "Gatos" después de "Perdidos" tiene que dar gatos, no
    // gatos-perdidos: el chip promete un filtro, no una suma de los anteriores.
    const f = filtrosDesdeRuta({ especie: 'gato' });
    expect(f).toEqual({ comuna: null, especie: 'gato', estado: null, cerca: false });
  });
});

describe('los accesos de Inicio no viajan vacíos', () => {
  it('hay accesos que revisar (si esto falla, el resto no mira nada)', () => {
    expect(ACCESOS_INICIO.length).toBeGreaterThan(0);
  });

  it.each(ACCESOS_INICIO.map((a) => [a.label, a.params] as const))(
    'el acceso «%s» llega a Explorar con un filtro que Explorar entiende',
    (label, params) => {
      const f = filtrosDesdeRuta(params);
      // Si esto es null, el chip navega y no pasa nada: exactamente el bug.
      const puesto = f
        ? [f.comuna, f.especie, f.estado, f.cerca || null].filter(Boolean).length
        : 0;
      expect(`${label}: ${puesto} filtro(s)`).not.toBe(`${label}: 0 filtro(s)`);
    },
  );
});
