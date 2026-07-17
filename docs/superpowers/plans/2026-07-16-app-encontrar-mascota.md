# App "Encuentra tu Mascota" — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una app móvil comunitaria (Android/iOS) donde la gente publica mascotas perdidas o encontradas con foto, señas y ubicación en un mapa, y se contactan por un chat interno para reencontrarlas.

**Architecture:** App Expo (React Native + TypeScript) que habla directo con Supabase (Auth, Postgres, Storage, Realtime). Nada de backend Express propio; la lógica sensible (envío de push) va en una Edge Function de Supabase. Row Level Security (RLS) protege los datos por usuario. La validación de inputs se hace con zod antes de tocar la base.

**Tech Stack:** Expo SDK (React Native, TypeScript), Supabase JS v2, `@react-navigation` (tabs + stack), `react-native-maps`, `expo-image-picker` + `expo-image-manipulator`, `expo-location`, `expo-secure-store`, `expo-notifications`, `zod`, Jest + `jest-expo` para pruebas unitarias.

## Global Constraints

- **Lenguaje:** TypeScript en todo el código de la app.
- **Identidad git:** commits como `Pablo Espinoza <pdanielespinozavega@gmail.com>`.
- **Secretos:** ninguna clave en el código. Solo variables de entorno. `service_role` **jamás** en la app (solo en Edge Functions). En la app únicamente `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`. `.env` en `.gitignore`, `.env.example` con solo los nombres.
- **Validación:** todo input de usuario pasa por un schema zod antes de enviarse a Supabase.
- **Seguridad:** RLS activo en todas las tablas desde su creación. Un usuario solo edita/borra lo suyo.
- **Sin SQL concatenado:** siempre el query builder de Supabase (parametrizado).
- **Recompensa:** siempre opcional; si está vacía no se muestra. Nunca destacar reportes por pago.
- **Commits frecuentes:** un commit por tarea como mínimo.

---

## Estructura de archivos

```
encuentra-mascota/
├── app.config.ts               # Config Expo + expo-build-properties (ProGuard/R8 en release)
├── App.tsx                     # Punto de entrada → RootNavigator
├── .env.example                # Nombres de variables (sin valores)
├── package.json
├── tsconfig.json
├── jest.config.js
├── src/
│   ├── lib/
│   │   ├── env.ts              # Lee y VALIDA variables de entorno al arrancar
│   │   └── supabase.ts         # Cliente Supabase + sesión en SecureStore
│   ├── schemas/
│   │   ├── auth.ts             # zod: login, registro
│   │   └── pet.ts              # zod: crear/editar reporte de mascota
│   ├── services/
│   │   ├── storage.ts          # comprimir + subir fotos a Supabase Storage
│   │   ├── pets.ts             # CRUD de reportes
│   │   ├── messages.ts         # enviar/leer mensajes
│   │   └── pushTokens.ts       # registrar token de push del dispositivo
│   ├── hooks/
│   │   ├── useAuth.tsx         # contexto de sesión (usuario actual)
│   │   └── useRealtimeMessages.ts  # suscripción realtime a un chat
│   ├── navigation/
│   │   ├── RootNavigator.tsx   # decide Auth vs App según sesión
│   │   └── TabNavigator.tsx    # 4 pestañas
│   ├── screens/
│   │   ├── auth/LoginScreen.tsx
│   │   ├── auth/RegisterScreen.tsx
│   │   ├── MapScreen.tsx
│   │   ├── ListScreen.tsx
│   │   ├── PublishScreen.tsx
│   │   ├── PetDetailScreen.tsx
│   │   ├── ChatScreen.tsx
│   │   └── ProfileScreen.tsx
│   └── components/
│       └── PetCard.tsx
├── supabase/
│   ├── migrations/
│   │   └── 0001_init.sql       # tablas + RLS + Storage policies
│   └── functions/
│       └── send-push/index.ts  # Edge Function con rate limiting → envía push
└── __tests__/
    ├── schemas/auth.test.ts
    ├── schemas/pet.test.ts
    ├── lib/env.test.ts
    └── services/pets.test.ts
```

---

### Task 1: Inicializar proyecto Expo + TypeScript + herramientas de prueba

**Files:**
- Create: `package.json`, `tsconfig.json`, `App.tsx`, `app.config.ts`, `.env.example`, `jest.config.js`
- Modify: `.gitignore` (ya existe con `.env`, `node_modules/`, `.expo/`)

**Interfaces:**
- Produces: proyecto Expo que corre con `npx expo start` y `npm test` ejecuta Jest.

- [ ] **Step 1: Crear la app Expo con plantilla TypeScript**

```bash
cd /c/Users/pdani/encuentra-mascota
npx create-expo-app@latest . --template blank-typescript
```

- [ ] **Step 2: Instalar dependencias del proyecto**

```bash
npx expo install @supabase/supabase-js @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context react-native-maps expo-image-picker expo-image-manipulator expo-location expo-secure-store expo-notifications expo-build-properties
npm install zod
npm install --save-dev jest jest-expo @types/jest ts-jest
```

- [ ] **Step 3: Configurar Jest**

Create `jest.config.js`:

```javascript
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*|@supabase/.*))',
  ],
};
```

Add to `package.json` scripts:

```json
"scripts": {
  "start": "expo start",
  "test": "jest"
}
```

- [ ] **Step 4: Configurar `app.config.ts` con ProGuard/R8 para release de Android**

```typescript
import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Encuentra tu Mascota',
  slug: 'encuentra-mascota',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'encuentramascota',
  android: {
    package: 'com.pabloespinoza.encuentramascota',
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
  },
  ios: {
    bundleIdentifier: 'com.pabloespinoza.encuentramascota',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Usamos tu ubicación para mostrar y publicar mascotas cerca de ti.',
    },
  },
  plugins: [
    [
      'expo-build-properties',
      {
        android: {
          // Ofuscación + reducción de código en el APK de release
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
    'expo-secure-store',
    'expo-notifications',
  ],
};

export default config;
```

- [ ] **Step 5: Crear `.env.example` (solo nombres, sin valores)**

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 6: Verificar que arranca y que Jest corre**

Run: `npm test`
Expected: Jest arranca (0 tests o "No tests found" es aceptable en este punto).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: inicializa app Expo con TypeScript, deps y Jest"
```

---

### Task 2: Validación de variables de entorno al arrancar

**Files:**
- Create: `src/lib/env.ts`, `__tests__/lib/env.test.ts`

**Interfaces:**
- Produces: `getEnv(): { supabaseUrl: string; supabaseAnonKey: string }` — lanza `Error` si falta alguna variable. Consumido por `src/lib/supabase.ts`.

- [ ] **Step 1: Escribir el test que falla**

Create `__tests__/lib/env.test.ts`:

```typescript
import { validateEnv } from '../../src/lib/env';

