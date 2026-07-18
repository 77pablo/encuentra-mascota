# Estado del proyecto — Encuentra tu Mascota

Última sesión: 2026-07-18 · Rama de trabajo: `feat/mvp-encuentra-mascota`. **`master` ya tiene todo fusionado** (merge local `--no-ff`; ambas ramas en `696c10c`; el repo no tiene remoto en GitHub todavía).

## Cómo retomar / probar
- App web (dev): `cd C:\Users\pdani\encuentra-mascota` → `npx expo start --web` → abrir `http://localhost:8091`.
- Login de prueba: `probando779@gmail.com` / `probar123456` (la confirmación de correo está apagada).
- Tests: `npm test` (**58 en verde**). Typecheck: `npx tsc --noEmit`.

## Qué está hecho
- **MVP completo:** auth, publicar (fotos múltiples + cámara), mapa, lista con filtros + "cerca de mí" + buscador, detalle, chat en tiempo real + bandeja de no leídos, perfil (foto, editar, reunidas, **teléfono + red social**), editar/borrar, compartir con link, denunciar/moderación, recuperar contraseña, privacidad/términos, anti-spam, robustez (carga/error/retry).
- **Rediseño de interfaz v3 "app amable"** aplicado a TODAS las pantallas: verde pino + coral + arena, fuente Hanken Grotesk, saludo/chips/tarjetas/FAB, perrito plano.
- **Pulido de UI (jul-17):** ocultos los headers de stack redundantes en Mapa/Lista/Conversaciones/Perfil; arreglado el chip "Tu barrio" que se cortaba; afinados espaciados en detalle/chat/publicar.
- **Función nueva: "Coincidencias perdido↔encontrado"** — en el detalle sugiere reportes del estado opuesto, misma especie (comodín "otro"), a ≤15 km, ordenados por cercanía. Lógica pura en `src/lib/matches.ts` con tests. No requiere migración ni config.
- **Función nueva (jul-18): "Afiche imprimible con QR"** — en el detalle de un reporte **propio** aparece el botón **"Crear afiche"**: genera un PNG (proporción carta) con foto, datos, recompensa, tu WhatsApp y un **QR** al reporte, para pegar en la calle o mandar por WhatsApp. En web descarga el PNG; en nativo abre la hoja de compartir. Guardia: si tu perfil no tiene WhatsApp, te lleva a completarlo. Archivos: `src/lib/afiche.ts` (+tests), `src/lib/qr.ts`+`QrCode.tsx`, `AfichePoster.tsx`, `aficheImage.ts`, `AficheGenerator.tsx`, botón en `PetDetailScreen.tsx`. Deps nuevas: `qrcode-generator`, `react-native-view-shot`, `expo-sharing`. Sin migración. Spec/plan en `docs/superpowers/`. Desarrollado con subagentes + revisión final (opus) "Ready to merge".
  - ⚠️ **Pendiente prueba visual (tuya, ~2 min):** verificado por tests (78/78) + typecheck + revisiones, pero el render real no se ejercitó en navegador (no había reporte de la cuenta de prueba y no quisimos escribir en prod). Para probar: abrí **un reporte tuyo** → **Crear afiche** → confirmá que el PNG se descarga, se ve bien y que el QR (con la web ya desplegada) abre el reporte. Recordá tener **WhatsApp cargado en tu perfil**.
  - Nota build nativo: `expo-sharing` trae un config plugin que no se auto-registró en `app.config.ts` (no afecta web ni el compartir saliente); si más adelante armás el build EAS, revisá si hace falta agregarlo.
- **Guía de setup push/correo:** ver `SETUP-PUSH-CORREO.md` (pasos exactos + `eas.json` + plantillas de correo + handler de notificaciones en primer plano).
- Fix importante: pantalla blanca al iniciar sesión (resuelto).

## PENDIENTE — pasos del usuario (necesarios)
1. ~~Migración 0005~~ — ✅ **APLICADA (2026-07-17)**: columnas `telefono` y `red_social` en `public.profiles`. El teléfono/red social del perfil ya se guardan.
2. **Config opcionales (cada una activa algo ya programado):**
   - ~~Correo/SMTP~~ — ✅ **CONFIGURADO (2026-07-17)**: Resend SMTP en Supabase, remitente `onboarding@resend.dev`. Registro + "olvidé mi clave" envían correo y el enlace abre la pantalla de nueva clave (se corrigió `detectSessionInUrl` en web). **En modo prueba solo entrega a `pdanielespinozavega@gmail.com`**; para enviar a cualquiera falta **verificar un dominio** en Resend y cambiar el sender. "Confirm email" sigue APAGADO.
   - Push real → `eas init` + `EAS_PROJECT_ID` en `.env` + build APK + deploy de la Edge Function `send-push`. Ver `SETUP-PUSH-CORREO.md`.
   - Google Maps API key (`GOOGLE_MAPS_API_KEY` en `.env`) → mapa en build Android.
   - Sentry DSN (`EXPO_PUBLIC_SENTRY_DSN`) → monitoreo de errores.
   - Desplegar la web + `EXPO_PUBLIC_WEB_URL` → links compartidos abren desde afuera.

## Ideas / siguientes
- **Probar el afiche en el navegador** (ver ⚠️ arriba) y, si todo bien, dar por cerrada la función.
- Otras funciones brainstormeadas y aún NO construidas (una por una): **alertas por zona**, **"visto por acá"** (avistamientos en el mapa), **verificación de reencuentro** (final feliz). (`recompensa` ya estaba hecha.)
- Crear remoto en GitHub y `push -u origin master` cuando quieras respaldo/PRs.
- Terminar de conectar el push (EAS) y el correo (dominio) siguiendo `SETUP-PUSH-CORREO.md`.
- Ver ROADMAP.md para el estado de las 15 mejoras (todas hechas en código).
