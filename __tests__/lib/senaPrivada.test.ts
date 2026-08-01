import {
  MAX_SENA,
  listaDeSenas,
  normalizarSenas,
  validarSenas,
} from '../../src/lib/senaPrivada';

// LA SEÑA SECRETA DE VERIFICACIÓN.
//
// Una o dos señas particulares que NO se publican: una cicatriz en la panza, una
// oreja mordida, que se sienta cuando le decís "cama". Sirven para una sola cosa:
// cuando alguien llama diciendo "la tengo", se le pide que las describa. El que
// de verdad la tiene enfrente las ve; el que llamó por la foto del aviso, no.
//
// Acá va solo la parte pura (normalizar y validar lo que se escribe). Que no se
// filtren es asunto de `__tests__/db/senasPrivadas.test.ts`.

describe('normalizarSenas', () => {
  it('recorta los espacios y convierte lo vacío en null', () => {
    expect(normalizarSenas('  cicatriz en la panza  ', '   ')).toEqual({
      sena1: 'cicatriz en la panza',
      sena2: null,
    });
  });

  it('sin nada escrito devuelve las dos en null', () => {
    expect(normalizarSenas('', '')).toEqual({ sena1: null, sena2: null });
    expect(normalizarSenas(null, undefined)).toEqual({ sena1: null, sena2: null });
  });

  it('compacta: si solo se llenó la segunda, pasa a ser la primera', () => {
    // Si no se compactara, quedaría una fila con sena1 null y sena2 con texto, y
    // toda la UI tendría que andar preguntando cuál de las dos existe.
    expect(normalizarSenas('  ', 'responde a "Pelusa"')).toEqual({
      sena1: 'responde a "Pelusa"',
      sena2: null,
    });
  });

  it('guarda las dos cuando hay dos', () => {
    expect(normalizarSenas('oreja izquierda mordida', 'cojea de la pata trasera')).toEqual({
      sena1: 'oreja izquierda mordida',
      sena2: 'cojea de la pata trasera',
    });
  });
});

describe('listaDeSenas', () => {
  it('devuelve solo las que existen, en orden', () => {
    expect(listaDeSenas({ sena1: 'a', sena2: 'b' })).toEqual(['a', 'b']);
    expect(listaDeSenas({ sena1: 'a', sena2: null })).toEqual(['a']);
    expect(listaDeSenas({ sena1: null, sena2: null })).toEqual([]);
    expect(listaDeSenas(null)).toEqual([]);
  });
});

describe('validarSenas', () => {
  it('acepta lo normal', () => {
    expect(validarSenas('cicatriz en la panza', '')).toEqual({ ok: true });
    expect(validarSenas('', '')).toEqual({ ok: true });
  });

  it('rechaza una seña más larga que el tope de la base', () => {
    const largo = 'x'.repeat(MAX_SENA + 1);
    const r = validarSenas(largo, '');
    expect(r.ok).toBe(false);
    // El motivo se le muestra a la persona: tiene que estar en castellano y
    // decir el número, no ser un código.
    expect(r.ok === false && r.motivo).toContain(String(MAX_SENA));
  });

  it('también mira la segunda seña, no solo la primera', () => {
    expect(validarSenas('corta', 'y'.repeat(MAX_SENA + 1)).ok).toBe(false);
  });

  it('el tope justo entra', () => {
    expect(validarSenas('z'.repeat(MAX_SENA), '').ok).toBe(true);
  });
});
