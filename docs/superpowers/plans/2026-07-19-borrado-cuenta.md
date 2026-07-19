# Borrado de cuenta — plan de implementación

> **Para quien lo ejecute:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkboxes (`- [ ]`).

**Objetivo:** que una persona pueda borrar su cuenta desde la app, destruyendo sus datos personales de forma irreversible, sin destruir el contenido de terceros.

**Arquitectura:** una migración suelta la FK `profiles → auth.users` (que hoy borraría todo en cascada) y agrega una RPC `SECURITY DEFINER` sin parámetros que anonimiza al llamador en una transacción. Una Edge Function orquesta: RPC → borrar Storage → borrar el usuario de Auth (en ese orden, porque borrar Auth invalida el token). La UI gana una pantalla de confirmación y tres retoques para mostrar la lápida.

**Stack:** Expo/React Native + TypeScript, Supabase (Postgres + RLS + Storage + Edge Functions en Deno), jest.

**Spec:** `docs/superpowers/specs/2026-07-19-borrado-cuenta-design.md`

## Restricciones globales

- Todo el código, los comentarios y los mensajes de commit van **en español**. Los mensajes de commit sin tildes ni eñes (el resto del repo es así).
- Los textos de interfaz son **cálidos y humanos**, nunca corporativos ni infantiles.
- La RPC `anonimizar_mi_cuenta()` **no lleva parámetros nunca**. Saca la identidad de `auth.uid()`. Un parámetro `user_id` permitiría borrar cuentas ajenas.
- El orden RPC → Storage → `auth.admin.deleteUser` es obligatorio y no se puede reordenar.
- Ningún paso puede reportar éxito si el usuario de `auth.users` sigue vivo.
- `profiles.nombre` tiene `CHECK length(btrim(nombre)) between 1 and 60`: **no puede quedar vacío**. La lápida usa `'Cuenta eliminada'` y la UI decide qué mostrar según `eliminado_en`.
- Antes de dar por terminada cualquier tarea: `npm test` y `npx tsc --noEmit` en verde.

---

### Task 1: Migración `0017` — base de datos

**Archivos:**
- Crear: `supabase/migrations/0017_borrado_cuenta.sql`

**Interfaces:**
- Produce: la función SQL `public.anonimizar_mi_cuenta()` que devuelve filas `ruta text` (rutas de Storage a borrar, relativas al bucket `pet-photos`); la columna `profiles.eliminado_en timestamptz`; y el helper `public.ruta_storage(url text) returns text`.

- [ ] **Paso 1: Escribir la migración**

Crear `supabase/migrations/0017_borrado_cuenta.sql`:

```sql
-- ============================================================
-- BORRAR MI CUENTA (soft delete de filas + anonimizacion de datos)
--
-- Regla: lo que es solo tuyo se destruye; lo que ademas es de otro
-- sobrevive sin vos. Ver docs/superpowers/specs/2026-07-19-borrado-cuenta-design.md
-- ============================================================

-- 1. SOLTAR LA FK A auth.users
--
-- Hoy `profiles.id` referencia `auth.users(id) on delete cascade`. Mientras eso
-- exista, borrar el usuario de Auth arrastra el perfil y, en cascada, cada
-- mensaje, pista y avistamiento de esa persona. Justo lo que NO queremos: la
-- fila de `profiles` tiene que sobrevivir como lapida anonima.
alter table public.profiles drop constraint profiles_id_fkey;

-- 2. LA MARCA DE LA LAPIDA
--
-- La UI decide que mostrar mirando esta columna, no el texto del nombre:
-- en las pistas se firma "Un vecino" y en el chat "Cuenta eliminada".
alter table public.profiles add column eliminado_en timestamptz;

-- 3. HELPER: URL publica de Storage -> ruta dentro del bucket
--
-- Las fotos se guardan como URL publica completa
-- (.../storage/v1/object/public/pet-photos/<uid>/<ts>.jpg) pero la API de
-- Storage borra por ruta relativa (<uid>/<ts>.jpg).
create or replace function public.ruta_storage(url text)
returns text
language sql
immutable
as $$
  select case
    when url is null then null
    when position('/pet-photos/' in url) = 0 then null
    else substring(url from position('/pet-photos/' in url) + length('/pet-photos/'))
  end;
$$;

-- 4. LA RPC
--
-- SIN PARAMETROS A PROPOSITO. La identidad sale de auth.uid(), nunca de un
-- argumento: una firma `anonimizar_cuenta(user_id uuid)` con security definer
-- le permitiria a cualquiera borrarle la cuenta a cualquier otro.
--
-- Devuelve las rutas de Storage a borrar. Las junta DENTRO de la misma
-- transaccion en que borra las filas, asi no hay ventana para perder una foto
-- entre consultar y borrar.
create or replace function public.anonimizar_mi_cuenta()
returns table (ruta text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Hace falta la sesion abierta para borrar la cuenta'
      using errcode = '42501';
  end if;

  -- Idempotente: si ya se anonimizo, no hay nada que hacer. La Edge Function
  -- puede reintentar sin miedo si fallo en un paso posterior.
  if exists (
    select 1 from public.profiles p where p.id = uid and p.eliminado_en is not null
  ) then
    return;
  end if;

  -- Rutas de las fotos que van a quedar huerfanas: el avatar y las fotos de
  -- los reportes que estan por morir. Las fotos de avistamientos en reportes
  -- AJENOS no se tocan: esos avistamientos sobreviven anonimizados.
  return query
    select r.ruta from (
      select public.ruta_storage(p.foto_perfil) as ruta
        from public.profiles p where p.id = uid
      union all
      select public.ruta_storage(f)
        from public.pets pe, unnest(pe.fotos) as f where pe.user_id = uid
      union all
      select public.ruta_storage(pe.final_foto)
        from public.pets pe where pe.user_id = uid
    ) r
    where r.ruta is not null;

  -- Se borra de verdad: puramente personal, sin valor para terceros.
  delete from public.notification_events where actor_id = uid;
  delete from public.push_tokens       where user_id  = uid;
  delete from public.notification_prefs where user_id = uid;
  delete from public.favorites         where user_id  = uid;
  delete from public.alert_zones       where user_id  = uid; -- donde vive la persona
  -- Cascadea a sightings, pet_tips y pet_updates DE ESOS reportes (incluidos
  -- los de terceros): consecuencia aceptada de que el reporte se vaya de verdad.
  delete from public.pets              where user_id  = uid;

  -- Sobreviven apuntando a la lapida: messages (ambas direcciones), y los
  -- sightings/pet_tips que dejo en reportes AJENOS. No se tocan aca.

  update public.profiles
     set nombre       = 'Cuenta eliminada', -- el CHECK no permite vacio
         foto_perfil  = null,
         telefono     = null,
         red_social   = null,
         eliminado_en = now()
   where id = uid;

  return;
end;
$$;

-- Solo alguien con sesion puede invocarla, y solo se borra a si mismo.
revoke all on function public.anonimizar_mi_cuenta() from public, anon;
grant execute on function public.anonimizar_mi_cuenta() to authenticated;

-- 5. NO SE LE ESCRIBE A UNA CUENTA ELIMINADA
--
-- Que la UI esconda el campo de texto no alcanza: con el token en la mano se
-- puede insertar igual por la API. Esto lo corta en la base.
drop policy "enviar mensajes como yo" on public.messages;
create policy "enviar mensajes como yo"
  on public.messages for insert to authenticated
  with check (
    auth.uid() = from_user
    and not exists (
      select 1 from public.profiles p
       where p.id = messages.to_user and p.eliminado_en is not null
    )
  );
```

- [ ] **Paso 2: Aplicarla contra Supabase**

Pegar el contenido completo en el SQL Editor del proyecto `ywlrcfaybnikaurxsgtj` y ejecutar. Esperado: `Success. No rows returned`.

- [ ] **Paso 3: Verificar contra la base real que quedó bien**

En el SQL Editor:

```sql
-- La FK ya no existe (esperado: 0 filas)
select conname from pg_constraint where conname = 'profiles_id_fkey';

-- La columna existe (esperado: 1 fila, timestamptz)
select column_name, data_type from information_schema.columns
 where table_name = 'profiles' and column_name = 'eliminado_en';

-- La RPC existe y NO acepta argumentos (esperado: pronombre vacio '')
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'anonimizar_mi_cuenta';

-- El helper funciona (esperado: abc/123.jpg)
select public.ruta_storage(
  'https://x.supabase.co/storage/v1/object/public/pet-photos/abc/123.jpg');
```

Si `args` NO sale vacío, la migración está mal: la RPC no debe aceptar parámetros.

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/0017_borrado_cuenta.sql
git commit -m "feat(cuenta): migracion 0017, RPC de anonimizacion y lapida en profiles"
```

---

### Task 2: Cómo se muestra una cuenta eliminada (lógica pura, TDD)

**Archivos:**
- Modificar: `src/lib/tips.ts`
- Crear: `src/lib/cuentaEliminada.ts`
- Test: `__tests__/lib/cuentaEliminada.test.ts`, `__tests__/lib/tips.test.ts` (agregar casos)

**Interfaces:**
- Consume: nada.
- Produce: `nombreDeAutor(nombre: string | null, eliminadoEn: string | null): string` en `src/lib/cuentaEliminada.ts`, que devuelve `'Cuenta eliminada'` si `eliminadoEn` no es null. Y `firmaAutor(nombre: string | null, eliminadoEn?: string | null): string` en `src/lib/tips.ts`, que devuelve `'Un vecino'` si el autor está eliminado. `Tip` gana el campo opcional `autorEliminadoEn?: string | null`.

- [ ] **Paso 1: Escribir los tests que fallan**

Crear `__tests__/lib/cuentaEliminada.test.ts`:

```ts
import { nombreDeAutor } from '../../src/lib/cuentaEliminada';

