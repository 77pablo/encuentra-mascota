import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la 0057 — CUENTAS INSTITUCIONALES.
//
// Que agrega la migracion: un perfil puede ser una organizacion (veterinaria /
// refugio / municipio) con nombre publico, comuna y contacto. Y sobre todo:
// QUIEN PUEDE DECIR QUE ALGUIEN ES UNA INSTITUCION NO ES EL PROPIO USUARIO.
//
// EL HALLAZGO QUE OBLIGO A ESTA MIGRACION A HACER MAS DE LO PEDIDO:
// la 0018 cerro el SELECT de `profiles` por columna y dejo escrito "`update` no
// se toca". Con el grant por defecto de Supabase (`grant all on all tables ...
// to authenticated`) y una policy de UPDATE que solo mira `auth.uid() = id`,
// cualquier persona con cuenta podia escribir CUALQUIER columna de SU fila. Eso
// incluye `es_admin` (0036) y `suspendido_en` (0036): un `update profiles set
// es_admin = true` desde el cliente se convertia en el panel de moderacion
// completo. Agregar `institucion_verificada_en` sin cerrar eso habria sido
// regalar la insignia de "Municipalidad de Ñuñoa" a quien la pidiera.
//
// Por eso la 0057 hace `revoke update` y vuelve a conceder SOLO las columnas
// que el dueño edita de verdad. Los tests de abajo miran esa lista.
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

// Normalizado a LF: sin .gitattributes y con core.autocrlf=true un checkout
// limpio trae CRLF y cualquier comparacion multilinea se rompe para todos menos
// para quien escribio el archivo (ya paso en `legales.test.js`, en la 0052 y en
// la 0053).
const leer = (f: string) => readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
const sql57 = leer('0057_cuentas_institucionales.sql');
const sql52 = leer('0052_adopcion_paridad.sql');
const sql36c = leer('0036c_mi_perfil_es_admin.sql');

// Sin comentarios: todo lo que sigue habla del CODIGO, no de la prosa. Sin esto
// un test pasaria porque la palabra aparece en un comentario explicando que NO
// hay que hacerla.
const sinComentarios = (s: string) => s.replace(/--[^\n]*/g, '');
const codigo57 = sinComentarios(sql57);
const codigo52 = sinComentarios(sql52);
const codigo36c = sinComentarios(sql36c);

/** Las columnas de un `grant <verbo> (a, b, c) on public.profiles`. */
function columnasDelGrant(codigo: string, verbo: 'select' | 'update'): string[][] {
  const re = new RegExp(`grant\\s+${verbo}\\s*\\(([^)]*)\\)\\s*\\n?\\s*on\\s+public\\.profiles`, 'gi');
  const out: string[][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) {
    out.push(m[1].split(',').map((c) => c.trim()).filter(Boolean));
  }
  return out;
}

