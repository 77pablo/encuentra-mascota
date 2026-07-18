# Estado del proyecto — Encuentra tu Mascota

Última sesión: 2026-07-18 · Rama de trabajo: `feat/mvp-encuentra-mascota`. El repo no tiene remoto en GitHub todavía. ✅ **`master` ya tiene TODO fusionado** (merge local `--no-ff`; ambas ramas idénticas en `a657fe7`), incluidas las 3 funciones nuevas de esta sesión (alertas por zona, visto por acá, reencuentro).

## Cómo retomar / probar
- App web (dev): `cd C:\Users\pdani\encuentra-mascota` → `npx expo start --web` → abrir `http://localhost:8091`.
- Login de prueba: `probando779@gmail.com` / `probar123456` (la confirmación de correo está apagada).
- Tests: `npm test` (**130 en verde**, 20 suites). Typecheck: `npx tsc --noEmit` (0 errores).

## Qué está hecho
- **MVP completo:** auth, publicar (fotos múltiples + cámara), mapa, lista con filtros + "cerca de mí" + buscador, detalle, chat en tiempo real + bandeja de no leídos, perfil (foto, editar, reunidas, **teléfono + red social**), editar/borrar, compartir con link, denunciar/moderación, recuperar contraseña, privacidad/términos, anti-spam, robustez (carga/error/retry).
- **Rediseño de interfaz v3 "app amable"** aplicado a TODAS las pantallas: verde pino + coral + arena, fuente Hanken Grotesk, saludo/chips/tarjetas/FAB, perrito plano.
- **Pulido de UI (jul-17):** ocultos los headers de stack redundantes en Mapa/Lista/Conversaciones/Perfil; arreglado el chip "Tu barrio" que se cortaba; afinados espaciados en detalle/chat/publicar.
- **Función nueva: "Coincidencias perdido↔encontrado"** — en el detalle sugiere reportes del estado opuesto, misma especie (comodín "otro"), a ≤15 km, ordenados por cercanía. Lógica pura en `src/lib/matches.ts` con tests. No requiere migración ni config.
- **Función nueva (jul-18): "Afiche imprimible con QR"** — en el detalle de un reporte **propio** aparece el botón **"Crear afiche"**: genera un PNG (proporción carta) con foto, datos, recompensa, tu WhatsApp y un **QR** al reporte, para pegar en la calle o mandar por WhatsApp. En web descarga el PNG; en nativo abre la hoja de compartir. Guardia: si tu perfil no tiene WhatsApp, te lleva a completarlo. Archivos: `src/lib/afiche.ts` (+tests), `src/lib/qr.ts`+`QrCode.tsx`, `AfichePoster.tsx`, `aficheImage.ts`, `AficheGenerator.tsx`, botón en `PetDetailScreen.tsx`. Deps nuevas: `qrcode-generator`, `react-native-view-shot`, `expo-sharing`. Sin migración. Spec/plan en `docs/superpowers/`. Desarrollado con subagentes + revisión final (opus) "Ready to merge".
  - ⚠️ **Pendiente prueba visual (tuya, ~2 min):** verificado por tests (78/78) + typecheck + revisiones, pero el render real no se ejercitó en navegador (no había reporte de la cuenta de prueba y no quisimos escribir en prod). Para probar: abrí **un reporte tuyo** → **Crear afiche** → confirmá que el PNG se descarga, se ve bien y que el QR (con la web ya desplegada) abre el reporte. Recordá tener **WhatsApp cargado en tu perfil**.
  - Nota build nativo: `expo-sharing` trae un config plugin que no se auto-registró en `app.config.ts` (no afecta web ni el compartir saliente); si más adelante armás el build EAS, revisá si hace falta agregarlo.