describe('nombreDeAutor', () => {
  it('muestra el nombre cuando la cuenta esta viva', () => {
    expect(nombreDeAutor('Ana', null)).toBe('Ana');
  });

  it('dice "Cuenta eliminada" cuando la cuenta se borro', () => {
    // Aunque la lapida guarde un nombre, mandamos nosotros.
    expect(nombreDeAutor('Cuenta eliminada', '2026-07-19T00:00:00Z')).toBe('Cuenta eliminada');
    expect(nombreDeAutor('Ana', '2026-07-19T00:00:00Z')).toBe('Cuenta eliminada');
  });

  it('cae en "Usuario" cuando no hay nombre y la cuenta vive', () => {
    // Es el fallback que ya usaba listConversations.
    expect(nombreDeAutor(null, null)).toBe('Usuario');
    expect(nombreDeAutor('   ', null)).toBe('Usuario');
  });
});
```

Agregar al final de `__tests__/lib/tips.test.ts`:

```ts
import { firmaAutor } from '../../src/lib/tips';

describe('firmaAutor con cuentas eliminadas', () => {
  it('firma "Un vecino" cuando el autor borro su cuenta', () => {
    // En las pistas no interesa quien fue, interesa el dato: la pista sigue
    // sirviendole a quien busca su mascota.
    expect(firmaAutor('Cuenta eliminada', '2026-07-19T00:00:00Z')).toBe('Un vecino');
  });

  it('sigue firmando con el nombre cuando la cuenta vive', () => {
    expect(firmaAutor('Ana', null)).toBe('Ana');
  });

  it('mantiene el comportamiento viejo sin el segundo parametro', () => {
    expect(firmaAutor('Ana')).toBe('Ana');
    expect(firmaAutor(null)).toBe('Un vecino');
  });
});
```

- [ ] **Paso 2: Correr los tests y ver que fallan**

Run: `npx jest __tests__/lib/cuentaEliminada.test.ts __tests__/lib/tips.test.ts`
Esperado: FAIL — `Cannot find module '../../src/lib/cuentaEliminada'` y el caso de `firmaAutor` con dos argumentos.

- [ ] **Paso 3: Implementar**

Crear `src/lib/cuentaEliminada.ts`:

```ts
// Cómo se nombra a alguien que borró su cuenta.
//
// La lápida guarda `nombre = 'Cuenta eliminada'` porque la base no permite un
// nombre vacío, pero la decisión de qué mostrar es de la interfaz y depende del
// contexto: en el chat conviene decir "Cuenta eliminada" (explica por qué no se
// puede responder), y en las pistas "Un vecino" (ahí el dato es lo que importa,
// no quién lo dejó). Por eso mandamos siempre sobre `eliminadoEn` y nunca sobre
// el texto del nombre.

export const ETIQUETA_CUENTA_ELIMINADA = 'Cuenta eliminada';

export function nombreDeAutor(nombre: string | null, eliminadoEn: string | null): string {
  if (eliminadoEn) return ETIQUETA_CUENTA_ELIMINADA;
  const limpio = (nombre ?? '').trim();
  return limpio || 'Usuario';
}
```

Reemplazar `firmaAutor` en `src/lib/tips.ts` (lo demás del archivo queda igual):

```ts
// Cómo se firma la pista. Sin sesión no se puede leer `profiles`, así que la
// pista igual se muestra: el texto es lo que importa. Si el autor borró su
// cuenta pasa lo mismo — la pista le sigue sirviendo a quien busca su mascota.
export function firmaAutor(nombre: string | null, eliminadoEn?: string | null): string {
  if (eliminadoEn) return 'Un vecino';
  const limpio = (nombre ?? '').trim();
  return limpio || 'Un vecino';
}
```

Y agregar el campo al tipo `Tip` del mismo archivo, debajo de `autorNombre`:

```ts
  /** Fecha en que el autor borró su cuenta, si la borró. */
  autorEliminadoEn?: string | null;
```

- [ ] **Paso 4: Correr los tests y ver que pasan**

Run: `npx jest __tests__/lib/cuentaEliminada.test.ts __tests__/lib/tips.test.ts`
Esperado: PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/cuentaEliminada.ts src/lib/tips.ts __tests__/lib/cuentaEliminada.test.ts __tests__/lib/tips.test.ts
git commit -m "feat(cuenta): como se muestra el autor de una cuenta eliminada"
```