describe('validateEnv', () => {
  it('devuelve las variables cuando están todas presentes', () => {
    const result = validateEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-123',
    });
    expect(result).toEqual({
      supabaseUrl: 'https://x.supabase.co',
      supabaseAnonKey: 'anon-123',
    });
  });

  it('lanza error si falta una variable requerida', () => {
    expect(() =>
      validateEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `npm test -- env.test`
Expected: FAIL con "Cannot find module '../../src/lib/env'".

- [ ] **Step 3: Implementar `src/lib/env.ts`**

```typescript
type RawEnv = Record<string, string | undefined>;

export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const REQUIRED = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;

export function validateEnv(raw: RawEnv): AppEnv {
  const missing = REQUIRED.filter((key) => !raw[key] || raw[key]!.trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas: ${missing.join(', ')}. ` +
        `Revisa tu archivo .env (usa .env.example como guía).`,
    );
  }
  return {
    supabaseUrl: raw.EXPO_PUBLIC_SUPABASE_URL!,
    supabaseAnonKey: raw.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

// Se ejecuta al importar: si falta algo, la app no arranca.
export const env: AppEnv = validateEnv(process.env as RawEnv);
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `npm test -- env.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts __tests__/lib/env.test.ts
git commit -m "feat: valida variables de entorno al arrancar"
```

---

### Task 3: Migración de base de datos (tablas + RLS)

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces: tablas `profiles`, `pets`, `messages`, `push_tokens` con RLS; bucket de Storage `pet-photos`. Consumido por todos los servicios.

- [ ] **Step 1: Escribir la migración SQL**

Create `supabase/migrations/0001_init.sql`:

```sql
-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  foto_perfil text,
  creado_en timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "perfiles visibles para autenticados"
  on public.profiles for select to authenticated using (true);
create policy "editar mi propio perfil"
  on public.profiles for update to authenticated using (auth.uid() = id);
create policy "crear mi propio perfil"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

-- PETS
create type pet_estado as enum ('perdida', 'encontrada');
create type pet_especie as enum ('perro', 'gato', 'otro');

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  estado pet_estado not null,
  especie pet_especie not null,
  raza text,
  nombre text,
  descripcion text not null,
  fotos text[] not null default '{}',
  lat double precision not null,
  lng double precision not null,
  recompensa text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.pets enable row level security;

create policy "reportes visibles para autenticados"
  on public.pets for select to authenticated using (true);
create policy "crear mis reportes"
  on public.pets for insert to authenticated with check (auth.uid() = user_id);
create policy "editar mis reportes"
  on public.pets for update to authenticated using (auth.uid() = user_id);
create policy "borrar mis reportes"
  on public.pets for delete to authenticated using (auth.uid() = user_id);

-- MESSAGES
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  texto text not null,
  leido boolean not null default false,
  creado_en timestamptz not null default now()
);
alter table public.messages enable row level security;

create policy "leer solo mis mensajes"
  on public.messages for select to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);
create policy "enviar mensajes como yo"
  on public.messages for insert to authenticated with check (auth.uid() = from_user);
create policy "marcar leido mis mensajes recibidos"
  on public.messages for update to authenticated using (auth.uid() = to_user);

-- PUSH TOKENS
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  creado_en timestamptz not null default now()
);
alter table public.push_tokens enable row level security;

create policy "gestionar mis tokens"
  on public.push_tokens for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ÍNDICES (para que las búsquedas no recorran toda la tabla — como no buscar
-- una llave en un cajón lleno de ropa)
create index pets_activo_idx on public.pets (activo);
create index pets_user_id_idx on public.pets (user_id);
create index pets_creado_en_idx on public.pets (creado_en desc);
create index pets_estado_especie_idx on public.pets (estado, especie);
create index pets_lat_lng_idx on public.pets (lat, lng);
create index messages_pet_id_idx on public.messages (pet_id);
create index messages_to_user_leido_idx on public.messages (to_user, leido);
create index messages_creado_en_idx on public.messages (creado_en);
create index push_tokens_user_id_idx on public.push_tokens (user_id);

-- STORAGE: bucket de fotos
insert into storage.buckets (id, name, public) values ('pet-photos', 'pet-photos', true);

create policy "fotos legibles por todos"
  on storage.objects for select using (bucket_id = 'pet-photos');
create policy "subir mis fotos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'pet-photos' and owner = auth.uid());
create policy "borrar mis fotos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pet-photos' and owner = auth.uid());
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Opción A (recomendada, panel web): crear un proyecto en supabase.com → SQL Editor → pegar el contenido de `0001_init.sql` → Run.
Opción B (CLI): `npx supabase db push` (requiere `supabase login` y `supabase link`).

Expected: las 4 tablas y el bucket `pet-photos` aparecen en el panel de Supabase, con RLS habilitado (candado verde).

- [ ] **Step 3: Verificar RLS activo**

En el panel: Database → Tables → cada tabla muestra "RLS enabled". Confirmar visualmente.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: migracion inicial con tablas, RLS y bucket de fotos"
```

---

### Task 4: Cliente Supabase con sesión en SecureStore

**Files:**
- Create: `src/lib/supabase.ts`

**Interfaces:**
- Consumes: `env` de `src/lib/env.ts`.
- Produces: `supabase` (SupabaseClient) usado por todos los servicios y hooks.

- [ ] **Step 1: Implementar `src/lib/supabase.ts`**

```typescript
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { env } from './env';

// Guarda el token de sesión en el almacenamiento cifrado del teléfono (no texto plano).
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 2: Instalar el polyfill de URL requerido por Supabase**

```bash
npx expo install react-native-url-polyfill
```

- [ ] **Step 3: Verificar que compila (typecheck)**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts package.json package-lock.json
git commit -m "feat: cliente Supabase con sesion en SecureStore"
```

---

### Task 5: Schemas de validación con zod (auth y mascota)

**Files:**
- Create: `src/schemas/auth.ts`, `src/schemas/pet.ts`, `__tests__/schemas/auth.test.ts`, `__tests__/schemas/pet.test.ts`

**Interfaces:**
- Produces:
  - `loginSchema`, `registerSchema` (auth); tipos `LoginInput`, `RegisterInput`.
  - `petSchema`; tipo `PetInput`. Campos: `estado`, `especie`, `raza?`, `nombre?`, `descripcion`, `lat`, `lng`, `recompensa?`.
- Consumido por pantallas Login/Register/Publish.

- [ ] **Step 1: Escribir tests que fallan (auth)**

Create `__tests__/schemas/auth.test.ts`:

```typescript
import { loginSchema, registerSchema } from '../../src/schemas/auth';

describe('loginSchema', () => {
  it('acepta email y password válidos', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '123456' }).success).toBe(true);
  });
  it('rechaza email inválido', () => {
    expect(loginSchema.safeParse({ email: 'no-es-email', password: '123456' }).success).toBe(false);
  });
  it('rechaza password corta', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '123' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('exige nombre no vacío', () => {
    expect(
      registerSchema.safeParse({ nombre: '', email: 'a@b.com', password: '123456' }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Escribir tests que fallan (pet)**

Create `__tests__/schemas/pet.test.ts`:

```typescript
import { petSchema } from '../../src/schemas/pet';

const base = {
  estado: 'perdida',
  especie: 'perro',
  descripcion: 'Café, mediano, con collar rojo',
  lat: -33.45,
  lng: -70.66,
};

describe('petSchema', () => {
  it('acepta un reporte válido mínimo', () => {
    expect(petSchema.safeParse(base).success).toBe(true);
  });
  it('acepta raza y recompensa opcionales', () => {
    expect(petSchema.safeParse({ ...base, raza: 'quiltro', recompensa: '$20.000' }).success).toBe(true);
  });
  it('rechaza estado inválido', () => {
    expect(petSchema.safeParse({ ...base, estado: 'volando' }).success).toBe(false);
  });
  it('rechaza descripción vacía', () => {
    expect(petSchema.safeParse({ ...base, descripcion: '' }).success).toBe(false);
  });
  it('rechaza coordenadas fuera de rango', () => {
    expect(petSchema.safeParse({ ...base, lat: 200 }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Correr los tests para ver que fallan**

Run: `npm test -- schemas`
Expected: FAIL ("Cannot find module ... schemas/auth" y ".../pet").

- [ ] **Step 4: Implementar `src/schemas/auth.ts`**

```typescript
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export const registerSchema = loginSchema.extend({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(60),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
```

- [ ] **Step 5: Implementar `src/schemas/pet.ts`**

```typescript
import { z } from 'zod';

export const petSchema = z.object({
  estado: z.enum(['perdida', 'encontrada']),
  especie: z.enum(['perro', 'gato', 'otro']),
  raza: z.string().trim().max(60).optional().or(z.literal('')),
  nombre: z.string().trim().max(60).optional().or(z.literal('')),
  descripcion: z.string().trim().min(1, 'Describe las señas de la mascota').max(1000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  recompensa: z.string().trim().max(100).optional().or(z.literal('')),
});

export type PetInput = z.infer<typeof petSchema>;
```

- [ ] **Step 6: Correr los tests para ver que pasan**

Run: `npm test -- schemas`
Expected: PASS (todos).

- [ ] **Step 7: Commit**

```bash
git add src/schemas __tests__/schemas
git commit -m "feat: schemas de validacion zod para auth y mascota"
```

---

### Task 6: Contexto de autenticación (useAuth) + navegación raíz

**Files:**
- Create: `src/hooks/useAuth.tsx`, `src/navigation/RootNavigator.tsx`, `src/navigation/TabNavigator.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `supabase`.
- Produces:
  - `AuthProvider` (componente) y `useAuth(): { user, session, loading, signOut }`.
  - `RootNavigator` que muestra Auth (Login/Register) si no hay sesión, o `TabNavigator` si la hay.
  - `TabNavigator` con 4 pestañas: Mapa, Lista, Publicar, Mensajes (placeholders por ahora).

- [ ] **Step 1: Implementar `src/hooks/useAuth.tsx`**

```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
```

- [ ] **Step 2: Implementar `src/navigation/TabNavigator.tsx` (con placeholders)**

```typescript
import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();

function Placeholder({ nombre }: { nombre: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{nombre}</Text>
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Mapa">{() => <Placeholder nombre="Mapa" />}</Tab.Screen>
      <Tab.Screen name="Lista">{() => <Placeholder nombre="Lista" />}</Tab.Screen>
      <Tab.Screen name="Publicar">{() => <Placeholder nombre="Publicar" />}</Tab.Screen>
      <Tab.Screen name="Mensajes">{() => <Placeholder nombre="Mensajes" />}</Tab.Screen>
    </Tab.Navigator>
  );
}
```

- [ ] **Step 3: Implementar `src/navigation/RootNavigator.tsx` (Login inline temporal)**

```typescript
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import TabNavigator from './TabNavigator';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <Stack.Screen name="App" component={TabNavigator} />
        ) : (
          // Reemplazado por pantallas reales en la Task 7
          <Stack.Screen name="Auth" component={TabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 4: Actualizar `App.tsx`**

```typescript
import React from 'react';
import { AuthProvider } from './src/hooks/useAuth';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
```

- [ ] **Step 5: Prueba manual en el teléfono**

Run: `npx expo start`
En el teléfono con Expo Go, escanear el QR.
Expected: la app abre y muestra la barra de 4 pestañas (Mapa/Lista/Publicar/Mensajes), cada una con su texto.

- [ ] **Step 6: Commit**

```bash
git add App.tsx src/hooks/useAuth.tsx src/navigation
git commit -m "feat: contexto de auth + navegacion con 4 pestañas"
```

---

### Task 7: Pantallas de Login y Registro

**Files:**
- Create: `src/screens/auth/LoginScreen.tsx`, `src/screens/auth/RegisterScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx` (usar un stack de Auth real)

**Interfaces:**
- Consumes: `loginSchema`, `registerSchema`, `supabase`.
- Produces: flujo de entrada real. Al registrarse, crea también la fila en `profiles`.

- [ ] **Step 1: Implementar `src/screens/auth/LoginScreen.tsx`**

```typescript
import React, { useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import { loginSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      Alert.alert('Revisa los datos', parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) Alert.alert('No se pudo entrar', error.message);
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', textAlign: 'center' }}>Encuentra tu Mascota</Text>
      <TextInput placeholder="Correo" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <TextInput placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword}
        style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <Button title={loading ? 'Entrando…' : 'Entrar'} onPress={onSubmit} disabled={loading} />
      <Button title="Crear cuenta" onPress={() => navigation.navigate('Register')} />
    </View>
  );
}
```

- [ ] **Step 2: Implementar `src/screens/auth/RegisterScreen.tsx`**

```typescript
import React, { useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import { registerSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';

export default function RegisterScreen() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const parsed = registerSchema.safeParse({ nombre, email, password });
    if (!parsed.success) {
      Alert.alert('Revisa los datos', parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) {
      setLoading(false);
      Alert.alert('No se pudo registrar', error.message);
      return;
    }
    if (data.user) {
      // Crear la fila de perfil (RLS exige auth.uid() = id)
      await supabase.from('profiles').insert({ id: data.user.id, nombre: parsed.data.nombre });
    }
    setLoading(false);
    Alert.alert('¡Listo!', 'Revisa tu correo si se pide confirmación, luego entra.');
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', textAlign: 'center' }}>Crear cuenta</Text>
      <TextInput placeholder="Tu nombre" value={nombre} onChangeText={setNombre}
        style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <TextInput placeholder="Correo" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <TextInput placeholder="Contraseña (mín. 6)" secureTextEntry value={password} onChangeText={setPassword}
        style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <Button title={loading ? 'Creando…' : 'Registrarme'} onPress={onSubmit} disabled={loading} />
    </View>
  );
}
```

- [ ] **Step 3: Conectar el stack de Auth en `RootNavigator.tsx`**

Reemplazar la rama `else` del Step 3 de la Task 6 por un stack real:

```typescript
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

// ...dentro del Stack.Navigator, cuando NO hay sesión:
<>
  <Stack.Screen name="Login" component={LoginScreen} />
  <Stack.Screen name="Register" component={RegisterScreen} />
</>
```

- [ ] **Step 4: Prueba manual (registro + login)**

Run: `npx expo start`
En Expo Go: crear una cuenta → verificar en el panel de Supabase (Auth → Users) que aparece el usuario y en Table `profiles` la fila con el nombre. Luego entrar; debe mostrar las 4 pestañas.

- [ ] **Step 5: Commit**

```bash
git add src/screens/auth src/navigation/RootNavigator.tsx
git commit -m "feat: pantallas de login y registro con validacion"
```

---

### Task 8: Servicio de fotos (comprimir + subir a Storage)

**Files:**
- Create: `src/services/storage.ts`

**Interfaces:**
- Consumes: `supabase`, `expo-image-manipulator`.
- Produces: `uploadPetPhoto(uri: string, userId: string): Promise<string>` — comprime la imagen y devuelve la **URL pública** en el bucket `pet-photos`. Consumido por PublishScreen.

- [ ] **Step 1: Implementar `src/services/storage.ts`**

```typescript
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

// Comprime a máx 1080px de ancho y sube; devuelve la URL pública.
export async function uploadPetPhoto(uri: string, userId: string): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1080 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
  );

  const response = await fetch(manipulated.uri);
  const arrayBuffer = await response.arrayBuffer();
  const path = `${userId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('pet-photos')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from('pet-photos').getPublicUrl(path);
  return data.publicUrl;
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

Nota: la subida real se prueba de forma manual en la Task 9 (necesita una foto del teléfono). El nombre `Date.now()` es aceptable aquí (código de app en runtime, no en un workflow).

- [ ] **Step 3: Commit**

```bash
git add src/services/storage.ts
git commit -m "feat: servicio para comprimir y subir fotos a Storage"
```

---

### Task 9: Servicio de mascotas (CRUD) + caché + pruebas

**Files:**
- Create: `src/lib/cache.ts`, `src/services/pets.ts`, `__tests__/lib/cache.test.ts`, `__tests__/services/pets.test.ts`

**Interfaces:**
- Consumes: `supabase`, `PetInput`.
- Produces:
  - `src/lib/cache.ts`: `ttlCache<T>(ttlMs)` → `{ get(): T | null, set(v: T): void, clear(): void }`. Caché en memoria con vencimiento (para no recorrer/pedir todo en cada cambio de pestaña).
  - `createPet(input: PetInput, fotos: string[], userId: string): Promise<Pet>` (invalida la caché de la lista).
  - `listActivePets(opts?: { force?: boolean }): Promise<Pet[]>` (usa caché; `force: true` la salta).
  - `getPet(id: string): Promise<Pet>`
  - `closePet(id: string): Promise<void>` (marca `activo=false`; invalida la caché).
  - tipo `Pet` (fila de la tabla).

- [ ] **Step 1: Escribir el test de la caché (TDD) y correrlo (falla)**

Create `__tests__/lib/cache.test.ts`:

```typescript
import { ttlCache } from '../../src/lib/cache';

describe('ttlCache', () => {
  it('devuelve null antes de guardar', () => {
    const c = ttlCache<number>(1000);
    expect(c.get()).toBeNull();
  });
  it('devuelve el valor guardado dentro del TTL', () => {
    const c = ttlCache<string>(1000, () => 500); // reloj fijo en 500ms
    c.set('hola');
    expect(c.get()).toBe('hola');
  });
  it('vence pasado el TTL', () => {
    let ahora = 0;
    const c = ttlCache<string>(1000, () => ahora);
    c.set('hola');
    ahora = 1500;
    expect(c.get()).toBeNull();
  });
  it('clear borra el valor', () => {
    const c = ttlCache<string>(1000, () => 0);
    c.set('hola');
    c.clear();
    expect(c.get()).toBeNull();
  });
});
```

Run: `npm test -- cache.test`
Expected: FAIL ("Cannot find module '../../src/lib/cache'").

- [ ] **Step 2: Implementar `src/lib/cache.ts`**

```typescript
// Caché en memoria con vencimiento. Recibe un `now` inyectable para poder
// probar el vencimiento sin depender del reloj real.
export interface Cache<T> {
  get(): T | null;
  set(value: T): void;
  clear(): void;
}

export function ttlCache<T>(ttlMs: number, now: () => number = () => Date.now()): Cache<T> {
  let value: T | null = null;
  let savedAt = 0;
  return {
    get() {
      if (value === null) return null;
      if (now() - savedAt > ttlMs) {
        value = null;
        return null;
      }
      return value;
    },
    set(v: T) {
      value = v;
      savedAt = now();
    },
    clear() {
      value = null;
    },
  };
}
```

Run: `npm test -- cache.test`
Expected: PASS (4 tests).

- [ ] **Step 3: Escribir el test que falla (pets, con Supabase mockeado)**

Create `__tests__/services/pets.test.ts`:

```typescript
import { createPet } from '../../src/services/pets';

const insertResult = { data: { id: 'pet-1', estado: 'perdida' }, error: null };
const singleMock = jest.fn().mockResolvedValue(insertResult);
const selectMock = jest.fn(() => ({ single: singleMock }));
const insertMock = jest.fn(() => ({ select: selectMock }));

jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: jest.fn(() => ({ insert: insertMock })) },
}));

describe('createPet', () => {
  it('inserta el reporte con user_id y fotos y devuelve la fila', async () => {
    const input = {
      estado: 'perdida' as const, especie: 'perro' as const,
      descripcion: 'café', lat: -33.4, lng: -70.6,
    };
    const pet = await createPet(input, ['https://foto/1.jpg'], 'user-1');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', fotos: ['https://foto/1.jpg'], estado: 'perdida' }),
    );
    expect(pet).toEqual(insertResult.data);
  });
});
```

- [ ] **Step 4: Correr el test para ver que falla**

Run: `npm test -- pets.test`
Expected: FAIL ("Cannot find module ... services/pets").

- [ ] **Step 5: Implementar `src/services/pets.ts` (con caché)**

```typescript
import { supabase } from '../lib/supabase';
import { PetInput } from '../schemas/pet';
import { ttlCache } from '../lib/cache';

export interface Pet {
  id: string;
  user_id: string;
  estado: 'perdida' | 'encontrada';
  especie: 'perro' | 'gato' | 'otro';
  raza: string | null;
  nombre: string | null;
  descripcion: string;
  fotos: string[];
  lat: number;
  lng: number;
  recompensa: string | null;
  activo: boolean;
  creado_en: string;
}

// Caché de la lista de reportes activos (30s). Evita pedir todo a la base
// cada vez que se cambia entre Mapa y Lista.
const activePetsCache = ttlCache<Pet[]>(30_000);

export async function createPet(input: PetInput, fotos: string[], userId: string): Promise<Pet> {
  const { data, error } = await supabase
    .from('pets')
    .insert({ ...input, fotos, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  activePetsCache.clear(); // hay un reporte nuevo → refrescar
  return data as Pet;
}

export async function listActivePets(opts?: { force?: boolean }): Promise<Pet[]> {
  if (!opts?.force) {
    const cached = activePetsCache.get();
    if (cached) return cached;
  }
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('activo', true)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  const pets = (data ?? []) as Pet[];
  activePetsCache.set(pets);
  return pets;
}

export async function getPet(id: string): Promise<Pet> {
  const { data, error } = await supabase.from('pets').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Pet;
}

export async function closePet(id: string): Promise<void> {
  const { error } = await supabase.from('pets').update({ activo: false }).eq('id', id);
  if (error) throw error;
  activePetsCache.clear(); // se cerró un reporte → refrescar
}
```

- [ ] **Step 6: Correr el test para ver que pasa**

Run: `npm test -- pets.test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cache.ts src/services/pets.ts __tests__/lib/cache.test.ts __tests__/services/pets.test.ts
git commit -m "feat: servicio CRUD de mascotas con cache y pruebas"
```

---

### Task 10: Pantalla Publicar (foto + señas + ubicación)

**Files:**
- Create: `src/screens/PublishScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx` (usar la pantalla real)

**Interfaces:**
- Consumes: `petSchema`, `uploadPetPhoto`, `createPet`, `useAuth`, `expo-image-picker`, `expo-location`, `react-native-maps`.
- Produces: reporte real guardado en la base.

- [ ] **Step 1: Implementar `src/screens/PublishScreen.tsx`**

```typescript
import React, { useState } from 'react';
import { Alert, Button, Image, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { petSchema } from '../schemas/pet';
import { uploadPetPhoto } from '../services/storage';
import { createPet } from '../services/pets';
import { useAuth } from '../hooks/useAuth';

export default function PublishScreen({ navigation }: any) {
  const { user } = useAuth();
  const [estado, setEstado] = useState<'perdida' | 'encontrada'>('perdida');
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'otro'>('perro');
  const [raza, setRaza] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [recompensa, setRecompensa] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [coords, setCoords] = useState({ lat: -33.45, lng: -70.66 });
  const [saving, setSaving] = useState(false);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (!res.canceled) setFotoUri(res.assets[0].uri);
  };

  const useMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Sin permiso', 'Puedes mover el pin en el mapa a mano.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  };

  const onSubmit = async () => {
    const parsed = petSchema.safeParse({ estado, especie, raza, nombre, descripcion, recompensa, ...coords });
    if (!parsed.success) {
      Alert.alert('Falta algo', parsed.error.issues[0].message);
      return;
    }
    if (!fotoUri) {
      Alert.alert('Falta la foto', 'Agrega al menos una foto de la mascota.');
      return;
    }
    setSaving(true);
    try {
      const url = await uploadPetPhoto(fotoUri, user!.id);
      await createPet(parsed.data, [url], user!.id);
      Alert.alert('¡Publicado!', 'Tu reporte ya aparece en el mapa.');
      navigation.navigate('Mapa');
    } catch (e: any) {
      Alert.alert('Error al publicar', e.message ?? 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={estado === 'perdida' ? '● Perdida' : 'Perdida'} onPress={() => setEstado('perdida')} />
        <Button title={estado === 'encontrada' ? '● Encontrada' : 'Encontrada'} onPress={() => setEstado('encontrada')} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={especie === 'perro' ? '● Perro' : 'Perro'} onPress={() => setEspecie('perro')} />
        <Button title={especie === 'gato' ? '● Gato' : 'Gato'} onPress={() => setEspecie('gato')} />
        <Button title={especie === 'otro' ? '● Otro' : 'Otro'} onPress={() => setEspecie('otro')} />
      </View>
      <TextInput placeholder="Raza (opcional)" value={raza} onChangeText={setRaza} style={inputStyle} />
      <TextInput placeholder="Nombre (opcional)" value={nombre} onChangeText={setNombre} style={inputStyle} />
      <TextInput placeholder="Señas: color, tamaño, collar…" value={descripcion} onChangeText={setDescripcion}
        multiline style={[inputStyle, { height: 90 }]} />
      <TextInput placeholder="Recompensa (opcional)" value={recompensa} onChangeText={setRecompensa} style={inputStyle} />
      <Button title="Elegir foto 📸" onPress={pickImage} />
      {fotoUri && <Image source={{ uri: fotoUri }} style={{ height: 180, borderRadius: 8 }} />}
      <Text style={{ fontWeight: '600' }}>Ubicación (mueve el pin):</Text>
      <Button title="Usar mi ubicación 📍" onPress={useMyLocation} />
      <MapView style={{ height: 200, borderRadius: 8 }}
        region={{ latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        onPress={(e) => setCoords({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}>
        <Marker draggable coordinate={{ latitude: coords.lat, longitude: coords.lng }}
          onDragEnd={(e) => setCoords({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })} />
      </MapView>
      <Button title={saving ? 'Publicando…' : 'Publicar'} onPress={onSubmit} disabled={saving} />
    </ScrollView>
  );
}

const inputStyle = { borderWidth: 1, borderRadius: 8, padding: 12 } as const;
```

- [ ] **Step 2: Conectar la pantalla real en `TabNavigator.tsx`**

Reemplazar el placeholder de "Publicar" por `component={PublishScreen}` (import arriba).

- [ ] **Step 3: Prueba manual (publicar)**

Run: `npx expo start`
En Expo Go: elegir foto, escribir señas, mover el pin, Publicar → verificar en el panel de Supabase (Table `pets`) que aparece la fila con la foto (url), lat/lng y `activo=true`.

- [ ] **Step 4: Commit**

```bash
git add src/screens/PublishScreen.tsx src/navigation/TabNavigator.tsx
git commit -m "feat: pantalla publicar con foto, ubicacion y validacion"
```

---

### Task 11: Pantalla Mapa (pins de mascotas)

**Files:**
- Create: (usa `MapScreen.tsx`)
- Modify: `src/navigation/TabNavigator.tsx`

**Interfaces:**
- Consumes: `listActivePets`, `react-native-maps`.
- Produces: mapa con un pin por reporte activo; tocar el pin navega a Detalle (Task 13).

- [ ] **Step 1: Implementar `src/screens/MapScreen.tsx`**

```typescript
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { listActivePets, Pet } from '../services/pets';

export default function MapScreen({ navigation }: any) {
  const [pets, setPets] = useState<Pet[]>([]);

  useFocusEffect(
    useCallback(() => {
      listActivePets().then(setPets).catch(() => setPets([]));
    }, []),
  );

  return (
    <View style={{ flex: 1 }}>
      <MapView style={{ flex: 1 }}
        initialRegion={{ latitude: -33.45, longitude: -70.66, latitudeDelta: 0.3, longitudeDelta: 0.3 }}>
        {pets.map((p) => (
          <Marker key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            pinColor={p.estado === 'perdida' ? 'red' : 'green'}
            title={`${p.estado === 'perdida' ? 'Perdida' : 'Encontrada'} · ${p.especie}`}
            description={p.descripcion.slice(0, 40)}
            onCalloutPress={() => navigation.navigate('PetDetail', { id: p.id })}
          />
        ))}
      </MapView>
    </View>
  );
}
```

- [ ] **Step 2: Conectar en `TabNavigator.tsx`** (reemplazar placeholder de "Mapa").

- [ ] **Step 3: Prueba manual**

Run: `npx expo start`
Expected: en el mapa aparece un pin en la ubicación del reporte creado en la Task 10 (rojo = perdida, verde = encontrada).

- [ ] **Step 4: Commit**

```bash
git add src/screens/MapScreen.tsx src/navigation/TabNavigator.tsx
git commit -m "feat: mapa con pins de mascotas activas"
```

---

### Task 12: Pantalla Lista con filtros

**Files:**
- Create: `src/screens/ListScreen.tsx`, `src/components/PetCard.tsx`
- Modify: `src/navigation/TabNavigator.tsx`

**Interfaces:**
- Consumes: `listActivePets`, `Pet`.
- Produces: lista filtrable por estado y especie; tocar una tarjeta navega a Detalle.

- [ ] **Step 1: Implementar `src/components/PetCard.tsx`**

```typescript
import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { Pet } from '../services/pets';

export default function PetCard({ pet, onPress }: { pet: Pet; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ flexDirection: 'row', gap: 12, padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}>
      {pet.fotos[0] ? (
        <Image source={{ uri: pet.fotos[0] }} style={{ width: 64, height: 64, borderRadius: 8 }} />
      ) : (
        <View style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: '#ddd' }} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700' }}>
          {pet.estado === 'perdida' ? '🔴 Perdida' : '🟢 Encontrada'} · {pet.especie}
          {pet.raza ? ` (${pet.raza})` : ''}
        </Text>
        <Text numberOfLines={2}>{pet.descripcion}</Text>
        {pet.recompensa ? <Text style={{ color: '#b8860b' }}>Recompensa: {pet.recompensa}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2: Implementar `src/screens/ListScreen.tsx`**

```typescript
import React, { useCallback, useMemo, useState } from 'react';
import { Button, FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listActivePets, Pet } from '../services/pets';
import PetCard from '../components/PetCard';

export default function ListScreen({ navigation }: any) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [estado, setEstado] = useState<'todas' | 'perdida' | 'encontrada'>('todas');

  useFocusEffect(
    useCallback(() => {
      listActivePets().then(setPets).catch(() => setPets([]));
    }, []),
  );

  const filtradas = useMemo(
    () => (estado === 'todas' ? pets : pets.filter((p) => p.estado === estado)),
    [pets, estado],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: 8, padding: 8 }}>
        <Button title="Todas" onPress={() => setEstado('todas')} />
        <Button title="Perdidas" onPress={() => setEstado('perdida')} />
        <Button title="Encontradas" onPress={() => setEstado('encontrada')} />
      </View>
      <FlatList data={filtradas} keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PetCard pet={item} onPress={() => navigation.navigate('PetDetail', { id: item.id })} />
        )} />
    </View>
  );
}
```

- [ ] **Step 3: Conectar en `TabNavigator.tsx`** (reemplazar placeholder de "Lista").

- [ ] **Step 4: Prueba manual**

Expected: la lista muestra los reportes; los filtros Perdidas/Encontradas funcionan.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ListScreen.tsx src/components/PetCard.tsx src/navigation/TabNavigator.tsx
git commit -m "feat: lista de mascotas con filtros"
```

---

### Task 13: Pantalla Detalle de mascota + botón Contactar

**Files:**
- Create: `src/screens/PetDetailScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx` (agregar stack para Mapa/Lista → Detail → Chat)

**Interfaces:**
- Consumes: `getPet`, `useAuth`.
- Produces: detalle completo; botón "Contactar" navega a Chat con `{ petId, otherUserId }`.

- [ ] **Step 1: Envolver Mapa y Lista en un stack que incluya Detail y Chat**

En `TabNavigator.tsx`, crear un `createNativeStackNavigator()` "ExploreStack" con pantallas `Mapa`/`Lista` (según pestaña), `PetDetail` y `Chat`, para poder navegar desde los pins/tarjetas.

```typescript
// Ejemplo del stack usado por la pestaña Mapa:
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MapScreen from '../screens/MapScreen';
import PetDetailScreen from '../screens/PetDetailScreen';
import ChatScreen from '../screens/ChatScreen';

const MapStackNav = createNativeStackNavigator();
function MapStack() {
  return (
    <MapStackNav.Navigator>
      <MapStackNav.Screen name="Mapa" component={MapScreen} />
      <MapStackNav.Screen name="PetDetail" component={PetDetailScreen} options={{ title: 'Detalle' }} />
      <MapStackNav.Screen name="Chat" component={ChatScreen} />
    </MapStackNav.Navigator>
  );
}
// La pestaña "Mapa" usa component={MapStack}. Igual para "Lista" con ListScreen.
```

- [ ] **Step 2: Implementar `src/screens/PetDetailScreen.tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import { Button, Image, ScrollView, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { getPet, Pet } from '../services/pets';
import { useAuth } from '../hooks/useAuth';

export default function PetDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const { user } = useAuth();
  const [pet, setPet] = useState<Pet | null>(null);

  useEffect(() => {
    getPet(id).then(setPet).catch(() => setPet(null));
  }, [id]);

  if (!pet) return <Text style={{ padding: 24 }}>Cargando…</Text>;

  const esMio = pet.user_id === user?.id;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {pet.fotos.map((f) => (
        <Image key={f} source={{ uri: f }} style={{ height: 240, borderRadius: 8 }} />
      ))}
      <Text style={{ fontSize: 20, fontWeight: '700' }}>
        {pet.estado === 'perdida' ? '🔴 Perdida' : '🟢 Encontrada'} · {pet.especie}
        {pet.raza ? ` (${pet.raza})` : ''}
      </Text>
      {pet.nombre ? <Text>Nombre: {pet.nombre}</Text> : null}
      <Text>{pet.descripcion}</Text>
      {pet.recompensa ? <Text style={{ color: '#b8860b' }}>Recompensa: {pet.recompensa}</Text> : null}
      <MapView style={{ height: 160, borderRadius: 8 }}
        region={{ latitude: pet.lat, longitude: pet.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}>
        <Marker coordinate={{ latitude: pet.lat, longitude: pet.lng }} />
      </MapView>
      {!esMio && (
        <Button title="Contactar 💬"
          onPress={() => navigation.navigate('Chat', { petId: pet.id, otherUserId: pet.user_id })} />
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Prueba manual**

Expected: tocar un pin/tarjeta abre el detalle con fotos, señas, mini-mapa y (si no es tuyo) el botón Contactar.

- [ ] **Step 4: Commit**

```bash
git add src/screens/PetDetailScreen.tsx src/navigation/TabNavigator.tsx
git commit -m "feat: detalle de mascota con boton contactar"
```

---

### Task 14: Servicio de mensajes + hook realtime

**Files:**
- Create: `src/services/messages.ts`, `src/hooks/useRealtimeMessages.ts`

**Interfaces:**
- Consumes: `supabase`.
- Produces:
  - `sendMessage(petId, fromUser, toUser, texto): Promise<void>`
  - `listMessages(petId, me, other): Promise<Message[]>`
  - `useRealtimeMessages(petId, me, other): Message[]` (se actualiza solo).
  - tipo `Message`.

- [ ] **Step 1: Implementar `src/services/messages.ts`**

```typescript
import { supabase } from '../lib/supabase';

export interface Message {
  id: string;
  pet_id: string;
  from_user: string;
  to_user: string;
  texto: string;
  leido: boolean;
  creado_en: string;
}

export async function sendMessage(petId: string, fromUser: string, toUser: string, texto: string) {
  const clean = texto.trim();
  if (!clean) throw new Error('Mensaje vacío');
  const { error } = await supabase.from('messages').insert({
    pet_id: petId, from_user: fromUser, to_user: toUser, texto: clean,
  });
  if (error) throw error;
}

export async function listMessages(petId: string, me: string, other: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('pet_id', petId)
    .or(`and(from_user.eq.${me},to_user.eq.${other}),and(from_user.eq.${other},to_user.eq.${me})`)
    .order('creado_en', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}
```

- [ ] **Step 2: Implementar `src/hooks/useRealtimeMessages.ts`**

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listMessages, Message } from '../services/messages';

export function useRealtimeMessages(petId: string, me: string, other: string): Message[] {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    let active = true;
    listMessages(petId, me, other).then((m) => active && setMessages(m));

    const channel = supabase
      .channel(`chat-${petId}-${me}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `pet_id=eq.${petId}` },
        (payload) => {
          const msg = payload.new as Message;
          const entreNosotros =
            (msg.from_user === me && msg.to_user === other) ||
            (msg.from_user === other && msg.to_user === me);
          if (entreNosotros) setMessages((prev) => [...prev, msg]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [petId, me, other]);

  return messages;
}
```

- [ ] **Step 3: Habilitar Realtime para la tabla `messages` en Supabase**

Panel: Database → Replication → habilitar `messages`. (O `alter publication supabase_realtime add table public.messages;` en SQL Editor.)

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/services/messages.ts src/hooks/useRealtimeMessages.ts
git commit -m "feat: servicio de mensajes y hook realtime"
```

---

### Task 15: Pantalla Chat (tiempo real)

**Files:**
- Create: `src/screens/ChatScreen.tsx`

**Interfaces:**
- Consumes: `useRealtimeMessages`, `sendMessage`, `useAuth`.
- Produces: conversación en vivo sobre un reporte.

- [ ] **Step 1: Implementar `src/screens/ChatScreen.tsx`**

```typescript
import React, { useState } from 'react';
import { Button, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeMessages } from '../hooks/useRealtimeMessages';
import { sendMessage } from '../services/messages';

export default function ChatScreen({ route }: any) {
  const { petId, otherUserId } = route.params;
  const { user } = useAuth();
  const me = user!.id;
  const messages = useRealtimeMessages(petId, me, otherUserId);
  const [texto, setTexto] = useState('');

  const onSend = async () => {
    const t = texto;
    setTexto('');
    try {
      await sendMessage(petId, me, otherUserId, t);
    } catch {
      setTexto(t); // restaurar si falla
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList data={messages} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 12, gap: 8 }}
        renderItem={({ item }) => (
          <View style={{ alignSelf: item.from_user === me ? 'flex-end' : 'flex-start',
            backgroundColor: item.from_user === me ? '#dcf8c6' : '#eee', borderRadius: 12, padding: 10, maxWidth: '80%' }}>
            <Text>{item.texto}</Text>
          </View>
        )} />
      <View style={{ flexDirection: 'row', gap: 8, padding: 8 }}>
        <TextInput placeholder="Escribe un mensaje…" value={texto} onChangeText={setTexto}
          style={{ flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14 }} />
        <Button title="Enviar" onPress={onSend} disabled={!texto.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Prueba manual (dos cuentas)**

Con dos teléfonos (o un teléfono + un emulador), cada uno con una cuenta distinta: el usuario A abre el reporte del usuario B → Contactar → escribe. El mensaje debe **aparecer solo** en la pantalla de B sin recargar.

- [ ] **Step 3: Commit**

```bash
git add src/screens/ChatScreen.tsx
git commit -m "feat: pantalla de chat en tiempo real"
```

---

### Task 16: Registro de token de push + Edge Function con rate limiting

**Files:**
- Create: `src/services/pushTokens.ts`, `supabase/functions/send-push/index.ts`
- Modify: `src/hooks/useAuth.tsx` (registrar token al iniciar sesión)

**Interfaces:**
- Consumes: `expo-notifications`, `supabase`.
- Produces:
  - `registerPushToken(userId: string): Promise<void>` — pide permiso, obtiene el Expo token y lo guarda.
  - Edge Function `send-push` que, dado `{ toUserId, title, body }`, busca los tokens del usuario y envía el push por la API de Expo, con **rate limiting** (máx 10/min por IP) y respuesta **429**.

- [ ] **Step 1: Implementar `src/services/pushTokens.ts`**

```typescript
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';

export async function registerPushToken(userId: string): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return; // sin permiso, no registramos (silencioso)
  const tokenData = await Notifications.getExpoPushTokenAsync();
  await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token: tokenData.data }, { onConflict: 'token' });
}
```

- [ ] **Step 2: Llamar `registerPushToken` cuando haya sesión (en `useAuth.tsx`)**

En el `onAuthStateChange`/al cargar sesión, si `session?.user`, llamar `registerPushToken(session.user.id)` (import arriba; envolver en try/catch para no romper el login).

- [ ] **Step 3: Implementar la Edge Function `supabase/functions/send-push/index.ts`**

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Rate limiting en memoria: máx 10 solicitudes por IP por minuto.
const WINDOW_MS = 60_000;
const MAX = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const prev = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  prev.push(now);
  hits.set(ip, prev);
  return prev.length > MAX;
}

Deno.serve(async (req: Request) => {
  const ip = req.headers.get('x-forwarded-for') ?? 'desconocida';
  if (rateLimited(ip)) {
    console.warn(`rate limit excedido para IP ${ip}`);
    return new Response(JSON.stringify({ error: 'Demasiadas solicitudes' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  try {
    const { toUserId, title, body } = await req.json();
    if (!toUserId || !title) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400 });
    }

    // service_role SOLO existe aquí (variables de entorno de la función), nunca en la app.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', toUserId);

    const messages = (tokens ?? []).map((t) => ({ to: t.token, title, body: body ?? '' }));
    if (messages.length > 0) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
    }

    return new Response(JSON.stringify({ ok: true, enviados: messages.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (e) {
    console.error('error en send-push', e);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
});
```

- [ ] **Step 4: Desplegar la Edge Function**

```bash
npx supabase functions deploy send-push
```
(La función lee `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, inyectadas automáticamente por Supabase en el entorno de la función.)

- [ ] **Step 5: Llamar la función al enviar un mensaje**

En `ChatScreen.onSend`, tras `sendMessage(...)` exitoso, invocar (sin bloquear la UI):

```typescript
supabase.functions.invoke('send-push', {
  body: { toUserId: otherUserId, title: 'Nuevo mensaje sobre una mascota', body: t.slice(0, 80) },
}).catch(() => {}); // el push es "best effort"; si falla, el chat igual funcionó
```

- [ ] **Step 6: Prueba manual (push)**

Con dos cuentas en dos teléfonos: A le escribe a B. B (con la app en segundo plano) debe recibir una notificación push "Nuevo mensaje sobre una mascota".

- [ ] **Step 7: Commit**

```bash
git add src/services/pushTokens.ts src/hooks/useAuth.tsx supabase/functions/send-push/index.ts src/screens/ChatScreen.tsx
git commit -m "feat: push de mensajes con Edge Function y rate limiting"
```

---

### Task 17: Pantalla Perfil / Mensajes (mis reportes + cerrar + salir)

**Files:**
- Create: `src/screens/ProfileScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx` (pestaña "Mensajes" pasa a mostrar Perfil + accesos)

**Interfaces:**
- Consumes: `useAuth`, `supabase`, `closePet`.
- Produces: lista de mis reportes activos con botón "Ya apareció ✅" (llama `closePet`) y botón "Cerrar sesión".

- [ ] **Step 1: Implementar `src/screens/ProfileScreen.tsx`**

```typescript
import React, { useCallback, useState } from 'react';
import { Alert, Button, FlatList, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { closePet, Pet } from '../services/pets';
import { useAuth } from '../hooks/useAuth';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [mis, setMis] = useState<Pet[]>([]);

  const cargar = useCallback(() => {
    supabase.from('pets').select('*').eq('user_id', user!.id).eq('activo', true)
      .then(({ data }) => setMis((data ?? []) as Pet[]));
  }, [user]);

  useFocusEffect(cargar);

  const marcar = async (id: string) => {
    await closePet(id);
    Alert.alert('¡Genial!', 'Reporte cerrado.');
    cargar();
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Mis reportes activos</Text>
      <FlatList data={mis} keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text>No tienes reportes activos.</Text>}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '600' }}>
              {item.estado} · {item.especie} — {item.descripcion.slice(0, 40)}
            </Text>
            <Button title="Ya apareció ✅" onPress={() => marcar(item.id)} />
          </View>
        )} />
      <View style={{ marginTop: 16 }}>
        <Button title="Cerrar sesión" color="#c00" onPress={signOut} />
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Conectar en `TabNavigator.tsx`** (la pestaña "Mensajes"/perfil usa `ProfileScreen`).

