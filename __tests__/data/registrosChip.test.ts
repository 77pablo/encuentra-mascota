import {
  BUSQUEDAS_LECTOR,
  DOMINIOS_CAIDOS,
  QUE_ES_UN_CHIP,
  REGISTROS_CAIDOS,
  REGISTROS_CONSULTABLES,
  URL_CONSULTA_NACIONAL,
  URL_REGISTRO_NACIONAL,
  dominioDe,
  hayQuePegarElNumeroAMano,
  urlDeConsulta,
  type RegistroChip,
} from '../../src/data/registrosChip';
import { urlBusquedaMapa } from '../../src/lib/mapas';

// El dato chileno de microchip está partido en varios registros privados y NO
// hay consulta unificada. Este archivo fija lo que se VERIFICÓ a mano el
// 1-ago-2026 (ver el comentario de registrosChip.ts) y, sobre todo, impide que
// vuelva a colarse un enlace a los que ya no existen: un link roto en el flujo
// de "encontré una mascota" es peor que no tener el link.

describe('registros que SÍ se pueden consultar', () => {
  it('hay más de uno (si quedara vacío la pantalla no sirve de nada)', () => {
    expect(REGISTROS_CONSULTABLES.length).toBeGreaterThanOrEqual(2);
  });

  it('cada uno tiene id único, nombre, detalle y una URL https', () => {
    const ids = REGISTROS_CONSULTABLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of REGISTROS_CONSULTABLES) {
      expect(r.id).toMatch(/^[a-z0-9-]+$/);
      expect(r.nombre.trim().length).toBeGreaterThan(0);
      expect(r.detalle.trim().length).toBeGreaterThan(0);
      // https y no http: `registratumascota.cl/` (la raíz) redirige a HTTP, por
      // eso se enlaza la página interna directamente.
      expect(r.url).toMatch(/^https:\/\//);
    }
  });

  it('el Registro Nacional (Ley 21.020) está, y apunta a la página de consultas', () => {
    const oficiales = REGISTROS_CONSULTABLES.filter((r) => r.oficial);
    expect(oficiales.length).toBe(1);
    expect(oficiales[0].url).toBe(URL_CONSULTA_NACIONAL);
    expect(URL_CONSULTA_NACIONAL).toBe('https://registratumascota.cl/consultas.xhtml');
  });

  it('ninguno usa un dominio de los que ya no funcionan', () => {
    const caidos = REGISTROS_CONSULTABLES.filter((r) => DOMINIOS_CAIDOS.includes(dominioDe(r.url)));
    expect(caidos.map((r) => r.url)).toEqual([]);
  });
});

