import {
  etiquetaInstitucion,
  etiquetaVerificada,
  iconoInstitucion,
  institucionDe,
  TIPOS_INSTITUCION,
  type TipoInstitucion,
} from '../../src/lib/institucion';

// CUENTAS INSTITUCIONALES — el portero de la insignia (migración 0057).
//
// Una insignia que dice "verificada" sin que nadie haya verificado nada es
// PEOR que no tener insignia: es la app poniéndole su firma a un desconocido.
// Por eso el único dato que la habilita es `institucion_verificada_en`, que
// solo puede escribir un admin (RPC `institucion_otorgar`, security definer).
// Nada de lo que el usuario puede escribir en su propio perfil la enciende.
//
// Y como la migración 0057 puede no estar aplicada todavía, la fila que llega
// puede no traer NINGUNA de estas columnas. Eso tiene que dar "no es una
// institución", no reventar y no dibujar media insignia.

describe('institucionDe — solo la verificación de un admin enciende la insignia', () => {
  const COMPLETA = {
    institucion_tipo: 'veterinaria',
    institucion_nombre: 'Vet Ñuñoa',
    institucion_comuna: 'Ñuñoa',
    institucion_contacto: '+56 9 1234 5678',
    institucion_verificada_en: '2026-08-01T10:00:00Z',
  };

  it('una institución verificada y completa se reconoce', () => {
    expect(institucionDe(COMPLETA)).toEqual({
      tipo: 'veterinaria',
      nombre: 'Vet Ñuñoa',
      comuna: 'Ñuñoa',
      contacto: '+56 9 1234 5678',
    });
  });

  it('SIN fecha de verificación no hay insignia, aunque el resto esté completo', () => {
    // Este es el caso que importa: si mañana alguien abriera por error el
    // permiso de escritura de `institucion_tipo`/`institucion_nombre` (hoy
    // cerrado por el `revoke update` de la 0057), cualquiera se pondría
    // "Municipalidad de Ñuñoa". La fecha la escribe SOLO un admin.
    expect(institucionDe({ ...COMPLETA, institucion_verificada_en: null })).toBeNull();
    expect(institucionDe({ ...COMPLETA, institucion_verificada_en: '' })).toBeNull();
    expect(institucionDe({ ...COMPLETA, institucion_verificada_en: '   ' })).toBeNull();
  });

  it('un tipo que no está en la lista no se muestra', () => {
    // "Municipalidad de Ñuñoa" escrito en el campo `tipo` no puede dibujar una
    // insignia con un texto que no controlamos nosotros.
    expect(institucionDe({ ...COMPLETA, institucion_tipo: 'municipalidad' })).toBeNull();
    expect(institucionDe({ ...COMPLETA, institucion_tipo: null })).toBeNull();
    expect(institucionDe({ ...COMPLETA, institucion_tipo: 'MUNICIPIO' })).toBeNull();
  });

  it('sin nombre público no hay insignia (una insignia anónima no dice nada)', () => {
    expect(institucionDe({ ...COMPLETA, institucion_nombre: '' })).toBeNull();
    expect(institucionDe({ ...COMPLETA, institucion_nombre: '   ' })).toBeNull();
    expect(institucionDe({ ...COMPLETA, institucion_nombre: null })).toBeNull();
  });

  it('la 0057 sin aplicar (fila sin ninguna columna) da null, no una excepción', () => {
    // La app sube antes que la migración. En esa ventana la fila llega tal cual
    // estaba y ni siquiera trae las claves.
    expect(institucionDe({ id: 'u1', nombre: 'Pablo' })).toBeNull();
    expect(institucionDe(null)).toBeNull();
    expect(institucionDe(undefined)).toBeNull();
  });

  it('comuna y contacto son opcionales y se normalizan a null si vienen vacíos', () => {
    const i = institucionDe({
      ...COMPLETA,
      institucion_comuna: '   ',
      institucion_contacto: undefined,
    });
    expect(i).toEqual({ tipo: 'veterinaria', nombre: 'Vet Ñuñoa', comuna: null, contacto: null });
  });

  it('recorta los espacios del nombre y de la comuna', () => {
    const i = institucionDe({
      ...COMPLETA,
      institucion_nombre: '  Refugio Los Andes  ',
      institucion_comuna: '  Maipú ',
      institucion_tipo: 'refugio',
    });
    expect(i!.nombre).toBe('Refugio Los Andes');
    expect(i!.comuna).toBe('Maipú');
  });

  it('los tres tipos del check de la 0057 pasan', () => {
    for (const tipo of TIPOS_INSTITUCION) {
      expect(institucionDe({ ...COMPLETA, institucion_tipo: tipo })!.tipo).toBe(tipo);
    }
    expect(TIPOS_INSTITUCION).toEqual(['veterinaria', 'refugio', 'municipio']);
  });
});

describe('etiquetas — el género tiene que concordar', () => {
  // "Refugio verificada" en la ficha de un refugio es de esas cosas chicas que
  // hacen que una institución no confíe en la herramienta. Son tres strings:
  // no hay excusa para que estén mal.
  it('cada tipo tiene su etiqueta en castellano', () => {
    expect(etiquetaInstitucion('veterinaria')).toBe('Veterinaria');
    expect(etiquetaInstitucion('refugio')).toBe('Refugio');
    expect(etiquetaInstitucion('municipio')).toBe('Municipalidad');
  });

  it('la insignia concuerda en género', () => {
    expect(etiquetaVerificada('veterinaria')).toBe('Veterinaria verificada');
    expect(etiquetaVerificada('refugio')).toBe('Refugio verificado');
    expect(etiquetaVerificada('municipio')).toBe('Municipalidad verificada');
  });

  it('ninguna etiqueta queda vacía ni repetida entre tipos', () => {
    const etiquetas = TIPOS_INSTITUCION.map((t) => etiquetaInstitucion(t));
    expect(etiquetas.every((e) => e.trim().length > 0)).toBe(true);
    expect(new Set(etiquetas).size).toBe(TIPOS_INSTITUCION.length);
  });

  it('cada tipo tiene un ícono de línea distinto (regla visual: nada de emojis)', () => {
    const iconos = TIPOS_INSTITUCION.map((t) => iconoInstitucion(t));
    expect(new Set(iconos).size).toBe(TIPOS_INSTITUCION.length);
    for (const icono of iconos) {
      expect(icono).toMatch(/-outline$/);
    }
  });

  it('un tipo desconocido no rompe la pantalla', () => {
    // Defensa en profundidad: `institucionDe` ya no deja pasar un tipo inválido,
    // pero estas dos funciones también las llama el panel de admin con lo que
    // haya en la base.
    expect(etiquetaInstitucion('marciano' as TipoInstitucion)).toBe('Institución');
    expect(iconoInstitucion('marciano' as TipoInstitucion)).toBe('business-outline');
  });
});
