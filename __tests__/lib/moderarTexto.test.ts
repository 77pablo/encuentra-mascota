import { moderarTextoReporte } from '../../src/lib/moderarTexto';

// El filtro es a propósito CONSERVADOR: su trabajo es frenar lo que las tiendas
// consideran objetable (odio, sexual explícito) y la venta de animales que los
// Términos prohíben — sin bloquear a alguien angustiado publicando de buena fe.
// Estos tests fijan justamente esa frontera: lo legítimo pasa, lo objetable no,
// y las subcadenas inocentes no caen (problema Scunthorpe).

describe('moderarTextoReporte — deja pasar lo legítimo', () => {
  it('una descripción real de mascota perdida pasa', () => {
    expect(
      moderarTextoReporte({
        nombre: 'Pelusa',
        raza: 'Quiltro',
        descripcion:
          'Perrita café con manchas blancas, collar rojo, muy asustadiza. Se perdió cerca de la plaza.',
        recompensa: 'Recompensa a quien la encuentre',
      }),
    ).toEqual({ ok: true });
  });

  it('campos vacíos o ausentes pasan', () => {
    expect(moderarTextoReporte({})).toEqual({ ok: true });
    expect(moderarTextoReporte({ descripcion: '' })).toEqual({ ok: true });
  });

  it('garabatos coloquiales chilenos NO se bloquean (no son "objetables")', () => {
    // El usuario decidió a propósito no filtrar el registro coloquial: bloquearlo
    // frustraría gente de buena fe y no es lo que exige Apple.
    expect(moderarTextoReporte({ descripcion: 'El weón que se la llevó, culiao' }).ok).toBe(true);
  });

  it('subcadenas inocentes NO se bloquean (Scunthorpe)', () => {
    // Palabras normales que CONTIENEN una subcadena de la lista no deben caer,
    // porque el match es por palabra completa. Ej: "concentrado" contiene "cono",
    // "escoba" contiene una subcadena de garabato, etc.
    expect(moderarTextoReporte({ descripcion: 'Come concentrado y toma agua' }).ok).toBe(true);
    expect(moderarTextoReporte({ descripcion: 'Le gusta barrer con la escoba' }).ok).toBe(true);
    expect(moderarTextoReporte({ descripcion: 'Perro negro de raza labrador' }).ok).toBe(true);
  });
});

describe('moderarTextoReporte — bloquea odio y sexual', () => {
  it('un insulto discriminatorio bloquea con el motivo de odio', () => {
    const r = moderarTextoReporte({ descripcion: 'ojalá se lo lleve un maricón de mierda' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/ofensivos o discriminatorios/i);
  });

  it('contenido sexual explícito bloquea con su motivo', () => {
    const r = moderarTextoReporte({ descripcion: 'busco pareja para tener sexo, mira mi pene' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/sexual/i);
  });

  it('normaliza acentos y mayúsculas antes de comparar', () => {
    // Escrito con mayúsculas y tildes: igual debe caer.
    const r = moderarTextoReporte({ nombre: 'MARICÓN' });
    expect(r.ok).toBe(false);
  });
});

describe('moderarTextoReporte — venta de animales (co-ocurrencia)', () => {
  it('vender un animal bloquea', () => {
    const r = moderarTextoReporte({
      descripcion: 'Vendo cachorros de raza pura, excelente precio',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/ventas de animales/i);
  });

  it('"se venden gatitos" bloquea', () => {
    expect(moderarTextoReporte({ descripcion: 'se venden gatitos hermosos' }).ok).toBe(false);
  });

  it('"vendí mi casa" NO cae en venta (falta el término de animal)', () => {
    expect(moderarTextoReporte({ descripcion: 'Se perdió cuando vendí mi casa y me mudé' }).ok).toBe(
      true,
    );
  });

  it('mencionar "precio" sin venta de animal NO bloquea', () => {
    expect(
      moderarTextoReporte({ recompensa: 'Recompensa: no tiene precio para nosotros' }).ok,
    ).toBe(true);
  });
});