- [ ] **Step 3: Prueba manual**

Expected: aparecen mis reportes activos; al tocar "Ya apareció" desaparece de aquí y del mapa/lista; "Cerrar sesión" vuelve al login.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ProfileScreen.tsx src/navigation/TabNavigator.tsx
git commit -m "feat: perfil con mis reportes, cerrar reporte y cerrar sesion"
```

---

### Task 18: Verificación de seguridad end-to-end + README

**Files:**
- Create: `README.md`
- Test: manual + `npm test`

**Interfaces:** ninguna nueva. Cierre del proyecto.

- [ ] **Step 1: Correr toda la batería de pruebas**

Run: `npm test`
Expected: PASS (env, schemas, pets service).

- [ ] **Step 2: Verificar RLS (un usuario NO puede borrar el reporte de otro)**

Con la cuenta A logueada, intentar en la consola de la app / SQL con el token de A borrar un `pets.id` de B. Expected: la operación no afecta filas (RLS lo bloquea). Confirmar que el reporte de B sigue existiendo.

- [ ] **Step 3: Verificar que la app no arranca sin variables de entorno**

Renombrar `.env` temporalmente y `npx expo start`. Expected: error claro "Faltan variables de entorno requeridas: …". Restaurar `.env`.

- [ ] **Step 4: Verificar que no hay secretos en el repo**

Run: `git grep -iE "service_role|SUPABASE_SERVICE_ROLE|anon-key-real" || echo "sin secretos"`
Expected: "sin secretos" (o solo referencias en `.env.example` sin valores).

- [ ] **Step 5: Escribir `README.md`** con: requisitos, cómo configurar `.env` (copiando `.env.example`), cómo correr (`npx expo start`), cómo aplicar la migración, y nota de que ProGuard/R8 se activa en el build de release con EAS.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: README con setup, seguridad y notas de release"
```

