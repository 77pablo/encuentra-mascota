# Estado del proyecto — Encuentra tu Mascota

Última sesión: 2026-07-17 · Rama de trabajo: `feat/mvp-encuentra-mascota` (65 commits, todo commiteado).

## Cómo retomar / probar
- App web (dev): `cd C:\Users\pdani\encuentra-mascota` → `npx expo start --web` → abrir `http://localhost:8091`.
- Login de prueba: `probando779@gmail.com` / `probar123456` (la confirmación de correo está apagada).
- Tests: `npm test` (49 en verde). Typecheck: `npx tsc --noEmit`.

## Qué está hecho
- **MVP completo:** auth, publicar (fotos múltiples + cámara), mapa, lista con filtros + "cerca de mí" + buscador, detalle, chat en tiempo real + bandeja de no leídos, perfil (foto, editar, reunidas, **teléfono + red social**), editar/borrar, compartir con link, denunciar/moderación, recuperar contraseña, privacidad/términos, anti-spam, robustez (carga/error/retry).
- **Rediseño de interfaz v3 "app amable"** aplicado a TODAS las pantallas: verde pino + coral + arena, fuente Hanken Grotesk, saludo/chips/tarjetas/FAB, perrito plano. Verificado con capturas reales.
- Fix importante: pantalla blanca al iniciar sesión (resuelto).

## PENDIENTE — pasos del usuario (necesarios)
1. **Aplicar migraciones en Supabase (SQL Editor):** ya se aplicaron 0002/0003/0004; falta **0005**:
   ```sql
   alter table public.profiles add column if not exists telefono text;
   alter table public.profiles add column if not exists red_social text;
   ```
   (Sin esto, el teléfono/red social del perfil no se guardan.)
2. **Config opcionales (cada una activa algo ya programado):**
   - Correo/SMTP (Resend/Brevo) → confirmación + recuperar clave envían correo. Necesita dominio para enviar a otros; Resend en modo prueba solo envía a tu propio Gmail.
   - Google Maps API key (`GOOGLE_MAPS_API_KEY` en `.env`) → mapa en build Android.
   - Sentry DSN (`EXPO_PUBLIC_SENTRY_DSN`) → monitoreo de errores.
   - `eas init` → push real en el celular.
   - Desplegar la web + `EXPO_PUBLIC_WEB_URL` → links compartidos abren desde afuera.

## Pendientes de diseño/pulido (menores, para la próxima)
- Ocultar los headers de stack redundantes ("Lista", "Mapa", "Perfil", etc.) que aún salen arriba en algunas pestañas (en Inicio ya se ocultó).
- El chip de ubicación "Tu barrio" se corta un poquito a la derecha en el Inicio.
- Revisar detalle/chat/publicar en vivo y afinar espaciados.

## Ideas / siguientes
- Terminar de conectar el push (EAS) y el correo (dominio).
- Fusionar la rama a `master` cuando esté probado (o abrir PR si se crea remoto en GitHub).
- Ver ROADMAP.md para el estado de las 15 mejoras (todas hechas en código).
