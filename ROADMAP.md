# Roadmap — Encuentra tu Mascota (v2)

Mejoras acordadas (1–15). Estado: ⬜ pendiente · 🔨 en curso · ✅ listo · 🔑 necesita cuenta/llave del usuario.

## Producto core
- ✅ **#1 Ubicación "cerca de mí" + filtro por especie** — filtrar/ordenar por distancia; chips de especie.
- ✅ **#5 "Hace cuánto" + fecha del reporte** — mostrar tiempo relativo y última ubicación.
- ✅ **#9 Buscar por texto** — nombre, raza, color.
- ✅ **#10 Perfil completo** — foto de perfil, editar perfil, historial de reportes resueltos.
- ⬜ **#11 Robustez** — estados de carga/error con reintentar; manejo sin internet.
- ✅ **#14 Anti-spam** — límite de reportes por usuario/tiempo.
- ✅ **#12 Tests** — cubrir updatePet, deletePet, listLostBySpecies, listConversations.

## Seguridad y confianza
- ⬜ **#4 Moderación / denunciar** — botón denunciar + tabla + ocultar + admin mínimo.
- ⬜ **#6 Privacidad y términos** — pantallas + textos (revisar legalmente).
- ⬜ **#2 Recuperar contraseña** — flujo "olvidé mi clave" (envía correo → necesita #3).

## Infra y distribución (necesitan cuenta/llave)
- 🔑 **#7 Link compartible** — deep links + ficha pública; requiere desplegar la web.
- 🔑 **#3 Correo/SMTP** — SMTP propio (Resend) + confirmación de correo ON.
- 🔑 **#8 Notificaciones** — indicador de no leídos (programable) + push real (necesita EAS).
- 🔑 **#13 Sentry** — monitoreo de errores (necesita DSN).
- 🔑 **#15 Google Maps key** — mapa en Android nativo.

---
Rama: `feat/mvp-encuentra-mascota`. Se construye por fases, probando cada una.