---

### Task 19: Servicio de conversaciones (bandeja de chats) + prueba

**Files:**
- Modify: `src/services/messages.ts`
- Test: `__tests__/services/conversations.test.ts`

**Interfaces:**
- Produces:
  - `foldConversations(msgs: Message[], me: string): ConversationKey[]` — función pura que reduce una lista de mensajes a un hilo por `(petId, otherUser)`, quedándose con el más reciente (asume `msgs` ordenados de más nuevo a más viejo). Fácil de testear.
  - `type ConversationKey = { petId: string; otherUser: string; lastTexto: string; lastAt: string }`
  - `type Conversation = ConversationKey & { otherNombre: string; petLabel: string }`
  - `listConversations(me: string): Promise<Conversation[]>` — trae los mensajes del usuario, los pliega con `foldConversations`, y enriquece con el nombre del otro usuario y una etiqueta de la mascota.

- [ ] **Step 1: Escribir el test de `foldConversations` (TDD) y correrlo (falla)**

Create `__tests__/services/conversations.test.ts`:

```typescript
import { foldConversations } from '../../src/services/messages';

const me = 'me';
// más nuevo primero (como los devuelve listConversations)
const msgs = [
  { id: '4', pet_id: 'petA', from_user: 'me', to_user: 'otro1', texto: 'último a otro1', leido: false, creado_en: '2026-07-16T10:00:00Z' },
  { id: '3', pet_id: 'petA', from_user: 'otro1', to_user: 'me', texto: 'viejo de otro1', leido: true, creado_en: '2026-07-16T09:00:00Z' },
  { id: '2', pet_id: 'petB', from_user: 'otro2', to_user: 'me', texto: 'de otro2', leido: false, creado_en: '2026-07-16T08:00:00Z' },
] as any;

describe('foldConversations', () => {
  it('agrupa por (petId, otro usuario) y conserva el más reciente', () => {
    const convs = foldConversations(msgs, me);
    expect(convs).toHaveLength(2);
    const a = convs.find((c) => c.petId === 'petA')!;
    expect(a.otherUser).toBe('otro1');
    expect(a.lastTexto).toBe('último a otro1');
    const b = convs.find((c) => c.petId === 'petB')!;
    expect(b.otherUser).toBe('otro2');
  });
  it('devuelve vacío sin mensajes', () => {
    expect(foldConversations([], me)).toEqual([]);
  });
});
```

