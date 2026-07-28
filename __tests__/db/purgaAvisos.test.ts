import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la purga de la cola de avisos (Tanda D · piezas 1 y 2a).
//
// `purgar_avisos()` es un BORRADO IRREVERSIBLE que corre solo, agendado, sin que
// nadie lo mire. En este repo ya hubo un Critical por un borrado en cascada que
// se llevo hilos de chat enteros, asi que las propiedades que lo hacen seguro no
// pueden quedar sostenidas solo por un comentario.
//
// La migracion 0023 y el job de cron NO estan aplicados desde acá (eso es un
// paso aparte, supervisado): esto no prueba la base real. Lo que prueba es que
// el SQL que se va a aplicar sigue diciendo lo que se decidio, y —lo que ningun
// archivo solo puede probar— que el despachador y la purga siguen hablando el
// mismo idioma: la purga depende de que `send-notifications` escriba
// EXACTAMENTE el estado 'enviado' y llene `procesado_en`. Si el despachador
// cambiara cualquiera de las dos cosas, la purga dejaria de borrar (o, peor,
// borraria otra cosa) sin un solo error a la vista.
const RAIZ = join(__dirname, '..', '..');
const migracion = readFileSync(
  join(RAIZ, 'supabase', 'migrations', '0023_purga_avisos.sql'),
  'utf8',
);
const cronPurga = readFileSync(join(RAIZ, 'docs', 'purga-avisos.sql'), 'utf8');
const cronDespacho = readFileSync(join(RAIZ, 'docs', 'agendar-avisos.sql'), 'utf8');
const despachador = readFileSync(
  join(RAIZ, 'supabase', 'functions', 'send-notifications', 'index.ts'),
  'utf8',
);

// Los comentarios de estos archivos explican en prosa lo mismo que se verifica
// (nombran 'error' y 'pendiente' justo para decir que NO se tocan), asi que las
// aserciones corren sobre el codigo, sin comentarios.
const sinComentariosSql = (s: string) => s.replace(/--[^\n]*/g, '');
const codigoMigracion = sinComentariosSql(migracion);
const codigoCronPurga = sinComentariosSql(cronPurga);
const codigoCronDespacho = sinComentariosSql(cronDespacho);

// Cuerpo de una funcion: desde `function public.<nombre>` hasta el `$$;`.
function bloqueFuncion(nombre: string): string {
  const inicio = codigoMigracion.indexOf(`function public.${nombre}`);
  expect(inicio).toBeGreaterThanOrEqual(0);
  const fin = codigoMigracion.indexOf('$$;', inicio);
  expect(fin).toBeGreaterThan(inicio);
  return codigoMigracion.slice(inicio, fin);
}

