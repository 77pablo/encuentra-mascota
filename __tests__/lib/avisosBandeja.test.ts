import { contarSinLeer, textoDeAviso, type Aviso } from '../../src/lib/avisosBandeja';

// LA PARTE PURA DE LA BANDEJA: como se lee un aviso y cuantos hay sin leer.
//
// Vive aparte de la pantalla a proposito: el texto de un aviso es lo unico que
// la persona lee cuando el correo y el push no llegaron, asi que tiene que
// poder probarse sin montar React ni tocar la red. Y `contarSinLeer` decide el
// numero del badge, que es lo que hace que alguien entre a mirar.

const base = (extra: Partial<Aviso> = {}): Aviso => ({
  id: 'a1',
  tipo: 'avistamiento',
  pet_id: 'p1',
  datos: {},
  creado_en: '2026-08-01T10:00:00Z',
  ...extra,
});

describe('textoDeAviso: cada tipo se lee como algo que le pasa a TU mascota', () => {
  it('avistamiento: alguien la vio', () => {
    const t = textoDeAviso(base({ tipo: 'avistamiento' }));
    expect(t.titulo).toBe('Alguien la vio');
  });

  it('pista: muestra el extracto que dejaron', () => {
    const t = textoDeAviso(base({ tipo: 'pista', datos: { extracto: 'andaba por la plaza' } }));
    expect(t.titulo).toBe('Te dejaron una pista');
    expect(t.detalle).toContain('andaba por la plaza');
  });

  it('coincidencia sobre una ENCONTRADA habla de una encontrada', () => {
    const t = textoDeAviso(base({ tipo: 'coincidencia', datos: { match_estado: 'encontrada' } }));
    expect(t.detalle).toContain('encontrada');
    expect(t.detalle).not.toContain('perdida');
  });

  it('coincidencia sobre una PERDIDA habla de una perdida', () => {
    // El mismo tipo de evento con el texto invertido: si la funcion devolviera
    // siempre lo mismo, uno de los dos casos mentiria.
    const t = textoDeAviso(base({ tipo: 'coincidencia', datos: { match_estado: 'perdida' } }));
    expect(t.detalle).toContain('perdida');
    expect(t.detalle).not.toContain('encontrada');
  });

  it('escaneo de collar: dice el nombre de la mascota de la placa', () => {
    const t = textoDeAviso(
      base({ tipo: 'escaneo_collar', pet_id: null, datos: { nombre_mascota: 'Pelusa' } }),
    );
    expect(t.titulo).toContain('Pelusa');
  });

  it('escaneo de collar sin nombre guardado no escribe "undefined"', () => {
    const t = textoDeAviso(base({ tipo: 'escaneo_collar', pet_id: null, datos: {} }));
    expect(t.titulo).not.toMatch(/undefined|null/);
    expect(t.titulo.length).toBeGreaterThan(5);
  });

  it('busqueda guardada: dice la comuna donde apareció', () => {
    const t = textoDeAviso(
      base({ tipo: 'busqueda_guardada', datos: { comuna: 'Ñuñoa', estado: 'encontrada' } }),
    );
    expect(t.detalle).toContain('Ñuñoa');
  });

  it('un tipo que esta app todavia no conoce NO se traga el aviso', () => {
    // Otra tarea de esta misma tanda agrega 'avistamiento_anonimo', y la Edge
    // Function puede sumar tipos sin que se toque el cliente. Un `undefined` o
    // una fila en blanco haria desaparecer justo el aviso nuevo.
    const t = textoDeAviso(base({ tipo: 'un_tipo_que_no_existe_todavia' }));
    expect(t.titulo.length).toBeGreaterThan(5);
    expect(t.titulo).not.toMatch(/undefined|null/);
  });

  it('nunca celebra ni grita: quien lee acaba de perder a su animal', () => {
    const tipos = ['avistamiento', 'pista', 'coincidencia', 'escaneo_collar', 'busqueda_guardada'];
    const textos = tipos.map((tipo) => textoDeAviso(base({ tipo })));
    for (const t of textos) {
      expect({ tipo: t.titulo, exclama: `${t.titulo} ${t.detalle ?? ''}`.includes('!') }).toEqual({
        tipo: t.titulo,
        exclama: false,
      });
    }
  });

  it('un extracto larguisimo no rompe la tarjeta', () => {
    const t = textoDeAviso(base({ tipo: 'pista', datos: { extracto: 'x'.repeat(4000) } }));
    expect((t.detalle ?? '').length).toBeLessThanOrEqual(200);
  });

  it('el detalle nunca es una cadena vacia (seria una linea en blanco)', () => {
    const t = textoDeAviso(base({ tipo: 'pista', datos: { extracto: '   ' } }));
    expect(t.detalle === '' || t.detalle === '   ').toBe(false);
  });
});

describe('contarSinLeer: el numero del badge', () => {
  const avisos = [
    base({ id: '1', creado_en: '2026-08-01T12:00:00Z' }),
    base({ id: '2', creado_en: '2026-08-01T10:00:00Z' }),
    base({ id: '3', creado_en: '2026-07-30T10:00:00Z' }),
  ];

  it('sin ninguna visita guardada, todos cuentan como nuevos', () => {
    expect(contarSinLeer(avisos, null)).toBe(3);
  });

  it('cuenta solo los posteriores a la ultima visita', () => {
    expect(contarSinLeer(avisos, '2026-08-01T11:00:00Z')).toBe(1);
  });

  it('el aviso exactamente igual a la ultima visita ya fue visto', () => {
    // Si contara el `=`, el badge se quedaria pegado en 1 para siempre despues
    // de entrar a la pantalla.
    expect(contarSinLeer(avisos, '2026-08-01T12:00:00Z')).toBe(0);
  });

  it('una ultima visita ilegible se trata como "nunca entro" (no como cero)', () => {
    // Degradar hacia "hay algo para mirar" y no hacia "no hay nada": un badge de
    // menos es un aviso que nadie ve nunca.
    expect(contarSinLeer(avisos, 'no-es-una-fecha')).toBe(3);
  });

  it('sin avisos, cero', () => {
    expect(contarSinLeer([], null)).toBe(0);
  });
});