Run: `npm test -- conversations.test`
Expected: FAIL ("foldConversations is not a function" / no exportada).

- [ ] **Step 2: Implementar en `src/services/messages.ts`** (añadir al final, sin tocar lo existente)

```typescript
export type ConversationKey = {
  petId: string;
  otherUser: string;
  lastTexto: string;
  lastAt: string;
};

export type Conversation = ConversationKey & {
  otherNombre: string;
  petLabel: string;
};

// Pura: asume msgs ordenados de más nuevo a más viejo. Un hilo por (petId, otro usuario).
export function foldConversations(msgs: Message[], me: string): ConversationKey[] {
  const threads = new Map<string, ConversationKey>();
  for (const m of msgs) {
    const otherUser = m.from_user === me ? m.to_user : m.from_user;
    const key = `${m.pet_id}:${otherUser}`;
    if (!threads.has(key)) {
      threads.set(key, { petId: m.pet_id, otherUser, lastTexto: m.texto, lastAt: m.creado_en });
    }
  }
  return [...threads.values()];
}

export async function listConversations(me: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`from_user.eq.${me},to_user.eq.${me}`)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  const base = foldConversations((data ?? []) as Message[], me);
  if (base.length === 0) return [];

  const userIds = [...new Set(base.map((t) => t.otherUser))];
  const petIds = [...new Set(base.map((t) => t.petId))];
  const [profsRes, petsRes] = await Promise.all([
    supabase.from('profiles').select('id, nombre').in('id', userIds),
    supabase.from('pets').select('id, estado, especie').in('id', petIds),
  ]);
  const nombreById = new Map<string, string>((profsRes.data ?? []).map((p: any) => [p.id, p.nombre]));
  const petById = new Map<string, string>(
    (petsRes.data ?? []).map((p: any) => [p.id, `${p.estado} · ${p.especie}`]),
  );

  return base.map((t) => ({
    ...t,
    otherNombre: nombreById.get(t.otherUser) ?? 'Usuario',
    petLabel: petById.get(t.petId) ?? 'Mascota',
  }));
}
```