/** El cuerpo de un `create [or replace] function public.<nombre>` hasta el `$$;`. */
function cuerpoDeFuncion(codigo: string, nombre: string): string | null {
  const i = codigo.search(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${nombre}\\b`));
  if (i === -1) return null;
  const fin = codigo.indexOf('$$;', i);
  return codigo.slice(i, fin === -1 ? codigo.length : fin + 3);
}

/** La expresion de vigencia que use un archivo, normalizada a un solo espacio. */
function vigenciaDe(codigo: string): string | null {
  const m = codigo.match(
    /coalesce\(\s*\w+\.renovado_en\s*,\s*\w+\.creado_en\s*\)\s*>=\s*now\(\)\s*-\s*interval\s*'[^']+'/,
  );
  return m ? m[0].replace(/\s+/g, ' ').replace(/\b\w+\./g, '') : null;
}

describe('los parsers encuentran lo que dicen buscar (si no, todo pasa por vacio)', () => {
  it('lee grants por columna sobre profiles', () => {
    expect(columnasDelGrant(codigo57, 'update').length).toBeGreaterThan(0);
    expect(columnasDelGrant(codigo57, 'select').length).toBeGreaterThan(0);
  });

  it('lee el cuerpo de las funciones que la migracion recrea', () => {
    expect(cuerpoDeFuncion(codigo57, 'perfil_publico')).not.toBeNull();
    expect(cuerpoDeFuncion(codigo57, 'mi_perfil')).not.toBeNull();
    expect(cuerpoDeFuncion(codigo57, 'institucion_otorgar')).not.toBeNull();
    expect(cuerpoDeFuncion(codigo57, 'no_existe_esta_funcion')).toBeNull();
  });

  it('las dos migraciones con vigencia tienen su expresion', () => {
    expect(vigenciaDe(codigo57)).not.toBeNull();
    expect(vigenciaDe(codigo52)).not.toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// EL NUCLEO: nadie se otorga a si mismo la insignia.
// ───────────────────────────────────────────────────────────────────────────
describe('el usuario NO puede marcarse a si mismo como institucion', () => {
  it('la migracion revoca el UPDATE ancho sobre profiles', () => {
    // Con el grant por defecto de Supabase, `authenticated` podia escribir
    // cualquier columna de su propia fila. Sin este revoke, todo lo demas
    // (RPCs con es_admin(), checks) es decorativo: alcanza un update directo.
    expect(codigo57).toMatch(
      /revoke\s+update\s+on\s+public\.profiles\s+from\s+public,\s*anon,\s*authenticated/i,
    );
  });

  it('el grant de update que vuelve a poner NO incluye ninguna columna de institucion', () => {
    const grants = columnasDelGrant(codigo57, 'update');
    expect(grants.length).toBe(1);
    const columnas = grants[0];
    expect(columnas.filter((c) => c.startsWith('institucion_'))).toEqual([]);
  });

  it('tampoco devuelve es_admin ni suspendido_en (el agujero viejo se cierra de paso)', () => {
    const columnas = columnasDelGrant(codigo57, 'update')[0];
    expect(columnas).not.toContain('es_admin');
    expect(columnas).not.toContain('suspendido_en');
    expect(columnas).not.toContain('eliminado_en');
    expect(columnas).not.toContain('id');
  });

  it('pero el dueño sigue pudiendo editar SU perfil (si no, rompimos la app)', () => {
    // Estas cuatro son exactamente las que manda `updateMyProfile`
    // (src/services/profile.ts). Un revoke sin este grant deja la edicion de
    // perfil rota y en silencio: PostgREST devuelve 42501, no una pantalla rota.
    const columnas = columnasDelGrant(codigo57, 'update')[0];
    for (const c of ['nombre', 'foto_perfil', 'telefono', 'red_social']) {
      expect(columnas).toContain(c);
    }
  });

  it('otorgar la insignia pasa por es_admin(), igual que la moderacion (0040)', () => {
    const cuerpo = cuerpoDeFuncion(codigo57, 'institucion_otorgar')!;
    expect(cuerpo).toContain('security definer');
    expect(cuerpo).toMatch(/if\s+not\s+public\.es_admin\(\)\s+then\s+raise\s+exception/i);
  });

  it('revocarla tambien es solo de admin', () => {
    const cuerpo = cuerpoDeFuncion(codigo57, 'institucion_revocar')!;
    expect(cuerpo).toContain('security definer');
    expect(cuerpo).toMatch(/if\s+not\s+public\.es_admin\(\)\s+then\s+raise\s+exception/i);
  });

  it('ninguna de las dos RPC queda al alcance de anon', () => {
    expect(codigo57).toMatch(
      /revoke all on function public\.institucion_otorgar\([^)]*\) from public, anon;/,
    );
    expect(codigo57).toMatch(
      /revoke all on function public\.institucion_revocar\([^)]*\) from public, anon;/,
    );
  });

  it('las RPC fijan search_path (definer sin search_path es escalada de privilegios)', () => {
    for (const f of ['institucion_otorgar', 'institucion_revocar']) {
      expect(cuerpoDeFuncion(codigo57, f)!).toContain('set search_path = public, pg_temp');
    }
  });
});

describe('la base tampoco deja una institucion a medio escribir', () => {
  it('el tipo esta limitado a los tres valores que conoce la app', () => {
    // Los mismos tres de `TIPOS_INSTITUCION` en src/lib/institucion.ts.
    const m = /check\s*\(\s*institucion_tipo is null or institucion_tipo in \(([^)]*)\)/i.exec(codigo57);
    expect(m).not.toBeNull();
    const valores = m![1].split(',').map((v) => v.trim().replace(/'/g, ''));
    expect(valores.sort()).toEqual(['municipio', 'refugio', 'veterinaria']);
  });

  it('no se puede quedar verificada sin tipo ni sin nombre publico', () => {
    // Una insignia verificada sin nombre no dice nada, y sin tipo la app no
    // sabe que dibujar. El check lo impide desde la base, no solo desde el
    // cliente (que es lo unico que un municipio no controla).
    const m = /check\s*\(\s*\n?\s*institucion_verificada_en is null([\s\S]*?)\);/i.exec(codigo57);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('institucion_tipo is not null');
    expect(m![1]).toContain('institucion_nombre');
  });

  it('los constraints se re-crean idempotentes (no existe `add constraint if not exists`)', () => {
    // Postgres no tiene `add constraint if not exists`: sin el drop previo la
    // migracion revienta al segundo `supabase db push`.
    for (const nombre of ['profiles_institucion_tipo_valido', 'profiles_institucion_completa']) {
      expect(codigo57).toContain(`drop constraint if exists ${nombre}`);
      expect(codigo57).toContain(`add constraint ${nombre}`);
    }
  });

  it('las columnas se agregan con `if not exists`', () => {
    for (const col of [
      'institucion_tipo',
      'institucion_nombre',
      'institucion_comuna',
      'institucion_contacto',
      'institucion_verificada_en',
      'institucion_verificada_por',
    ]) {
      expect(codigo57).toContain(`add column if not exists ${col}`);
    }
  });
});

describe('la 0018 avisa: una columna nueva de profiles NO se lee sola', () => {
  // "este esquema de permisos es fail-closed. El `grant select` es una lista
  // explicita de columnas, asi que una columna nueva NO queda legible por
  // herencia ni por defecto." Si se olvida, la app falla EN SILENCIO.
  const grants = columnasDelGrant(codigo57, 'select');

  it('lo publico de la institucion se concede a anon y a authenticated', () => {
    expect(grants.length).toBe(1);
    for (const col of [
      'institucion_tipo',
      'institucion_nombre',
      'institucion_comuna',
      'institucion_contacto',
      'institucion_verificada_en',
    ]) {
      expect(grants[0]).toContain(col);
    }
    const idx = codigo57.indexOf('grant select');
    expect(codigo57.slice(idx, idx + 400)).toMatch(/on public\.profiles to anon, authenticated/);
  });

  it('quien la verifico NO es publico (es un dato interno de moderacion)', () => {
    expect(grants[0]).not.toContain('institucion_verificada_por');
  });

  it('el grant nuevo no reabre telefono, es_admin ni suspendido_en', () => {
    // El `grant select` de la 0018 es aditivo por columna: agregar una linea no
    // pisa la anterior, pero meter `telefono` aca reabriria la fuga que cerro
    // esa migracion.
    for (const col of ['telefono', 'es_admin', 'suspendido_en', 'fecha_nacimiento']) {
      expect(grants[0]).not.toContain(col);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// RECREAR FUNCIONES: partir SIEMPRE de la version mas nueva.
// ───────────────────────────────────────────────────────────────────────────
describe('perfil_publico se recrea desde la 0053, sin perder nada', () => {
  const cuerpo = cuerpoDeFuncion(codigo57, 'perfil_publico')!;

  it('cambia el tipo de retorno, asi que hace falta drop (create or replace no puede)', () => {
    expect(codigo57).toContain('drop function if exists public.perfil_publico(uuid);');
    expect(codigo57).toMatch(/create function public\.perfil_publico\(p_user_id uuid\)/);
  });

  it('conserva las CUATRO cuentas de siempre', () => {
    // Recrear una funcion y perder de paso una columna es como se revierten
    // arreglos sin que nadie se entere (paso con `buscar_reportes`).
    for (const trozo of ['reencuentros bigint', 'reportes bigint', 'aportes bigint', 'adopciones bigint']) {
      expect(cuerpo).toContain(trozo);
    }
    expect(cuerpo).toContain('pe.reunida_en is not null');
    expect(cuerpo).toContain('public.sightings');
    expect(cuerpo).toContain('public.pet_tips');
  });

  it('conserva la vigencia de la 0053 IDENTICA a la del feed (0052)', () => {
    // El mismo test que traia el guardrail de la 0053, movido acá porque la
    // definicion viva de `perfil_publico` ahora la escribe ESTA migracion. Si
    // alguien cambia el intervalo del feed y se olvida del perfil, un refugio
    // vuelve a mostrar "40 · En adopcion" con el feed vacio.
    expect(vigenciaDe(cuerpo)).toBe(vigenciaDe(codigo52));
  });

  it('la cuenta de adopciones sigue filtrando activo, oculto y adoptada', () => {
    const cuenta = cuerpo.slice(cuerpo.indexOf('from public.adoptions ad'));
    expect(cuenta).toContain('ad.activo = true');
    expect(cuenta).toContain('ad.oculto = false');
    expect(cuenta).toContain('ad.adoptada_en is null');
  });

  it('sigue sin exponer las cuentas eliminadas', () => {
    expect(cuerpo).toContain('p.eliminado_en is null');
  });

  it('suma lo publico de la institucion y se puede seguir leyendo sin cuenta', () => {
    for (const col of [
      'institucion_tipo text',
      'institucion_nombre text',
      'institucion_comuna text',
      'institucion_contacto text',
      'institucion_verificada_en timestamptz',
    ]) {
      expect(cuerpo).toContain(col);
    }
    // El perfil publico es PUBLICO: si se pierde este grant tras el drop, un
    // invitado deja de ver el perfil de la veterinaria.
    expect(codigo57).toContain('grant execute on function public.perfil_publico(uuid) to anon;');
    expect(codigo57).toContain('grant execute on function public.perfil_publico(uuid) to authenticated;');
  });
});

describe('mi_perfil se recrea desde la 0036c, sin perder nada', () => {
  const cuerpo = cuerpoDeFuncion(codigo57, 'mi_perfil')!;

  it('conserva TODAS las columnas de la version mas nueva (0036c)', () => {
    // La 0036c documenta el peligro: recrear con la firma vieja del brief
    // habria borrado `fecha_nacimiento` en silencio. Este test no escribe la
    // lista a mano: la SACA de la 0036c y exige que ninguna se caiga.
    const firma = /returns table \(([\s\S]*?)\)\s*\nlanguage/.exec(codigo36c);
    expect(firma).not.toBeNull();
    const columnas = firma![1]
      .split(',')
      .map((c) => c.trim().split(/\s+/)[0])
      .filter(Boolean);
    expect(columnas).toContain('fecha_nacimiento');
    expect(columnas).toContain('es_admin');
    expect(columnas.length).toBeGreaterThanOrEqual(8);
    for (const col of columnas) {
      expect(cuerpo).toContain(col);
    }
  });

  it('cambia el tipo de retorno: drop antes de crear', () => {
    expect(codigo57).toContain('drop function if exists public.mi_perfil();');
  });

  it('el dueño ve su estado institucional, pero mi_perfil sigue cerrada a anon', () => {
    expect(cuerpo).toContain('institucion_tipo');
    expect(cuerpo).toContain('institucion_verificada_en');
    expect(codigo57).toContain('revoke all on function public.mi_perfil() from public, anon;');
    expect(codigo57).toContain('grant execute on function public.mi_perfil() to authenticated;');
  });
});

describe('la migracion es segura de aplicar', () => {
  it('no borra ni pisa datos', () => {
    expect(codigo57).not.toMatch(/\bdelete from\b/i);
    expect(codigo57).not.toMatch(/\bdrop table\b/i);
    expect(codigo57).not.toMatch(/\bdrop column\b/i);
    // El unico `update public.profiles` que puede haber esta DENTRO de las dos
    // RPC de admin, nunca suelto en el cuerpo de la migracion.
    const sueltos = codigo57
      .split(/create\s+(?:or\s+replace\s+)?function/)
      .slice(0, 1)
      .join('');
    expect(sueltos).not.toMatch(/\bupdate public\./i);
  });

  it('no toca las policies de RLS de profiles', () => {
    // El cierre es por GRANTS de columna, no por policy: tocar la policy de
    // update de la 0001 arrastraria efectos que nadie pidio.
    expect(codigo57).not.toMatch(/create policy[\s\S]*on public\.profiles/i);
    expect(codigo57).not.toMatch(/drop policy[\s\S]*on public\.profiles/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Este guardrail viaja SIEMPRE con la migracion mas nueva del repo. Su gracia
// es ponerse rojo cuando aparece otra sin que nadie revise el orden de
// aplicacion. Si se agrega una 0058, hay que MOVERLO (no duplicarlo): en la
// tanda 10, tres agentes lo copiaron a la vez y quedaron tres copias afirmando
// numeros distintos, dos de ellas rojas para siempre. Venia de
// `__tests__/db/migracion0053.test.ts`, donde quedo un comentario.
// ───────────────────────────────────────────────────────────────────────────
describe('0057 es la ultima migracion del repo', () => {
  it('no hay ninguna migracion con numero mayor', () => {
    const numeros = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .filter((n) => !Number.isNaN(n));
    expect(Math.max(...numeros)).toBe(57);
  });
});
