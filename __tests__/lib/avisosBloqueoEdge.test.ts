import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de las dos Edge Functions que despachan avisos.
//
// `index.ts` de una Edge Function no se puede importar desde jest (usa
// `Deno.serve` y especificadores `jsr:`), asi que la unica forma de cubrir estas
// reglas sin desplegar es leer el archivo. Es poco, pero es exactamente lo que
// hacia falta: la logica PURA de targeting ya tiene tests (notifyTargets), y lo
// que se rompio historicamente fue el cableado — que la Edge Function ni
// siquiera consultara los bloqueos.
const FN = join(__dirname, '..', '..', 'supabase', 'functions');
const notifs = readFileSync(join(FN, 'send-notifications', 'index.ts'), 'utf8');
const push = readFileSync(join(FN, 'send-push', 'index.ts'), 'utf8');

describe('send-notifications consulta los bloqueos del actor', () => {
  it('lee la tabla `bloqueos` en las DOS direcciones respecto del actor', () => {
    expect(notifs).toContain(".from('bloqueos')");
    expect(notifs).toContain("select('bloqueador, bloqueado')");
    expect(notifs).toMatch(/bloqueador\.eq\.\$\{actorId\},bloqueado\.eq\.\$\{actorId\}/);
  });

  it('pasa `bloqueadosConActor` en TODOS los contextos que arma', () => {
    // `armarContexto` tiene tres caminos de retorno (collar, busqueda guardada,
    // y el generico por reporte). Si uno se olvida, ese tipo de aviso sigue
    // llegandole a un bloqueado y nadie se entera.
    const retornos = notifs.match(/return \{ duenoPetId[^}]*\}/g) ?? [];
    expect(retornos.length).toBe(3);
    for (const r of retornos) expect(r).toContain('bloqueadosConActor');
  });

  it('degrada a lista vacia (no revienta la cola) si no hay actor o la tabla falta', () => {
    const i = notifs.indexOf('async function bloqueadosConElActor');
    expect(i).toBeGreaterThanOrEqual(0);
    const cuerpo = notifs.slice(i, notifs.indexOf('async function armarContexto'));
    expect(cuerpo).toContain('if (!actorId) return [];');
    expect(cuerpo).toContain('return [];');
    expect(cuerpo).toContain('catch');
  });
});

describe('send-push no despierta el telefono de quien te bloqueo', () => {
  it('pregunta por el bloqueo con la RPC de un solo parametro, con el JWT del llamador', () => {
    expect(push).toContain("callerClient.rpc('hay_bloqueo_con'");
    expect(push).toContain('p_otro: toUserId');
  });

  it('el chequeo va ANTES de leer los push_tokens del destinatario', () => {
    expect(push.indexOf("hay_bloqueo_con")).toBeLessThan(push.indexOf(".from('push_tokens')"));
  });

  it('responde neutro (200, enviados: 0) y NUNCA con un error que confirme el bloqueo', () => {
    const i = push.indexOf('hayBloqueo === true');
    expect(i).toBeGreaterThanOrEqual(0);
    const bloque = push.slice(i, i + 400);
    expect(bloque).toContain('ok: true, enviados: 0');
    expect(bloque).toContain('status: 200');
    // Ni 403 ni ningun texto que diga "bloqueo" en la respuesta al cliente.
    expect(bloque).not.toContain('403');
    expect(bloque).not.toMatch(/error:\s*'[^']*[Bb]loque/);
  });
});