- [ ] **Step 3: Correr el test (pasa)**

Run: `npm test -- conversations.test`
Expected: PASS (2 tests). Luego `npm test` completo para confirmar que nada se rompió.

- [ ] **Step 4: Commit**

```bash
git add src/services/messages.ts __tests__/services/conversations.test.ts
git commit -m "feat: servicio de conversaciones para la bandeja de mensajes"
```

---

### Task 20: Pantalla Conversaciones + pestaña Perfil separada

**Files:**
- Create: `src/screens/ConversationsScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx`

**Interfaces:**
- Consumes: `listConversations`, `Conversation`, `useAuth`.
- Produces: la pestaña "Mensajes" ahora muestra la bandeja de conversaciones (tocar una abre el Chat), y se agrega una 5ª pestaña "Perfil" con `ProfileScreen` (que antes vivía en "Mensajes").

- [ ] **Step 1: Implementar `src/screens/ConversationsScreen.tsx`**

```typescript
import React, { useCallback, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listConversations, Conversation } from '../services/messages';
import { useAuth } from '../hooks/useAuth';

export default function ConversationsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [convs, setConvs] = useState<Conversation[]>([]);

  useFocusEffect(
    useCallback(() => {
      listConversations(user!.id)
        .then(setConvs)
        .catch((e) => console.error('No se pudieron cargar las conversaciones:', e));
    }, [user]),
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={convs}
        keyExtractor={(c) => `${c.petId}:${c.otherUser}`}
        ListEmptyComponent={<Text style={{ padding: 24 }}>Aún no tienes conversaciones.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Chat', { petId: item.petId, otherUserId: item.otherUser })}
            style={{ padding: 14, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '700' }}>{item.otherNombre} · {item.petLabel}</Text>
            <Text numberOfLines={1} style={{ color: '#555' }}>{item.lastTexto}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
```