- **3 funciones nuevas (jul-18), construidas en paralelo con 3 subagentes (una rama/worktree c/u) y fusionadas:**
  - **Alertas por zona** (`feat/alertas-zona` → migración `0006_alertas_zona.sql`): el usuario fija centro (su ubicación) + radio (chips 2/5/10 km) en Perfil → "Mi zona de alerta"; banner in-app amable en Inicio cuando hay reportes nuevos cerca desde su última visita. Push real NO cableado (queda `TODO(push)`); el aviso in-app degrada sin config. Lógica pura en `src/lib/alerts.ts` + `lastVisit.ts`, servicio `alertZones.ts`, `useZoneAlert`, `ZoneAlertBanner`, `AlertZoneScreen`. **Verificado en navegador** (pantalla se ve bien).
  - **Visto por acá** (`feat/visto-por-aca` → migración `0007_avistamientos.sql`): en el detalle, cualquiera marca dónde vio a la mascota (mapa + mi ubicación + nota/foto opcional) → rastro de avistamientos con pines secundarios (color sol) y resumen ("Último avistamiento a 1,2 km · hace 3 h"). `src/lib/sightings.ts`, `services/sightings.ts`, `AddSightingScreen`, sección en `PetDetailScreen`. RLS: borra el autor o el dueño del reporte.
  - **Verificación de reencuentro / final feliz** (`feat/reencuentro` → migración `0008_final_feliz.sql`, agrega columnas `reunida_en`/`final_feliz`/`final_foto` a `pets`): botón "¡Volvió a casa!" (solo dueño) → confirmación con nota+foto feliz opcionales → `markReunited` + **Confetti** + tarjeta de final feliz; badge "Final feliz" al ver un reporte ya reunido; tira "Finales felices" en Inicio. `src/lib/reunion.ts`, `services/reunions.ts`.
  - ⚠️ **Fix de integración (jul-18):** la tira "Finales felices" en Inicio degrada a vacío si su consulta falla (p. ej. migración 0008 sin aplicar), para no tumbar toda la pantalla de Inicio. Detectado en la verificación web.
  - ✅ **Prueba visual end-to-end HECHA (2026-07-18):** con Playlist/Playwright en el navegador se publicó un reporte de prueba y se ejercitó TODO con datos reales: **Visto por acá** (avistamiento creado → rastro con distancia "a 1,4 km" + resumen "Último avistamiento"), **¡Volvió a casa!** (panel de confirmación → **Confetti** animado → tarjeta "FINAL FELIZ" → aparece en la tira "Finales felices" de Inicio + "Ya van 1 vuelta a casa"), y "Mi zona de alerta". El reporte de prueba, su foto y avistamientos se borraron después (base limpia). Confirmado que `reunida_en` persiste en la base.
- **Guía de setup push/correo:** ver `SETUP-PUSH-CORREO.md` (pasos exactos + `eas.json` + plantillas de correo + handler de notificaciones en primer plano).
- Fix importante: pantalla blanca al iniciar sesión (resuelto).

## PENDIENTE — pasos del usuario (necesarios)
0. ~~Aplicar las 3 migraciones nuevas~~ — ✅ **APLICADAS y VERIFICADAS (2026-07-18)**: `0006` (tabla `alert_zones`), `0007` (tabla `sightings`), `0008` (columnas `reunida_en`/`final_feliz`/`final_foto` en `pets`). Verificado contra la base real vía API REST (esquema completo + RLS OK) y con prueba visual end-to-end en el navegador (ver abajo).
1. ~~Migración 0005~~ — ✅ **APLICADA (2026-07-17)**: columnas `telefono` y `red_social` en `public.profiles`. El teléfono/red social del perfil ya se guardan.
2. **Config opcionales (cada una activa algo ya programado):**
   - ~~Correo/SMTP~~ — ✅ **CONFIGURADO (2026-07-17)**: Resend SMTP en Supabase, remitente `onboarding@resend.dev`. Registro + "olvidé mi clave" envían correo y el enlace abre la pantalla de nueva clave (se corrigió `detectSessionInUrl` en web). **En modo prueba solo entrega a `pdanielespinozavega@gmail.com`**; para enviar a cualquiera falta **verificar un dominio** en Resend y cambiar el sender. "Confirm email" sigue APAGADO.
   - Push real → `eas init` + `EAS_PROJECT_ID` en `.env` + build APK + deploy de la Edge Function `send-push`. Ver `SETUP-PUSH-CORREO.md`.
   - Google Maps API key (`GOOGLE_MAPS_API_KEY` en `.env`) → mapa en build Android.
   - Sentry DSN (`EXPO_PUBLIC_SENTRY_DSN`) → monitoreo de errores.
   - Desplegar la web + `EXPO_PUBLIC_WEB_URL` → links compartidos abren desde afuera.

## Ideas / siguientes
- **Probar el afiche en el navegador** (ver ⚠️ arriba) y, si todo bien, dar por cerrada la función.
- ~~alertas por zona · "visto por acá" · verificación de reencuentro~~ ✅ **CONSTRUIDAS y verificadas (jul-18)**, ver arriba.
- ~~Fusionar `feat/mvp-encuentra-mascota` → `master`~~ ✅ **HECHO (jul-18)**.
- Crear remoto en GitHub y `push -u origin master` cuando quieras respaldo/PRs.
- Terminar de conectar el push (EAS) y el correo (dominio) siguiendo `SETUP-PUSH-CORREO.md`.
- Ver ROADMAP.md para el estado de las 15 mejoras (todas hechas en código).