describe('purgar_avisos() solo se lleva lo que se decidio que se lleva', () => {
  const cuerpo = bloqueFuncion('purgar_avisos()');

  it('exige `estado = \'enviado\'` EXPLICITO, no se apoya en que procesado_en sea nulo', () => {
    // Es la defensa clave. Un `where procesado_en < ...` a secas ya excluiria a
    // los pendientes por tener procesado_en nulo, pero alcanza con que un
    // reintento futuro escriba un procesado_en provisorio para que la purga se
    // empiece a comer LA COLA VIVA.
    expect(cuerpo).toMatch(/where\s+estado\s*=\s*'enviado'/);
  });

  it('no borra las filas en `error`: son el unico registro de por que un aviso no salio', () => {
    expect(cuerpo).not.toContain("'error'");
  });

  it('no borra las filas en `pendiente`: son la cola viva', () => {
    expect(cuerpo).not.toContain("'pendiente'");
  });

  it('la ventana es de 90 dias', () => {
    expect(cuerpo).toMatch(/procesado_en\s*<\s*now\(\)\s*-\s*interval\s*'90 days'/);
  });

  it('tiene tope de 5000 por corrida', () => {
    // El `\b` no sobra: sin el, `limit 500000` tambien pasaba (comprobado
    // mutando el SQL a proposito). El tope existe para que la PRIMERA purga
    // sobre un atraso grande no se quede minutos con la tabla tomada mientras
    // los triggers de publicacion intentan insertar.
    expect(cuerpo).toMatch(/limit\s+5000\b/);
  });

  it('el unico delete de la funcion es sobre notification_events', () => {
    const deletes = cuerpo.match(/delete\s+from\s+([\w.]+)/g) ?? [];
    expect(deletes).toEqual(['delete from public.notification_events']);
  });

  it('no acepta parametros: no existe firma para pedir "borra hasta tal fecha"', () => {
    // Misma propiedad que mi_perfil() y anonimizar_mi_cuenta(). La ventana esta
    // compilada adentro; cambiarla exige una migracion, que se revisa.
    expect(codigoMigracion).toContain('function public.purgar_avisos()');
    expect(codigoMigracion).not.toMatch(/function public\.purgar_avisos\(\s*\w/);
  });

  it('es security definer con search_path fijado', () => {
    expect(cuerpo).toContain('security definer');
    expect(cuerpo).toMatch(/set search_path\s*=\s*public,\s*pg_temp/);
  });
});

describe('avisos_a_purgar() deja mirar antes de borrar, y solo mirar', () => {
  const cuerpo = bloqueFuncion('avisos_a_purgar()');

  it('no borra nada y esta marcada `stable`', () => {
    expect(cuerpo).not.toMatch(/\bdelete\b/i);
    expect(cuerpo).not.toMatch(/\bupdate\b/i);
    expect(cuerpo).toContain('stable');
  });

  it('mira EXACTAMENTE el mismo conjunto que borraria la purga', () => {
    // Si las dos condiciones se separaran, la funcion de solo lectura mentiria:
    // diria "no se va a borrar nada" y la purga se llevaria filas igual.
    const condicion = /estado\s*=\s*'enviado'\s+and\s+procesado_en\s*<\s*now\(\)\s*-\s*interval\s*'90 days'/;
    expect(cuerpo).toMatch(condicion);
    expect(bloqueFuncion('purgar_avisos()')).toMatch(condicion);
  });

  it('tampoco acepta parametros', () => {
    expect(codigoMigracion).toContain('function public.avisos_a_purgar()');
    expect(codigoMigracion).not.toMatch(/function public\.avisos_a_purgar\(\s*\w/);
  });
});

describe('ninguna de las dos la puede invocar la app', () => {
  it('revoca execute a public, anon y authenticated en las dos', () => {
    for (const fn of ['avisos_a_purgar()', 'purgar_avisos()']) {
      expect(codigoMigracion).toMatch(
        new RegExp(`revoke all on function public\\.${fn.replace(/[()]/g, '\\$&')}\\s+from public, anon, authenticated;`),
      );
    }
  });

  it('no le da execute a nadie de vuelta', () => {
    // Solo las llama el `postgres` del cron.
    expect(codigoMigracion).not.toMatch(/grant execute on function public\.(purgar_avisos|avisos_a_purgar)/);
  });
});

describe('el indice de la purga', () => {
  it('es parcial sobre procesado_en, solo para lo purgable', () => {
    expect(codigoMigracion).toMatch(
      /create index if not exists notification_events_purga_idx\s+on public\.notification_events \(procesado_en\)\s+where estado = 'enviado'/,
    );
  });
});

// ------------------------------------------------------------
// Lo que ningun archivo solo puede probar: los dos extremos.
// ------------------------------------------------------------
describe('el despachador y la purga siguen hablando el mismo idioma', () => {
  it('el despachador marca EXACTAMENTE `enviado` y llena procesado_en en el camino feliz', () => {
    // Si dejara de escribir procesado_en, esas filas quedarian con NULL y la
    // purga no las tomaria NUNCA (null < x es null): la cola volveria a crecer
    // para siempre, sin un solo error.
    expect(despachador).toMatch(
      /\.update\(\{\s*estado:\s*'enviado',\s*procesado_en:\s*new Date\(\)\.toISOString\(\)\s*\}\)/,
    );
  });

  it('el despachador sigue usando los tres estados que la purga da por sentados', () => {
    for (const estado of ['pendiente', 'enviado', 'error']) {
      expect(despachador).toContain(`'${estado}'`);
    }
  });

  it('el despachador NO borra filas de la cola: purgar es tarea de la purga', () => {
    // Meter el borrado adentro de send-notifications habria atado un borrado
    // irreversible al camino caliente de los avisos.
    const i = despachador.indexOf("from('notification_events')");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(despachador).not.toMatch(/from\('notification_events'\)[\s\S]{0,200}?\.delete\(\)/);
  });
});

describe('los dos jobs de cron estan separados y con la frecuencia decidida', () => {
  it('la purga es un job propio, semanal (domingo 04:00)', () => {
    expect(codigoCronPurga).toMatch(/cron\.schedule\(\s*'purgar-avisos',\s*'0 4 \* \* 0'/);
    expect(codigoCronPurga).toContain('select public.purgar_avisos();');
  });

  it('la purga se desagenda antes de reagendarse (reaplicar no deja dos)', () => {
    expect(codigoCronPurga).toMatch(
      /cron\.unschedule\('purgar-avisos'\)\s+where exists \(select 1 from cron\.job where jobname = 'purgar-avisos'\)/,
    );
  });

  it('el despachador corre cada 5 minutos, no cada minuto (pieza 2a)', () => {
    // '* * * * *' eran ~43.000 invocaciones al mes, casi todas con la cola
    // vacia. Un aviso atrasado no se pierde: sigue 'pendiente' hasta que
    // alguien lo procese, y eso es lo que hace seguro bajar la frecuencia.
    expect(codigoCronDespacho).toMatch(/cron\.schedule\(\s*'despachar-avisos',\s*'\*\/5 \* \* \* \*'/);
    expect(codigoCronDespacho).not.toMatch(/'\* \* \* \* \*'/);
  });

  it('el job del despachador no invoca la purga (aislamiento de fallas)', () => {
    expect(codigoCronDespacho).not.toContain('purgar_avisos');
  });
});
