import fs from 'fs';
import path from 'path';

// OTORGAR LA INSIGNIA INSTITUCIONAL — el camino documentado tiene que funcionar.
//
// La 0057 se escribió diciendo "corre la RPC desde el SQL editor", y eso NO
// funciona: `institucion_otorgar` es `security definer` con un gate
// `es_admin()`, que resuelve con `auth.uid()`; en el SQL Editor no hay JWT, la
// consulta entra como `postgres` y `auth.uid()` es NULL. O sea que el gate corta
// siempre y la insignia se desplegaba MUERTA: nadie podía otorgarla nunca, y por
// lo tanto nadie iba a ver ni la insignia ni la carga en lote.
//
// Es la misma trampa que ya había costado una verificación de la 0045, y estaba
// anotada. Por eso el arreglo no es solo escribir el runbook: es dejar un test
// que se ponga rojo si alguien vuelve a documentar el camino que no anda, o si
// la firma de la RPC cambia y el runbook queda desfasado.

const raiz = path.join(__dirname, '..', '..');
const runbook = fs.readFileSync(path.join(raiz, 'docs', 'otorgar-insignia-institucional.sql'), 'utf8');
const migracion = fs.readFileSync(
  path.join(raiz, 'supabase', 'migrations', '0057_cuentas_institucionales.sql'),
  'utf8',
);

// El runbook empieza mostrando la llamada que NO funciona (para que se
// reconozca el error), así que buscar `institucion_otorgar(` a secas encuentra
// el contraejemplo. Todo lo que sigue se ancla DESPUÉS de la impersonación.
const desdeElSombrero = runbook.slice(runbook.indexOf('set local request.jwt.claims'));

describe('el runbook para otorgar la insignia', () => {
  it('los dos archivos se leyeron de verdad (si no, todo pasa por vacío)', () => {
    expect(runbook.length).toBeGreaterThan(500);
    expect(migracion).toContain('create or replace function public.institucion_otorgar');
  });

  it('se pone el sombrero del admin: sin eso el gate corta y no se hace nada', () => {
    expect(runbook).toMatch(/set\s+local\s+role\s+authenticated/i);
    expect(runbook).toMatch(/set\s+local\s+request\.jwt\.claims/i);
    // Dentro de una transacción: `set local` fuera de una no dura nada.
    expect(runbook).toMatch(/begin;/i);
    expect(runbook).toMatch(/commit;/i);
  });

  it('incluye el control de que el sombrero quedó puesto ANTES de llamar', () => {
    // Sin este control, un uuid mal pegado da "no autorizado" y es fácil leerlo
    // como "la función está rota" en vez de "no soy admin".
    const control = desdeElSombrero.indexOf('es_admin()');
    const llamada = desdeElSombrero.indexOf('institucion_otorgar(');
    expect(control).toBeGreaterThan(-1);
    expect(llamada).toBeGreaterThan(-1);
    expect(control).toBeLessThan(llamada);
  });

  it('NO le enseña a nadie a escribir las columnas a mano', () => {
    // El `update` crudo funciona (el owner ignora grants y RLS) y es justo lo
    // que la migración quiere evitar: saltea la validación del tipo, la
    // normalización del nombre, y deja `institucion_verificada_por` en NULL,
    // que era todo el punto de esa columna.
    expect(runbook).not.toMatch(/update\s+public\.profiles\s+set\s+institucion_/i);
  });

  it('llama a la RPC con TODOS los argumentos que declara la migración', () => {
    // La lista sale de la migración, no está escrita acá: si mañana la RPC suma
    // un parámetro, este test se pone rojo en vez de dejar un runbook que borra
    // datos en silencio (`p_comuna`/`p_contacto` tienen default null y el update
    // los pisa igual, así que llamarla corta BORRA lo que no se le pasa).
    const firma = migracion.slice(
      migracion.indexOf('function public.institucion_otorgar('),
      migracion.indexOf(')', migracion.indexOf('function public.institucion_otorgar(')),
    );
    const params = [...firma.matchAll(/p_\w+/g)].map((m) => m[0]);
    expect(params.length).toBeGreaterThanOrEqual(5);

    const abre = desdeElSombrero.indexOf('institucion_otorgar(');
    const llamada = desdeElSombrero.slice(abre, desdeElSombrero.indexOf(');', abre));
    // Tantas comas de primer nivel como parámetros - 1.
    const argumentos = llamada.split('\n').filter((l) => /^\s+'/.test(l) || /::uuid/.test(l));
    expect(argumentos.length).toBe(params.length);
  });

  it('los tipos que muestra son los que la migración acepta', () => {
    const validos = [...migracion.matchAll(/p_tipo not in \(([^)]+)\)/g)][0]?.[1] ?? '';
    const tipos = [...validos.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(tipos.length).toBe(3);
    for (const tipo of tipos) expect(runbook).toContain(tipo);
  });

  it('la migración manda a leer el runbook en vez de repetir la receta que no anda', () => {
    expect(migracion).toContain('docs/otorgar-insignia-institucional.sql');
    // Y ya no afirma que alcance con correrla desde el SQL editor.
    expect(migracion).not.toMatch(/corre la RPC desde el SQL editor/i);
  });

  it('también documenta cómo QUITARLA', () => {
    // Suspender una cuenta no le saca la insignia: si moderación suspende a un
    // "refugio" que era una estafa, sus fichas siguen firmadas como verificadas.
    expect(runbook).toContain('institucion_revocar(');
  });
});