---

### Task 3: Edge Function `delete-account`

**Archivos:**
- Crear: `supabase/functions/delete-account/index.ts`

**Interfaces:**
- Consume: `cabecerasCors`, `ORIGENES_DEV` de `supabase/functions/_shared/cors.ts`; la RPC `anonimizar_mi_cuenta()` de la Task 1.
- Produce: el endpoint `POST /functions/v1/delete-account`, que responde `{ ok: true }` con 200, o `{ error: string }` con 401/405/500.

- [ ] **Paso 1: Escribir la función**

Crear `supabase/functions/delete-account/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cabecerasCors, ORIGENES_DEV } from '../_shared/cors.ts';

// BORRAR MI CUENTA
//
// Orquesta el borrado en un orden que NO se puede alterar:
//
//   1. la RPC anonimiza los datos (en una transaccion) y devuelve las fotos
//   2. se borran las fotos de Storage
//   3. RECIEN AHI se borra el usuario de auth.users
//
// El paso 3 va ultimo porque borra el token con el que estamos trabajando: si
// fuera primero, no podriamos completar nada de lo anterior.
//
// Y es el paso 3 el que hace que esto sea irreversible de verdad: lo que queda
// en la base es un uuid al azar, y el correo que lo ataba a una persona
// desaparece. Ademas libera el correo para que pueda registrarse de nuevo.

const HEADERS_BASE = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' };

function origenesPermitidos(): string[] {
  const web = Deno.env.get('EXPO_PUBLIC_WEB_URL');
  return web ? [web.replace(/\/$/, ''), ...ORIGENES_DEV] : ORIGENES_DEV;
}

Deno.serve(async (req: Request) => {
  const cors = cabecerasCors(req.headers.get('Origin'), origenesPermitidos());
  const HEADERS = { ...HEADERS_BASE, ...cors };

  // El preflight se contesta antes de tocar nada: el navegador lo manda sin
  // credenciales y el gateway lo deja pasar sin verificar el JWT.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { ...HEADERS, Allow: 'POST, OPTIONS' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Falta autenticación' }), {
      status: 401,
      headers: HEADERS,
    });
  }

  // Cliente "anon + JWT del llamador". La RPC se invoca con ESTE cliente, no
  // con service_role: adentro usa auth.uid(), asi que necesita el token real
  // de la persona. Es lo que garantiza que solo se borre a si misma.
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Falta autenticación' }), {
      status: 401,
      headers: HEADERS,
    });
  }
  const userId = userData.user.id;

  try {
    // 1. Anonimizar (transaccional). Devuelve las rutas de las fotos huerfanas.
    const { data: rutas, error: rpcError } = await callerClient.rpc('anonimizar_mi_cuenta');
    if (rpcError) throw new Error(`anonimizar_mi_cuenta fallo: ${rpcError.message}`);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 2. Borrar las fotos. Si esto falla no perdemos nada recuperable: las
    // rutas empiezan con <user_id>/, asi que siempre se pueden barrer despues.
    const paths = ((rutas ?? []) as Array<{ ruta: string }>)
      .map((r) => r.ruta)
      .filter((r) => typeof r === 'string' && r.length > 0);
    if (paths.length > 0) {
      const { error: storageError } = await admin.storage.from('pet-photos').remove(paths);
      if (storageError) throw new Error(`no se pudieron borrar las fotos: ${storageError.message}`);
    }

    // 3. Borrar el usuario de Auth. ULTIMO.
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) throw new Error(`no se pudo borrar el usuario: ${authError.message}`);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: HEADERS });
  } catch (e) {
    // No devolvemos exito a medias: si los datos ya se anonimizaron pero el
    // usuario de Auth sigue vivo, decir "listo" dejaria a la persona pudiendo
    // entrar a una cuenta lapida. Reintentar completa el resto, porque la RPC
    // es idempotente.
    console.error('error en delete-account', e);
    return new Response(
      JSON.stringify({ error: 'No se pudo completar el borrado. Intentá de nuevo.' }),
      { status: 500, headers: HEADERS },
    );
  }
});
```

- [ ] **Paso 2: Verificar que el typecheck del repo sigue limpio**

Run: `npx tsc --noEmit`
Esperado: sin salida. (`supabase/functions` está excluido del typecheck; este paso confirma que no se rompió nada del lado de la app.)

- [ ] **Paso 3: Commit**

```bash
git add supabase/functions/delete-account/index.ts
git commit -m "feat(cuenta): edge function delete-account (RPC, storage y auth en ese orden)"
```

---

### Task 4: Servicio y pantalla de borrado

**Archivos:**
- Crear: `src/services/account.ts`
- Crear: `src/screens/DeleteAccountScreen.tsx`
- Modificar: `src/screens/ProfileScreen.tsx:383-408`
- Modificar: `src/navigation/TabNavigator.tsx:104-108`

