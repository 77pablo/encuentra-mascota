# Setup — Correo (SMTP) y Push real

Guía para dejar funcionando **el envío de correos** (confirmar cuenta + recuperar
contraseña) y **las notificaciones push reales** en el celular.

Todo el código ya está cableado. Lo que falta es **crear cuentas y pegar llaves**.
Los pasos marcados con 🔑 son tuyos; los ✅ ya están hechos en el repo.

> Recordatorio: trabaja en este worktree `C:\Users\pdani\encuentra-mascota-wt\setup`.
> Las llaves reales van en `.env` (que está en `.gitignore`, nunca se sube).

---

## A) Correo / SMTP (confirmar cuenta + recuperar contraseña)

Supabase envía correos de auth (confirmación y recuperación). Su servidor de
prueba tiene un límite muy bajo y no es confiable, así que se conecta un SMTP
propio. Recomendado: **Resend** (más simple) o **Brevo** (alternativa gratis
con más volumen). La configuración va en el **dashboard de Supabase**, no en la
app: por eso **no hay ninguna llave de correo en `.env`**.

### Qué ya está cableado (✅)
- ✅ **Registro** (`src/screens/auth/RegisterScreen.tsx`): llama a
  `supabase.auth.signUp`. Si activas "Confirm email" en Supabase, este envío
  dispara el correo de confirmación automáticamente.