describe('registros CAÍDOS (se muestran como advertencia, no como enlace)', () => {
  it('están los cuatro que se verificaron muertos y cada uno explica por qué', () => {
    expect(REGISTROS_CAIDOS.length).toBeGreaterThanOrEqual(4);
    for (const r of REGISTROS_CAIDOS) {
      expect(r.dominio).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
      expect(r.motivo.trim().length).toBeGreaterThan(0);
    }
  });

  it('no traen URL: la pantalla no puede ofrecer abrirlos ni por accidente', () => {
    for (const r of REGISTROS_CAIDOS) {
      expect((r as unknown as Record<string, unknown>).url).toBeUndefined();
      // Y tampoco un `https://…` escondido en el motivo.
      expect(r.motivo).not.toMatch(/https?:\/\//);
    }
  });

  it('DOMINIOS_CAIDOS se DERIVA de la lista (no es una segunda lista a mano)', () => {
    expect([...DOMINIOS_CAIDOS].sort()).toEqual(REGISTROS_CAIDOS.map((r) => r.dominio).sort());
  });
});

describe('el número de chip no se puede pre-cargar en ningún registro', () => {
  it('hoy hay que pegarlo a mano, y la pantalla lo sabe', () => {
    // Verificado: el Registro Nacional es JSF/PrimeFaces (POST con ViewState y
    // CSRF) y datapet es un formulario Wix. Ninguno acepta el número por URL.
    expect(REGISTROS_CONSULTABLES.every((r) => r.aceptaNumeroEnLaUrl === false)).toBe(true);
    expect(hayQuePegarElNumeroAMano()).toBe(true);
  });

  it('urlDeConsulta devuelve la URL pelada cuando el registro no acepta el número', () => {
    for (const r of REGISTROS_CONSULTABLES) {
      expect(urlDeConsulta(r, '990000000000001')).toBe(r.url);
    }
  });

  it('urlDeConsulta SÍ arma la búsqueda si algún día un registro la acepte', () => {
    // No es un test del dato de hoy: es del comportamiento que va a hacer falta
    // el día que alguno publique un GET. Si `urlDeConsulta` ignorara el flag,
    // este caso lo caza.
    const futuro: RegistroChip = {
      id: 'futuro',
      nombre: 'Registro con GET',
      detalle: 'x',
      url: 'https://ejemplo.cl/infochip/',
      oficial: false,
      aceptaNumeroEnLaUrl: true,
      paramNumero: 'c',
    };
    expect(urlDeConsulta(futuro, '990 000/1')).toBe(
      `https://ejemplo.cl/infochip/?c=${encodeURIComponent('990 000/1')}`,
    );
    expect(hayQuePegarElNumeroAMano([futuro])).toBe(false);
  });

  it('sin número, urlDeConsulta nunca cuelga un parámetro vacío', () => {
    const futuro: RegistroChip = {
      id: 'futuro',
      nombre: 'x',
      detalle: 'x',
      url: 'https://ejemplo.cl/infochip/',
      oficial: false,
      aceptaNumeroEnLaUrl: true,
      paramNumero: 'c',
    };
    expect(urlDeConsulta(futuro)).toBe('https://ejemplo.cl/infochip/');
    expect(urlDeConsulta(futuro, '   ')).toBe('https://ejemplo.cl/infochip/');
  });
});

describe('inscribir el chip: el empujón', () => {
  it('el enlace del Registro Nacional es https y no es la raíz (que degrada a http)', () => {
    expect(URL_REGISTRO_NACIONAL).toMatch(/^https:\/\/registratumascota\.cl\/\w+/);
  });
});

describe('dónde leer el chip: se reusa el mapa del teléfono, no una lista curada', () => {
  it('cada búsqueda tiene texto y arma una URL de mapa válida', () => {
    expect(BUSQUEDAS_LECTOR.length).toBeGreaterThanOrEqual(2);
    for (const b of BUSQUEDAS_LECTOR) {
      expect(b.titulo.trim().length).toBeGreaterThan(0);
      expect(b.sub.trim().length).toBeGreaterThan(0);
      expect(b.query.trim().length).toBeGreaterThan(0);
      const u = urlBusquedaMapa(b.query);
      expect(u).toContain(encodeURIComponent(b.query));
      expect(u).not.toContain(' ');
    }
  });

  it('las búsquedas son genéricas: sin números de calle ni horarios que caducan', () => {
    for (const b of BUSQUEDAS_LECTOR) {
      expect(b.query).not.toMatch(/\d{2,}/);
    }
  });
});

describe('qué es un chip, en 20 segundos', () => {
  const texto = QUE_ES_UN_CHIP.join(' ').toLowerCase();

  it('desarma la confusión más común: NO es un GPS', () => {
    expect(texto).toContain('gps');
    expect(texto).toMatch(/no es un gps|no es gps/);
  });

  it('dice que leerlo es gratis y que no hace falta ser cliente', () => {
    expect(texto).toContain('gratis');
  });

  it('son frases cortas de verdad (esto se lee de pie, en la calle)', () => {
    expect(QUE_ES_UN_CHIP.length).toBeGreaterThanOrEqual(3);
    for (const linea of QUE_ES_UN_CHIP) {
      expect(linea.trim().length).toBeGreaterThan(0);
      expect(linea.length).toBeLessThanOrEqual(200);
    }
  });
});

describe('dominioDe', () => {
  it('saca el host sin www y en minúsculas', () => {
    expect(dominioDe('https://www.DataPet.cl/busca-un-chip')).toBe('datapet.cl');
    expect(dominioDe('https://registratumascota.cl/consultas.xhtml')).toBe('registratumascota.cl');
  });

  it('no revienta con basura', () => {
    expect(dominioDe('no soy una url')).toBe('');
  });
});