**Interfaces:**
- Consume: la Edge Function de la Task 3; `confirmAction`/`notify` de `src/lib/notify.ts`; `useAuth()` de `src/hooks/useAuth`.
- Produce: `borrarMiCuenta(): Promise<void>` en `src/services/account.ts` (lanza `ErrorAmigable` si falla); la ruta de navegación `'DeleteAccount'` dentro del `ProfileStack`.

- [ ] **Paso 1: Escribir el servicio**

Crear `src/services/account.ts`:

```ts
import { supabase } from '../lib/supabase';
import { ErrorAmigable } from '../lib/dbErrors';

// Borrar la cuenta propia. Todo el trabajo pesado pasa en la Edge Function
// `delete-account`: anonimiza los datos, borra las fotos y borra el usuario de
// Auth, en ese orden. Desde acá solo la invocamos y traducimos el fallo.
export async function borrarMiCuenta(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });

  if (error) {
    throw new ErrorAmigable(
      'No pudimos borrar tu cuenta. Probá de nuevo en un rato; si sigue fallando, escribinos.',
    );
  }
  // La función responde 200 con { ok: true }. Cualquier otra cosa es un fallo
  // que NO debemos tratar como éxito: si diéramos por borrada una cuenta que
  // sigue viva, la persona se iría creyendo que sus datos ya no están.
  if (!data?.ok) {
    throw new ErrorAmigable('El borrado quedó a medias. Intentá otra vez, por favor.');
  }
}
```

- [ ] **Paso 2: Escribir la pantalla**

Crear `src/screens/DeleteAccountScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borrarMiCuenta } from '../services/account';
import { confirmAction, notify } from '../lib/notify';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { useAuth } from '../hooks/useAuth';
import { AppText, Button, Card, Screen, Title } from '../ui';
import { colors, spacing } from '../theme';

// Borrar la cuenta no tiene vuelta atrás, así que la pantalla dice con todas
// las letras qué se destruye y qué sobrevive ANTES de ofrecer el botón. Que las
// pistas sigan ayudando a otros vecinos no es un detalle legal: es lo que hace
// que irse sea una decisión tranquila y no un salto al vacío.

const SE_BORRA = [
  'Tus reportes de mascotas, con sus fotos.',
  'Tu nombre, tu foto, tu teléfono y tu red social.',
  'Tu zona de alerta y tus reportes guardados.',
  'Tu correo: nadie va a poder relacionar lo que quede con vos.',
];

const QUEDA = [
  'Las pistas y avistamientos que dejaste en reportes de otros, firmados “Un vecino”: le siguen sirviendo a alguien que busca a su mascota.',
  'Tus conversaciones, del lado de la otra persona, como “Cuenta eliminada”. No va a poder escribirte más.',
];

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [borrando, setBorrando] = useState(false);

  const onBorrar = async () => {
    const ok = await confirmAction(
      '¿Borrar tu cuenta?',
      'Esto no se puede deshacer. Tus datos se borran para siempre.',
    );
    if (!ok) return;

    setBorrando(true);
    try {
      await borrarMiCuenta();
      notify('Cuenta borrada', 'Listo. Gracias por haber ayudado a encontrar mascotas.');
      await signOut();
    } catch (e: any) {
      notify('No se pudo borrar', mensajeDeErrorDb(e));
    } finally {
      setBorrando(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>Borrar mi cuenta</Title>
        <AppText muted>
          Si te vas, te vas de verdad: no guardamos una copia por las dudas.
        </AppText>

        <Card>
          <View style={styles.encabezado}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <AppText weight="bold">Se borra para siempre</AppText>
          </View>
          {SE_BORRA.map((t) => (
            <AppText key={t} style={styles.item}>
              · {t}
            </AppText>
          ))}
        </Card>

        <Card>
          <View style={styles.encabezado}>
            <Ionicons name="heart-outline" size={18} color={colors.primary} />
            <AppText weight="bold">Queda, pero sin tu nombre</AppText>
          </View>
          {QUEDA.map((t) => (
            <AppText key={t} style={styles.item}>
              · {t}
            </AppText>
          ))}
        </Card>

        <Button
          title={borrando ? 'Borrando…' : 'Borrar mi cuenta'}
          variant="danger"
          icon="trash-outline"
          onPress={onBorrar}
          disabled={borrando}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  item: {
    marginBottom: spacing.xs,
  },
});
```

**Nota para quien implementa:** antes de escribir esto, abrí `src/ui/index.ts` y confirmá los nombres exactos de los componentes (`AppText`, `Button`, `Card`, `Screen`, `Title`) y las props que aceptan (`weight`, `muted`, `variant`, `icon`), y `src/theme` para `colors.danger` / `colors.primary` / `spacing.xs`. Si alguno no existe, usá el equivalente que ya usan `NotificationPrefsScreen.tsx` y `LegalScreen.tsx` en vez de inventar props.

