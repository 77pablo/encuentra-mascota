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

  it('pista y avistamiento NO repiten el texto guardado en la cola', () => {
    // Este test decía lo contrario ("muestra el extracto que dejaron"), y ese
    // comportamiento resucitaba contenido borrado por moderación.
    //
    // Moderar una pista BORRA la fila (`moderar_retirar`, 0040), pero
    // `notification_events` no tiene FK hacia `pet_tips`, así que el extracto
    // sobrevive al borrado. La bandeja lo seguía mostrando indefinidamente
    // —incluida la estafa que motivó la denuncia—, y la purga de la 0023 solo
    // limpia los eventos 'enviado', o sea que con el correo caído no se van
    // nunca. La bandeja es un PUNTERO a la ficha, no una copia del contenido.
    const t = textoDeAviso(base({ tipo: 'pista', datos: { extracto: 'andaba por la plaza' } }));
    expect(t.titulo).toBe('Te dejaron una pista');
    expect(t.detalle).not.toContain('andaba por la plaza');
    expect(t.detalle).toContain('Abrilo');

    const v = textoDeAviso(base({ tipo: 'avistamiento', datos: { nota: 'lo vi en la esquina' } }));
    expect(v.detalle).not.toContain('lo vi en la esquina');
  });

  it('el aviso ANÓNIMO sí muestra el texto, pero marcado como de desconocido', () => {
    // Acá no hay fila en `sightings` a la que remitir: la nota es lo único que
    // existe. Pero la escribió alguien SIN CUENTA, así que la pantalla le pone
    // la advertencia antiestafa. Sin esto se leía igual que un aviso nuestro:
    // "Tenés una novedad · «la tengo, transferime $50.000»".
    const t = textoDeAviso(
      base({ tipo: 'avistamiento_anonimo', datos: { nota: 'la vi en la plaza' } }),
    );
    expect(t.titulo).toBe('Alguien dice que la vio');
    expect(t.detalle).toContain('la vi en la plaza');
    expect(t.deDesconocido).toBe(true);
  });

  it('el aviso anónimo con foto expone el path para que la pantalla la baje', () => {
    // D5, sobre el bucket privado de la D4: `datos.foto` es el path dentro de
    // `avisos-anonimos` (`<pet_id>/<archivo>`), y la pantalla del dueño
    // (`FotoAvisoAnonimo`) lo usa para pedir una URL firmada.
    const t = textoDeAviso(
      base({ tipo: 'avistamiento_anonimo', datos: { nota: 'la vi en la plaza', foto: 'p/abc.jpg' } }),
    );
    expect(t.fotoPath).toBe('p/abc.jpg');
  });

  it('sin foto en los datos, fotoPath queda undefined: no hay nada que bajar', () => {
    const t = textoDeAviso(base({ tipo: 'avistamiento_anonimo', datos: { nota: 'la vi' } }));
    expect(t.fotoPath).toBeUndefined();
  });

  it('otros tipos de aviso nunca traen fotoPath, aunque datos.foto exista', () => {
    // La foto anónima es SOLO del aviso anónimo: un `foto` suelto en el
    // `datos` de cualquier otro tipo no tiene por qué significar lo mismo.
    const t = textoDeAviso(base({ tipo: 'avistamiento', datos: { foto: 'algo' } }));
    expect(t.fotoPath).toBeUndefined();
  });

  it('los avisos normales NO se marcan como de desconocido', () => {
    for (const tipo of ['avistamiento', 'pista', 'coincidencia', 'escaneo_collar']) {
      expect(textoDeAviso(base({ tipo })).deDesconocido).toBeFalsy();
    }
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

  it('denuncia_nueva se presenta como puntero a la bandeja, con el motivo de lista cerrada', () => {
    const t = textoDeAviso(
      base({
        id: '1',
        tipo: 'denuncia_nueva',
        pet_id: null,
        datos: { tipo_denuncia: 'reporte', motivo: 'spam' },
        creado_en: '2026-08-01T10:00:00Z',
      }),
    );
    expect(t.titulo).toBe('Entró una denuncia');
    expect(t.detalle).toContain('spam');
    expect(t.icono).toBe('shield-checkmark-outline');
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
