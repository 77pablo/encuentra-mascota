# Encuentra tu Mascota

App móvil (Expo / React Native + TypeScript) para publicar y buscar mascotas perdidas o encontradas en un mapa, con chat interno y notificaciones push. Backend en Supabase (Auth, Postgres con RLS, Storage y Realtime).

## Requisitos

- Node.js (versión LTS reciente).
- Una cuenta gratuita en [Supabase](https://supabase.com) y un proyecto creado.
- La app **Expo Go** instalada en el teléfono (Android o iOS) para probar sin compilar.

## Configuración

1. Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```
2. En el panel de Supabase de tu proyecto (Settings → API), copia:
   - `Project URL` → pégalo en `EXPO_PUBLIC_SUPABASE_URL`
   - `anon public key` → pégalo en `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. **Nunca subas `.env` al repositorio.** Ya está en `.gitignore`; `.env.example` solo tiene los nombres de las variables, sin valores.

## Base de datos

1. Aplica la migración `supabase/migrations/0001_init.sql`:
   - Desde el **SQL Editor** del panel de Supabase (pegar y ejecutar el contenido del archivo), o
   - con la CLI: `npx supabase db push`.
2. La migración crea las tablas `profiles`, `pets`, `messages`, `push_tokens`, sus políticas de **RLS** y el bucket de Storage `pet-photos`.
3. Habilita **Realtime** en la tabla `messages` (Database → Replication, en el panel de Supabase) para que el chat reciba mensajes en vivo.

## Edge Function (notificaciones push)

Despliega la función `send-push`:

```bash
npx supabase functions deploy send-push
```

Supabase inyecta automáticamente `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en el entorno de la función; esa clave **nunca** vive en la app ni en el repositorio.

## Correr la app

```bash
npx expo start
```

Escanea el código QR con la app Expo Go desde el teléfono.

## Pruebas

```bash
npm test
```

Corre las pruebas unitarias con Jest (validación de entorno, `ttlCache`, esquemas zod y el servicio de mascotas).

## Seguridad

- **RLS activo** en todas las tablas (`supabase/migrations/0001_init.sql`): cada usuario solo puede editar/borrar sus propios reportes y solo puede leer los mensajes donde participa.
- **Validación con zod** de los datos de entrada (auth y formulario de mascota) antes de tocar la red.
- **Secretos**: la clave `service_role` solo existe en las variables de entorno de la Edge Function (`supabase/functions/send-push`); la app solo usa `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (clave pública `anon`).
- **`send-push`** aplica rate limiting, responde `429` cuando corresponde y verifica autorización antes de enviar.
- **ProGuard/R8** se activa en el build de **release** de Android (no en Expo Go); se produce al compilar con **EAS Build**.
- **Sesión** guardada con `expo-secure-store` (almacenamiento cifrado del dispositivo), no en `AsyncStorage` plano.

## Checklist del usuario (pendiente, requiere proyecto Supabase real y teléfono)

- [ ] Crear el proyecto en Supabase.
- [ ] Aplicar la migración `supabase/migrations/0001_init.sql`.
- [ ] Habilitar Realtime en la tabla `messages`.
- [ ] Desplegar la Edge Function `send-push`.
- [ ] Probar la app en el teléfono con Expo Go (login, publicar reporte, mapa, chat, notificación).
- [ ] Verificar RLS: con la cuenta de un usuario A, intentar borrar un reporte (`pets.id`) que pertenece a otro usuario B. La operación no debe afectar filas (RLS lo bloquea) y el reporte de B debe seguir existiendo.
- [ ] Verificar que sin `.env` (o con variables vacías) `npx expo start` falla con el mensaje "Faltan variables de entorno requeridas: …" (ver `src/lib/env.ts`).