- [ ] **Paso 3: Registrar la pantalla en el navegador**

En `src/navigation/TabNavigator.tsx`, agregar el import junto a los otros:

```tsx
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
```

y la ruta al final del `ProfileStack`, después de `Legal`:

```tsx
      <ProfileStackNav.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ title: 'Borrar mi cuenta' }}
      />
```

- [ ] **Paso 4: Agregar la entrada en Perfil**

En `src/screens/ProfileScreen.tsx`, entre el botón `Privacidad y términos` y el de `Cerrar sesión` (línea ~407):

```tsx
        <Button
          title="Borrar mi cuenta"
          variant="ghost"
          icon="trash-outline"
          onPress={() => navigation.navigate('DeleteAccount')}
        />
```

- [ ] **Paso 5: Verificar typecheck y tests**

Run: `npx tsc --noEmit && npm test`
Esperado: sin errores de tipos; todos los tests en verde.

- [ ] **Paso 6: Commit**

```bash
git add src/services/account.ts src/screens/DeleteAccountScreen.tsx src/screens/ProfileScreen.tsx src/navigation/TabNavigator.tsx
git commit -m "feat(cuenta): pantalla de borrado con lo que se borra y lo que queda"
```

---

### Task 5: Mostrar la lápida en chat, conversaciones y pistas

**Archivos:**
- Modificar: `src/services/messages.ts:79-105`
- Modificar: `src/screens/ChatScreen.tsx:75-92`
- Modificar: `src/services/tips.ts:12-34`
- Test: `__tests__/services/messages.test.ts` (agregar caso)

**Interfaces:**
- Consume: `nombreDeAutor` de `src/lib/cuentaEliminada.ts` (Task 2); `Tip.autorEliminadoEn` (Task 2); `profiles.eliminado_en` (Task 1).
- Produce: `Conversation` gana `otherEliminado: boolean`. `ChatScreen` deja de mostrar el compositor si la otra parte está eliminada.

- [ ] **Paso 1: Escribir el test que falla**

Agregar a `__tests__/services/messages.test.ts`:

```ts
describe('listConversations con cuentas eliminadas', () => {
  it('marca el hilo como eliminado y lo nombra "Cuenta eliminada"', async () => {
    // Se apoya en los mocks que ya usa este archivo para `supabase.from`.
    // El perfil de la otra parte vuelve con eliminado_en cargado.
    const convs = await listConversations('yo');
    const hilo = convs.find((c) => c.otherUser === 'fantasma');
    expect(hilo?.otherNombre).toBe('Cuenta eliminada');
    expect(hilo?.otherEliminado).toBe(true);
  });
});
```

**Nota:** adaptá el armado del mock al patrón que ya tiene ese archivo (mirá cómo mockea `profiles` y `pets` en los tests existentes antes de escribir este). El perfil `fantasma` debe volver como `{ id: 'fantasma', nombre: 'Cuenta eliminada', eliminado_en: '2026-07-19T00:00:00Z' }` y debe existir al menos un mensaje entre `yo` y `fantasma`.

- [ ] **Paso 2: Correr el test y ver que falla**

Run: `npx jest __tests__/services/messages.test.ts`
Esperado: FAIL — `otherEliminado` es `undefined`.

- [ ] **Paso 3: Implementar en `messages.ts`**

Agregar el campo al tipo `Conversation` (buscar su `interface`/`type` en el mismo archivo):

```ts
  /** True si la otra parte borró su cuenta: no se le puede escribir. */
  otherEliminado: boolean;
```

Y reemplazar el bloque `listConversations` de las líneas 91-105:

```ts
  const [profsRes, petsRes] = await Promise.all([
    supabase.from('profiles').select('id, nombre, eliminado_en').in('id', userIds),
    supabase.from('pets').select('id, estado, especie').in('id', petIds),
  ]);
  const perfilById = new Map<string, { nombre: string | null; eliminadoEn: string | null }>(
    (profsRes.data ?? []).map((p: any) => [p.id, { nombre: p.nombre, eliminadoEn: p.eliminado_en ?? null }]),
  );
  const petById = new Map<string, string>(
    (petsRes.data ?? []).map((p: any) => [p.id, `${p.estado} · ${p.especie}`]),
  );

  return base.map((t) => {
    const perfil = perfilById.get(t.otherUser) ?? { nombre: null, eliminadoEn: null };
    return {
      ...t,
      otherNombre: nombreDeAutor(perfil.nombre, perfil.eliminadoEn),
      otherEliminado: perfil.eliminadoEn !== null,
      petLabel: petById.get(t.petId) ?? 'Mascota',
    };
  });
```