- ✅ **"Olvidé mi clave"** (`src/screens/auth/ForgotPasswordScreen.tsx`): llama a
  `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.
- ✅ **Nueva contraseña** (`src/screens/auth/ResetPasswordScreen.tsx` +
  `src/hooks/useAuth.tsx`): al abrir el enlace del correo, Supabase emite el
  evento `PASSWORD_RECOVERY`, `useAuth` pone `recovering = true` y se muestra la
  pantalla para escribir la clave nueva (`supabase.auth.updateUser`).
- ✅ **Plantillas de correo** listas para pegar (opcionales):
  `supabase/templates/confirm-signup.html` y `supabase/templates/reset-password.html`.

### Lo que debes hacer (🔑)

#### Opción 1 — Resend (recomendado)
1. 🔑 Crea cuenta en <https://resend.com> (gratis).
2. 🔑 En Resend, ve a **API Keys** > **Create API Key**. Copia la llave
   (empieza con `re_...`). La llamaremos `TU_RESEND_API_KEY`.
3. 🔑 Anota los datos SMTP de Resend:
   - **Host:** `smtp.resend.com`
   - **Puerto:** `465` (SSL) o `587` (TLS)
   - **Usuario:** `resend`
   - **Contraseña:** `TU_RESEND_API_KEY` (la llave del paso 2)
4. 🔑 En el **dashboard de Supabase** de tu proyecto:
   **Project Settings > Authentication > SMTP Settings** (o
   **Authentication > Emails > SMTP**) > activa **Enable Custom SMTP** y pega:
   - Sender email: tu remitente (ver aviso de dominio abajo)
   - Sender name: `Encuentra tu Mascota`
   - Host / Port / User / Password: los del paso 3.
5. 🔑 (Opcional pero recomendado) En **Authentication > Emails** pega las
   plantillas de `supabase/templates/*.html` en "Confirm signup" y "Reset password".
6. 🔑 Para exigir confirmación de correo al registrarse: **Authentication >
   Sign In / Providers > Email** > activa **Confirm email**.
   (Hoy está apagado para pruebas; ver `ESTADO.md`.)

> ### ⚠️ AVISO IMPORTANTE — Resend en modo prueba
> Sin verificar un dominio propio, Resend está **en modo prueba**: solo puede
> enviar correos a **tu propia dirección de Gmail** (la de la cuenta de Resend).
> Si registras a otro correo, el envío **falla silenciosamente**.
> Para enviar a cualquier usuario debes **verificar un dominio** en Resend
> (**Domains > Add Domain**, agregar los registros DNS SPF/DKIM que te dan) y
> usar un remitente de ese dominio, p. ej. `no-responder@tudominio.cl`.

#### Opción 2 — Brevo (alternativa)
1. 🔑 Crea cuenta en <https://www.brevo.com>.
2. 🔑 **SMTP & API > SMTP**: copia el **SMTP key** (`TU_BREVO_SMTP_KEY`) y tu login.
   - **Host:** `smtp-relay.brevo.com` · **Puerto:** `587`
   - **Usuario:** el login SMTP que muestra Brevo (un correo)
   - **Contraseña:** `TU_BREVO_SMTP_KEY`
3. 🔑 Pégalos en Supabase igual que en la Opción 1, paso 4.
4. 🔑 En Brevo verifica un remitente o dominio (**Senders & IP**) para no caer en spam.

### Cómo probar el correo
1. En la app, ve a **Registrarme** con un correo (si activaste Confirm email) o
   a **¿Olvidaste tu contraseña?** y envía el enlace.
2. Revisa la bandeja (y **spam**). Con Resend en prueba, usa tu propio Gmail.
3. En web, el enlace de recuperación vuelve a `window.location.origin`
   (`redirectTo`). Para móvil, configura la Redirect URL en
   **Authentication > URL Configuration** con el scheme `encuentramascota://`.

---

## B) Push real (EAS + expo-notifications)

El indicador de mensajes no leídos ya funciona (bandeja interna). Falta el
**push real** al celular, que requiere `eas init` + credenciales.

### Cómo funciona (arquitectura ya montada)
1. Al iniciar sesión, `src/hooks/useAuth.tsx` llama a `registerPushToken`.
2. `src/services/pushTokens.ts` pide permiso, obtiene el **Expo push token**
   usando el `projectId` de EAS y lo guarda en la tabla `push_tokens`.
3. Al enviar un mensaje, `src/screens/ChatScreen.tsx` invoca la Edge Function
   `send-push` ("best effort": si falla, el chat igual funciona).
4. La Edge Function `supabase/functions/send-push/index.ts` valida al llamador,
   comprueba que exista conversación con el destinatario (anti-spam), lee sus
   tokens con `service_role` y llama a `https://exp.host/--/api/v2/push/send`.

### Qué ya está cableado (✅)
- ✅ Dependencia `expo-notifications` y su plugin en `app.config.ts`.
- ✅ Tabla `push_tokens` + RLS (`supabase/migrations/0001_init.sql`).
- ✅ Registro del token en login (`useAuth.tsx` → `pushTokens.ts`).
- ✅ Manejo del `projectId` de EAS: `app.config.ts` lo expone en
  `extra.eas.projectId` desde la variable `EAS_PROJECT_ID`.
- ✅ Edge Function `send-push` (auth + rate-limit + chequeo de conversación).
- ✅ Invocación del push al enviar mensaje (`ChatScreen.tsx`).
- ✅ Handler de primer plano y canal Android (`src/lib/pushSetup.ts`, llamado en
  `App.tsx`): que un push llegue **con la app abierta** se vea.
- ✅ `eas.json` con perfiles de build (`development`, `preview`, `production`).

### Lo que debes hacer (🔑)

#### 1. Proyecto EAS y projectId
1. 🔑 Instala la CLI (una vez): `npm install -g eas-cli`.
2. 🔑 Crea cuenta en <https://expo.dev> y entra: `eas login`.
3. 🔑 En este worktree: `eas init`. Esto crea el proyecto en Expo y te da un
   **Project ID** (un UUID).
4. 🔑 Copia ese Project ID a `.env`:
   ```
   EAS_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
   `app.config.ts` lo lee y `pushTokens.ts` lo usa. Sin él, el registro de push
   se salta en silencio (verás en consola: "Sin projectId de EAS…").

#### 2. Credenciales de push
- **Android (FCM):** al hacer `eas build -p android` (o `eas credentials`),
  EAS gestiona la key de FCM. Con cuenta gratis basta para pruebas internas.
- **iOS (APNs):** requiere cuenta de **Apple Developer** (de pago). `eas
  credentials` genera la push key. iOS **no** recibe push en Expo Go: necesitas
  un development build o TestFlight.

#### 3. Build para probar en el celular
1. 🔑 `eas build --profile preview --platform android` → genera un **APK**
   instalable. (Push nativo **no** funciona en Expo Go moderno; usa un build.)
2. 🔑 Instala el APK en tu teléfono, inicia sesión → se registra el token.

#### 4. Desplegar la Edge Function y sus secretos
1. 🔑 Enlaza el proyecto (una vez): `supabase link --project-ref TU_PROJECT_REF`
   (el ref está en la URL del dashboard).
2. 🔑 Despliega: `supabase functions deploy send-push`.
3. 🔑 La función necesita `SUPABASE_SERVICE_ROLE_KEY` (para leer tokens ajenos).
   `SUPABASE_URL` y `SUPABASE_ANON_KEY` suelen inyectarse solos; si no, agrégalos:
   ```
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
   ```
   La `service_role key` está en **Project Settings > API** del dashboard.
   ⚠️ **Nunca** pongas la `service_role key` en `.env` de la app ni en el cliente:
   solo vive como secreto de la Edge Function.

### Cómo probar el push
1. Con dos cuentas (dos teléfonos, o un teléfono + web), inicia sesión en ambas.
2. Desde una, abre el chat de una mascota de la otra y envía un mensaje.
3. El otro dispositivo debe recibir la notificación "Nuevo mensaje sobre una
   mascota". Si no llega, revisa: token guardado en `push_tokens`, función
   desplegada, y logs con `supabase functions logs send-push`.

---

## C) Avisos que salen de la app (correo + push automáticos)

Esto es distinto de A y B. A es el correo **de auth** (confirmar cuenta) y B es el
push **de mensajes del chat**. Acá hablamos de los avisos que dispara la app sola:
un reporte nuevo en tu zona, alguien que vio a tu mascota, una pista en tu reporte.

### Cómo funciona (arquitectura ya montada)

1. Los **triggers** de `supabase/migrations/0011_avisos.sql` encolan un evento en
   `notification_events` al publicarse un reporte, un avistamiento o una pista.
   El cliente **nunca** escribe en esa cola (si pudiera, cualquiera podría forjar
   avisos hacia otros usuarios).
2. La Edge Function `send-notifications` lee la cola con la `service_role key`,
   decide a quién le toca con `src/lib/notifyTargets.ts` y despacha.
3. Cada persona elige qué recibir y por dónde en **Perfil → Avisos**
   (`src/screens/NotificationPrefsScreen.tsx` → tabla `notification_prefs`).

### Qué ya está cableado (✅)

- ✅ Migración `0011_avisos.sql` (tablas, RLS y triggers encoladores).
- ✅ Lógica de targeting con tests (`src/lib/notifyTargets.ts`,
  `__tests__/lib/notifyTargets.test.ts`).
- ✅ Servicio de preferencias (`src/services/notificationPrefs.ts`) y pantalla
  **Avisos** en Perfil. Si la migración no está aplicada, la pantalla degrada a los
  valores por defecto y no se rompe.
- ✅ Edge Function `supabase/functions/send-notifications/`.

### Lo que debes hacer (🔑)

#### 1. Aplicar la migración
🔑 Pega `supabase/migrations/0011_avisos.sql` en el **SQL Editor** de Supabase y
ejecútalo. Hasta que hagas esto, la pantalla de Avisos muestra los valores por
defecto y no guarda nada (es el comportamiento esperado).

#### 2. Desplegar la función
```bash
supabase link --project-ref TU_PROJECT_REF   # una vez, si no lo hiciste ya
supabase functions deploy send-notifications
```

#### 3. Setear los secretos
```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set RESEND_FROM="Encuentra tu Mascota <no-responder@tudominio.cl>"
supabase secrets set EXPO_PUBLIC_WEB_URL=https://tu-app.netlify.app
```
`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` suelen inyectarse solos; si no:
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
```

> ⚠️ El mismo aviso de la sección A aplica acá: **sin dominio verificado en
> Resend**, el correo solo llega a la dirección de tu cuenta de Resend. Para que
> les llegue a los usuarios de verdad hay que verificar un dominio.

#### 4. Agendarla cada minuto

**Opción a — `pg_cron` (dentro de Supabase).** En el SQL Editor:
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'despachar-avisos',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://TU_PROJECT_REF.functions.supabase.co/send-notifications',
    headers := '{"Content-Type": "application/json",
                 "Authorization": "Bearer TU_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```
Para desagendarla: `select cron.unschedule('despachar-avisos');`

**Opción b — cron externo** (cron-job.org, GitHub Actions, etc.): un `POST` cada
minuto a `https://TU_PROJECT_REF.functions.supabase.co/send-notifications` con el
header `Authorization: Bearer TU_SERVICE_ROLE_KEY`.

### Cómo probar
1. Con la migración aplicada y la función desplegada, publica un reporte desde otra
   cuenta dentro de tu zona de alerta.
2. Mira la cola: `select * from notification_events order by creado_en desc;`
   — debe aparecer una fila `pendiente` y pasar a `enviado` en menos de un minuto.
3. Revisa la bandeja (y **spam**), y los logs con
   `supabase functions logs send-notifications`.

---

## Resumen de variables de entorno

| Variable | Archivo | La consume | Estado |
|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` | `src/lib/env.ts` → `supabase.ts` | ✅ puesta |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` | `src/lib/env.ts` → `supabase.ts` | ✅ puesta |
| `EAS_PROJECT_ID` | `.env` | `app.config.ts` → `src/services/pushTokens.ts` | 🔑 pegar tras `eas init` |
| `SUPABASE_SERVICE_ROLE_KEY` | secreto de Edge Function (no `.env`) | `supabase/functions/send-push/index.ts` | 🔑 `supabase secrets set` |
| (SMTP host/user/pass) | dashboard de Supabase (no `.env`) | Supabase Auth | 🔑 pegar en dashboard |
| `RESEND_API_KEY` | secreto de Edge Function | `send-notifications` (correo de avisos) | 🔑 `supabase secrets set` |
| `RESEND_FROM` | secreto de Edge Function | `send-notifications` (remitente) | 🔑 `supabase secrets set` |
| `EXPO_PUBLIC_WEB_URL` | secreto de Edge Function | `send-notifications` (link del reporte) | 🔑 `supabase secrets set` |

## Checklist rápido
- [ ] Resend/Brevo creado y SMTP pegado en Supabase (🔑 A)
- [ ] (Opcional) Plantillas de correo pegadas + "Confirm email" activado (🔑 A)
- [ ] Dominio verificado en Resend para enviar a cualquier correo (🔑 A)
- [ ] `eas init` + `EAS_PROJECT_ID` en `.env` (🔑 B1)
- [ ] `eas build --profile preview -p android` e instalar APK (🔑 B3)
- [ ] `supabase functions deploy send-push` + `service_role` secret (🔑 B4)
- [ ] Migración `0011_avisos.sql` aplicada en el SQL Editor (🔑 C1)
- [ ] `supabase functions deploy send-notifications` + secretos de Resend (🔑 C2, C3)
- [ ] Despacho agendado cada minuto con `pg_cron` o cron externo (🔑 C4)
