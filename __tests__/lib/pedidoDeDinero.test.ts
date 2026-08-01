import { hayPedidoDeDinero, pideDineroPorAdelantado } from '../../src/lib/pedidoDeDinero';

// AVISO CUANDO EN EL CHAT PIDEN PLATA POR ADELANTADO.
//
// Regla de diseño, y es la que manda sobre todo lo demás: un falso positivo
// contra un vecino honesto es PEOR que no avisar. Alguien que encontró un perro y
// escribe de buena fe no se merece que la app le sugiera al dueño que es un
// chanta. Por eso no alcanza con nombrar la plata: hace falta que la plata se
// junte con un DATO BANCARIO, con un pedido explícito de pago ANTES de la
// entrega, o con el clásico "te la mando por flete".
//
// Y el aviso que se dibuja no acusa a nadie: le recuerda al dueño la seña y el
// "en persona". Ver `AvisoDuenoChat`.

describe('NO marca a la gente honesta', () => {
  const HONESTOS = [
    'Hola! Creo que vi a tu perro en la plaza de Maipú hace un rato',
    'La tengo en mi casa, cuando quieras pasas a buscarla, vivo en Los Aromos 123',
    'No quiero recompensa, solo que vuelva con ustedes',
    'No me transfieras nada por favor, lo hago con gusto',
    'La llevé a la veterinaria porque cojeaba, está bien igual',
    'Le compré comida mientras tanto, no te preocupes por la plata',
    'Se parece mucho al de la foto, tiene el mismo collar',
    'Te mando una foto para que la veas',
    'Puedo llevártela mañana en la mañana si te queda cómodo',
    'Mi vecina la vio ayer cerca del paradero',
    // El dueño ofreció recompensa y la otra persona la acepta DESPUÉS de la
    // entrega: es un acuerdo normal entre dos personas, no una estafa.
    'Dale, nos juntamos y ahí vemos lo de la recompensa',
  ];

  it.each(HONESTOS)('«%s» no dispara el aviso', (texto) => {
    expect(pideDineroPorAdelantado(texto)).toBe(false);
  });

  it('un texto vacío o sin texto (mensaje de solo foto) no dispara nada', () => {
    expect(pideDineroPorAdelantado('')).toBe(false);
    expect(pideDineroPorAdelantado(null)).toBe(false);
    expect(pideDineroPorAdelantado(undefined)).toBe(false);
  });
});

describe('SÍ marca el patrón de la estafa documentada', () => {
  const ESTAFAS = [
    'La tengo yo, transfiéreme la recompensa por adelantado y te la llevo',
    'Te paso mi número de cuenta para que me deposites',
    'Necesito que me pagues antes de entregártela',
    'Estoy en Rancagua, te la mando por encomienda, primero me transfieres la plata del flete',
    'Mándame el dinero a mi cuenta rut y salgo para allá',
    'Necesito un adelanto en efectivo, después coordinamos',
    'Págame el transportista y mañana la tienes en tu casa',
    'Mi cuenta es de BancoEstado, deposita ahí la plata',
  ];

  it.each(ESTAFAS)('«%s» dispara el aviso', (texto) => {
    expect(pideDineroPorAdelantado(texto)).toBe(true);
  });

  it('funciona sin tildes y en mayúsculas (así se escribe en el celular)', () => {
    expect(pideDineroPorAdelantado('TRANSFIEREME LA PLATA POR ADELANTADO')).toBe(true);
    expect(pideDineroPorAdelantado('transfierme el dinero por adelantado')).toBe(true);
  });
});

describe('la negación explícita gana', () => {
  it('«no me transfieras nada por adelantado» NO es un pedido de plata', () => {
    // Alguien tranquilizando al dueño usa las mismas palabras que el estafador.
    // Sin esta red, el aviso salía justo contra quien estaba siendo honesto.
    expect(pideDineroPorAdelantado('No me transfieras nada por adelantado, la entrego y listo')).toBe(false);
    expect(pideDineroPorAdelantado('No quiero plata por adelantado, en serio')).toBe(false);
  });
});

describe('hayPedidoDeDinero — solo mira lo que escribió la OTRA persona', () => {
  const msg = (from_user: string, texto: string | null) => ({ from_user, texto }) as any;

  it('marca cuando lo escribió el otro', () => {
    const mensajes = [msg('otro', 'hola'), msg('otro', 'transfiereme la recompensa por adelantado')];
    expect(hayPedidoDeDinero(mensajes, 'yo')).toBe(true);
  });

  it('NO marca por lo que escribió uno mismo', () => {
    // El dueño escribiendo "no te voy a transferir nada por adelantado" no se
    // tiene que auto-denunciar.
    const mensajes = [msg('yo', 'te transfiero la recompensa por adelantado si quieres')];
    expect(hayPedidoDeDinero(mensajes, 'yo')).toBe(false);
  });

  it('sin mensajes, no marca', () => {
    expect(hayPedidoDeDinero([], 'yo')).toBe(false);
  });

  it('tolera mensajes de solo foto (texto null)', () => {
    expect(hayPedidoDeDinero([msg('otro', null)], 'yo')).toBe(false);
  });
});