- [ ] **Step 2: Reestructurar `src/navigation/TabNavigator.tsx`**

- Envolver la pestaña "Mensajes" en un native-stack propio que registre `Conversaciones` (ConversationsScreen) y `Chat` (ChatScreen):

```typescript
import ConversationsScreen from '../screens/ConversationsScreen';

const MsgStackNav = createNativeStackNavigator();
function MsgStack() {
  return (
    <MsgStackNav.Navigator>
      <MsgStackNav.Screen name="Conversaciones" component={ConversationsScreen} />
      <MsgStackNav.Screen name="Chat" component={ChatScreen} />
    </MsgStackNav.Navigator>
  );
}
```

- La pestaña "Mensajes" pasa a `component={MsgStack}` (con `headerShown: false` en el Tab.Screen para no duplicar header, igual que Mapa/Lista).
- Agregar una 5ª pestaña "Perfil" con `component={ProfileScreen}` (mover ahí lo que antes estaba en "Mensajes"). Mantener Mapa, Lista y Publicar intactos.

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores. (Prueba en dispositivo diferida.)

- [ ] **Step 4: Commit**

```bash
git add src/screens/ConversationsScreen.tsx src/navigation/TabNavigator.tsx
git commit -m "feat: bandeja de conversaciones en pestaña Mensajes + pestaña Perfil"
```