Agregar el import arriba del archivo:

```ts
import { nombreDeAutor } from '../lib/cuentaEliminada';
```

- [ ] **Paso 4: Correr el test y ver que pasa**

Run: `npx jest __tests__/services/messages.test.ts`
Esperado: PASS.

- [ ] **Paso 5: Ocultar el compositor en `ChatScreen`**

Agregar el estado, después de la línea 26 (`const { refresh: refreshUnread } = useUnread();`):

```tsx
  const [otroEliminado, setOtroEliminado] = useState(false);

  // Si la otra persona borró su cuenta, el hilo queda de solo lectura. La RLS
  // ya rechaza el insert (migración 0017); esto es para no ofrecer un campo de
  // texto que va a fallar.
  useEffect(() => {
    let vivo = true;
    supabase
      .from('profiles')
      .select('eliminado_en')
      .eq('id', otherUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (vivo) setOtroEliminado(Boolean(data?.eliminado_en));
      });
    return () => {
      vivo = false;
    };
  }, [otherUserId]);
```

Y reemplazar el `<View style={styles.inputRow}>…</View>` completo (líneas 75-92) por:

```tsx
        {otroEliminado ? (
          <View style={styles.inputRow}>
            <AppText muted style={styles.cerrado}>
              Esta persona borró su cuenta. La conversación queda como recuerdo.
            </AppText>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              placeholder="Escribe un mensaje…"
              placeholderTextColor={colors.muted}
              value={texto}
              onChangeText={setTexto}
              style={styles.input}
              multiline
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onSend}
              disabled={!puedeEnviar}
              style={[styles.sendButton, !puedeEnviar && styles.sendButtonDisabled]}
            >
              <Ionicons name="send" size={18} color={colors.white} />
            </TouchableOpacity>
          </View>
        )}
```

Agregar al `StyleSheet.create` del archivo:

```tsx
  cerrado: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
```

- [ ] **Paso 6: Pasar `eliminado_en` a las pistas**

En `src/services/tips.ts`, tres cambios puntuales:

```ts
// 1. En el tipo FilaTip, reemplazar la línea de `profiles`:
  profiles?:
    | { nombre: string | null; eliminado_en?: string | null }
    | Array<{ nombre: string | null; eliminado_en?: string | null }>
    | null;

// 2. El select con autor:
const SELECT_CON_AUTOR = 'id, pet_id, user_id, texto, creado_en, profiles(nombre, eliminado_en)';

// 3. En aTip(), agregar el campo al objeto devuelto, debajo de autorNombre:
    autorEliminadoEn: perfil?.eliminado_en ?? null,
```

Y en `src/screens/PetDetailScreen.tsx` (línea ~704), pasar el segundo argumento donde se llama a la firma:

```tsx
{firmaAutor(tip.autorNombre ?? null, tip.autorEliminadoEn ?? null)}
```

- [ ] **Paso 7: Verificar todo**

Run: `npx tsc --noEmit && npm test`
Esperado: sin errores de tipos; todos los tests en verde.

- [ ] **Paso 8: Commit**

```bash
git add src/services/messages.ts src/services/tips.ts src/screens/ChatScreen.tsx src/screens/PetDetailScreen.tsx __tests__/services/messages.test.ts
git commit -m "feat(cuenta): mostrar la lapida en chat, conversaciones y pistas"
```

---

### Task 6: Verificación contra la base real y de punta a punta

Esta tarea no escribe código de producción: comprueba que lo construido hace lo que dice. **Ninguna de las capas anteriores prueba la seguridad**, que es lo que más importa acá.

**Archivos:**
- Modificar: `ESTADO.md` (dejar registrado el resultado)

- [ ] **Paso 1: Desplegar la Edge Function**

```bash
cd C:\Users\pdani\encuentra-mascota
npx supabase functions deploy delete-account
```

Esperado: `Deployed Function delete-account`.

- [ ] **Paso 2: Probar el ataque — que A no pueda borrar a B**

Crear DOS cuentas descartables desde la app (A y B). Sacar el token de sesión de A del `localStorage` del navegador (clave `sb-<ref>-auth-token`, campo `access_token`), y probar:

```bash
# La RPC no acepta destinatario: PostgREST debe rechazar el parametro.
curl -s -X POST "https://ywlrcfaybnikaurxsgtj.supabase.co/rest/v1/rpc/anonimizar_mi_cuenta" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <TOKEN_DE_A>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<ID_DE_B>"}'
```

Esperado: error `PGRST202` / "function not found" — la firma con parámetro no existe. **Si esto devuelve éxito, parar todo: se pudo borrar una cuenta ajena.**

Después, confirmar que B sigue intacta:

```bash
curl -s "https://ywlrcfaybnikaurxsgtj.supabase.co/rest/v1/profiles?id=eq.<ID_DE_B>&select=id,eliminado_en" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <TOKEN_DE_A>"
```

Esperado: `eliminado_en: null`.

- [ ] **Paso 3: Probar que no se le puede escribir a una cuenta eliminada**

Borrar la cuenta A desde la app. Después, con el token de B, intentar insertar un mensaje hacia A:

```bash
curl -s -X POST "https://ywlrcfaybnikaurxsgtj.supabase.co/rest/v1/messages" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <TOKEN_DE_B>" \
  -H "Content-Type: application/json" \
  -d '{"pet_id":"<UN_PET_ID>","from_user":"<ID_DE_B>","to_user":"<ID_DE_A>","texto":"hola"}'
```

Esperado: `42501` (violación de RLS). **Si el mensaje entra, la política de la migración 0017 está mal.**

- [ ] **Paso 4: Probar que no quedan datos personales**

```bash
curl -s "https://ywlrcfaybnikaurxsgtj.supabase.co/rest/v1/profiles?id=eq.<ID_DE_A>&select=*" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <TOKEN_DE_B>"
```

Esperado: `nombre: "Cuenta eliminada"`, y `telefono`, `red_social` y `foto_perfil` en `null`.

- [ ] **Paso 5: Prueba de punta a punta en el navegador**

Con Playwright sobre `http://localhost:8091` (`npx expo start --web`), con una cuenta descartable nueva que antes de borrarse haya publicado un reporte, dejado una pista en el reporte de OTRA cuenta y chateado. Verificar las cinco cosas:

1. Su reporte ya no aparece en Inicio ni en la Lista.
2. La pista en el reporte ajeno **sigue estando**, firmada **“Un vecino”**.
3. En el chat de la otra cuenta el hilo dice **“Cuenta eliminada”** y **no aparece el campo de escribir**.
4. Intentar entrar con el correo y la clave viejos **falla**.
5. **Registrarse de nuevo con el mismo correo funciona** — la prueba de que `auth.users` se borró en serio.

Recordatorios de Playwright para este repo (aprendidos en tandas anteriores): los botones de RN-web no se pueden clickear por texto — hay que buscar en JS el `div` cuyo `innerText.trim().endsWith(label)` y que sea ancho (`offsetWidth>250`, `offsetHeight<90`) y hacer `page.mouse.click(centro)`. `notify`/`confirmAction` en web usan `window.alert`/`window.confirm`: hay que aceptar los diálogos.

- [ ] **Paso 6: Verificar que las fotos se fueron de Storage**

En el Dashboard → Storage → bucket `pet-photos`, confirmar que la carpeta `<ID_DE_A>/` ya no tiene los archivos del reporte borrado ni el avatar.

- [ ] **Paso 7: Dejar la base limpia y anotar el resultado**

Borrar la cuenta B y cualquier reporte de prueba que haya quedado. Anotar en `ESTADO.md` qué se verificó y qué no, con la misma honestidad que las tandas anteriores (si algo no se pudo probar, decirlo).

- [ ] **Paso 8: Commit**

```bash
git add ESTADO.md
git commit -m "docs: borrado de cuenta verificado contra la base real y en el navegador"
```

---

## Notas de autorrevisión

Cotejado contra el spec, tarea por tarea:

- Se borra de verdad (`pets`, `alert_zones`, `favorites`, `notification_prefs`, `push_tokens`, `notification_events`, fotos) → Task 1, paso 1.
- Sobrevive anonimizado (`sightings`, `pet_tips`, `messages`, `denuncias`) → Task 1 (no se tocan) + Task 5 (cómo se muestran).
- Lápida en `profiles` → Task 1.
- Soltar la FK → Task 1.
- RPC sin parámetros → Task 1, verificado explícitamente en Task 1 paso 3 y atacado en Task 6 paso 2.
- RLS de `messages` → Task 1, atacada en Task 6 paso 3.
- Orden RPC → Storage → Auth → Task 3.
- Fallas parciales sin éxito a medias → Task 3 (catch) y Task 4 (`if (!data?.ok)`).
- Pantalla con las dos listas → Task 4.
- Cambios de UI en chat/conversaciones/pistas → Task 5.
- Las tres capas de prueba → Tasks 2 y 5 (jest), Task 6 pasos 2-4 (base real), Task 6 paso 5 (Playwright).

**Riesgo conocido:** `drop constraint profiles_id_fkey` asume el nombre que Postgres le da por defecto a una FK inline (`<tabla>_<columna>_fkey`). Está verificado que la FK se declaró inline en `0001_init.sql:3`, pero si el `drop` falla por nombre inexistente, buscar el real con:

```sql
select conname from pg_constraint
 where conrelid = 'public.profiles'::regclass and contype = 'f';
```
