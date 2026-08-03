import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de `send-notifications/index.ts` (revisión adversarial
// final de la tanda 13, F4/F5/F7). Mismo criterio que
// __tests__/lib/avisosBloqueoEdge.test.ts: `index.ts` usa `Deno.serve` y
// especificadores `jsr:`, así que no se puede importar desde jest.
const RAIZ = join(__dirname, '..', '..');
const codigo = readFileSync(
  join(RAIZ, 'supabase', 'functions', 'send-notifications', 'index.ts'),
  'utf8',
);

describe('F7: el despachador no consume mudo un tipo que no conoce', () => {
  it('guarda los 9 tipos conocidos en un set y el guardián es lo PRIMERO que corre en procesar', () => {
    const i = codigo.indexOf('async function procesar');
    expect(i).toBeGreaterThanOrEqual(0);
    // El guardián va antes que la primera rama de tipo (reencuentro_seguimiento).
    const guardia = codigo.indexOf('TIPOS_CONOCIDOS.has(ev.tipo)');
    const primeraRama = codigo.indexOf("ev.tipo === 'reencuentro_seguimiento'", i);
    expect(guardia).toBeGreaterThan(i);
    expect(guardia).toBeLessThan(primeraRama);
  });

  it('el set trae EXACTAMENTE los 9 tipos del union de EventoRow', () => {
    // Arranca DESPUÉS de `Set<EventoRow['tipo']>([`: ese genérico también trae
    // una cadena entre comillas ('tipo') y contaría de más si se incluyera.
    const inicio = codigo.indexOf(">([", codigo.indexOf('const TIPOS_CONOCIDOS')) + 3;
    const fin = codigo.indexOf(']);', inicio);
    const bloque = codigo.slice(inicio, fin);
    const tipos = [
      'reporte_nuevo', 'avistamiento', 'pista', 'coincidencia', 'escaneo_collar',
      'busqueda_guardada', 'avistamiento_anonimo', 'denuncia_nueva', 'reencuentro_seguimiento',
    ];
    for (const t of tipos) expect(bloque).toContain(`'${t}'`);
    // Ni uno de más: el union de EventoRow trae exactamente estos 9.
    const contados = bloque.match(/'[a-z_]+'/g) ?? [];
    expect(contados.length).toBe(tipos.length);
  });

  it('un tipo desconocido tira, no se marca enviado ni cae al fallthrough de pista', () => {
    const guardia = codigo.slice(
      codigo.indexOf('TIPOS_CONOCIDOS.has(ev.tipo)') - 20,
      codigo.indexOf('TIPOS_CONOCIDOS.has(ev.tipo)') + 120,
    );
    expect(guardia).toMatch(/if \(!TIPOS_CONOCIDOS\.has\(ev\.tipo\)\) \{/);
    expect(guardia).toMatch(/throw new Error\(`tipo de evento desconocido: \$\{ev\.tipo\}`\)/);
  });
});

describe('F4: reencuentro_seguimiento sin proveedor de correo queda pendiente sin gastar intento', () => {
  it('corta ANTES de intentar enviarCorreo cuando no hay Brevo ni Resend', () => {
    const i = codigo.indexOf("ev.tipo === 'reencuentro_seguimiento'");
    const j = codigo.indexOf('return SIN_PROVEEDOR', i);
    const k = codigo.indexOf('await enviarCorreo(correo, titulo, cuerpo', i);
    expect(j).toBeGreaterThan(i);
    // El corte va ANTES del envío real, no después.
    expect(j).toBeLessThan(k);
    expect(codigo.slice(i, j)).toContain('!hayProveedorDeCorreo()');
  });

  it('el loop principal, al ver SIN_PROVEEDOR, no toca la fila (ni estado ni intentos)', () => {
    const i = codigo.indexOf('if (resultado === SIN_PROVEEDOR) continue;');
    expect(i).toBeGreaterThanOrEqual(0);
    // Entre el `await procesar` y el `continue` no debe haber ningún `.update(`
    // sobre la fila: el evento queda exactamente como estaba.
    const inicioTry = codigo.lastIndexOf('const resultado = await procesar', i);
    expect(codigo.slice(inicioTry, i)).not.toContain('.update(');
  });

  it('si el proveedor SÍ está configurado y el envío falla, sigue el camino de siempre (throw -> catch -> intentos/error)', () => {
    // `enviarCorreo` sigue lanzando cuando el proveedor devuelve un error de
    // verdad (Brevo/Resend respondieron mal): eso no lo tocamos.
    expect(codigo).toMatch(/throw new Error\(`Brevo respondió \$\{res\.status\}/);
    expect(codigo).toMatch(/throw new Error\(`Resend respondió \$\{res\.status\}/);
  });
});

describe('F5: el correo del seguidor se borra de `datos` al llegar a un estado final', () => {
  it('se borra cuando el evento pasa a enviado (camino feliz)', () => {
    const i = codigo.indexOf("estado: 'enviado',");
    const bloque = codigo.slice(i, codigo.indexOf('.eq(', i));
    expect(bloque).toContain("ev.tipo === 'reencuentro_seguimiento' ? { datos: sinCorreo(ev.datos) }");
  });

  it('se borra cuando se agotan los intentos (pasa a error), pero NO mientras quedan reintentos', () => {
    const i = codigo.indexOf('const agotado = intentos >= MAX_INTENTOS;');
    expect(i).toBeGreaterThanOrEqual(0);
    const bloque = codigo.slice(i, codigo.indexOf('.eq(', i));
    expect(bloque).toContain("estado: agotado ? 'error' : 'pendiente'");
    expect(bloque).toContain("ev.tipo === 'reencuentro_seguimiento' && agotado ? { datos: sinCorreo(ev.datos) }");
  });

  it('se borra también en el abandono temprano (evento que ya venía con 3+ intentos)', () => {
    const i = codigo.indexOf('if (ev.intentos >= MAX_INTENTOS) {');
    const bloque = codigo.slice(i, codigo.indexOf('continue;', i));
    expect(bloque).toContain("estado: 'error'");
    expect(bloque).toContain("ev.tipo === 'reencuentro_seguimiento' ? { datos: sinCorreo(ev.datos) }");
  });

  it('sinCorreo() deja las demás claves de datos intactas, solo saca `correo`', () => {
    const i = codigo.indexOf('function sinCorreo');
    const fin = codigo.indexOf('\n}', i);
    const cuerpo = codigo.slice(i, fin);
    expect(cuerpo).toMatch(/const \{ correo: _correo, \.\.\.resto \} = datos/);
    expect(cuerpo).toContain('return resto;');
  });
});