---

## Autorevisión del plan (cobertura del spec)

- **Muro perdidas/encontradas** → Tasks 9–12 (CRUD, publicar, mapa, lista). ✅
- **Mapa con ubicación** → Tasks 10 (publicar con pin), 11 (mapa con pins). ✅
- **Cuentas + chat interno** → Tasks 6, 7 (auth), 14, 15 (chat realtime). ✅
- **Match manual** → resuelto por diseño (la gente reconoce en mapa/lista/detalle). ✅
- **Notificaciones push** → Task 16. ✅
- **Campos: especie, raza, señas, collar, fotos, ubicación, recompensa** → Task 5 (schema) + 10 (form). ✅
- **Recompensa opcional** → schema `optional`, se muestra solo si existe (Tasks 5, 12, 13). ✅
- **Seguridad:** RLS (Task 3), validación zod (Task 5), env al arrancar (Task 2), secretos fuera del código / `service_role` solo en función (Tasks 1, 16), rate limiting + 429 (Task 16), SecureStore (Task 4), ProGuard/R8 (Task 1), verificación final (Task 18). ✅
- **Operaciones en segundo plano (async/await, compresión de fotos)** → Tasks 8, 10. ✅
- **"Ya apareció" / cerrar reporte** → Task 17. ✅
- **Pruebas** → unitarias (Tasks 2, 5, 9) + manuales por pantalla + seguridad (Task 18). ✅

Sin placeholders pendientes. Tipos consistentes entre tareas (`Pet`, `Message`, `PetInput` definidos una vez y reutilizados).
