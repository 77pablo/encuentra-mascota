# Diseño — App "Encuentra tu Mascota"

**Fecha:** 2026-07-16
**Autor:** Pablo Espinoza
**Estado:** Diseño aprobado (pendiente revisión final antes del plan)

---

## 1. Resumen

App móvil comunitaria para reencontrar mascotas perdidas. Cualquier persona puede
publicar una mascota **perdida** o **encontrada**, con fotos, señas y ubicación en un
mapa. La comunidad ve los reportes cercanos y, al reconocer una mascota, contacta al
autor por un **chat interno**. El match lo hacen las personas (match manual); la app lo
facilita mostrando bien la información y el mapa.

El motor es la **comunidad ayudándose**, no el dinero: la recompensa es un extra opcional,
nunca un requisito, y todos los reportes valen igual (no hay "pagar para destacar").

## 2. Alcance de la v1

**Incluye:**
- Registro / login de usuarios.
- Publicar reporte (perdida/encontrada) con fotos, señas y ubicación en mapa.
- Ver reportes en **mapa** y en **lista con filtros**.
- Detalle de mascota + botón "Contactar".
- **Chat interno en tiempo real** entre usuarios.
- **Notificaciones push** cuando te escriben un mensaje.
- Marcar "ya apareció" para cerrar un reporte.
- Seguridad: RLS, validación de inputs, manejo de secretos.

**Fuera de la v1 (para después):**
- Match automático por características (especie/color/zona) — el modelo de datos ya lo permite.
- Match por foto / IA (reconocimiento facial de mascotas).
- Push de "nueva mascota perdida cerca de ti" (se deja la base preparada).
- Notificaciones por correo.

## 3. Arquitectura y stack

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   App móvil (Expo/RN)    │◄───────►│        Supabase          │
│                          │  HTTPS  │                          │
│  • Pantallas (UI)        │  Realt. │  • Auth (login/registro) │
│  • Mapa (react-native-   │         │  • Postgres (datos)      │
│    maps)                 │         │  • Storage (fotos)       │
│  • Notif. push (Expo)    │         │  • Realtime (chat)       │
│  • Validación (zod)      │         │  • Edge Functions (push) │
└─────────────────────────┘         └──────────────────────────┘
                                              │
                                     GitHub (código + versiones)
```

- **Expo (React Native):** app móvil; se prueba con **Expo Go** (QR) en un teléfono real.
- **Supabase:** Auth, Postgres, Storage (fotos), Realtime (chat). Plan gratuito.
- **react-native-maps:** mapa nativo del teléfono (gratis, sin API key de pago).
- **Notificaciones push de Expo:** avisos con la app cerrada.
- **Edge Functions (Supabase):** lógica sensible del lado servidor (envío de push),
  con rate limiting.
- **GitHub:** repositorio de código.

**Por qué:** Supabase elimina casi todo el backend manual (auth, fotos y chat resueltos)
y Expo permite probar en el teléfono sin publicar en tiendas todavía. Por debajo sigue
siendo Postgres, así que no se pierde potencia.

## 4. Modelo de datos

**`profiles` (usuarios)**
- `id` (uuid, ligado a Supabase Auth)
- `nombre`
- `foto_perfil` (url en Storage)
- `creado_en`
- (contraseña la maneja Supabase Auth, no se guarda aquí)

**`pets` (reportes de mascotas)** — tabla central
- `id`
- `user_id` → profiles
- `estado`: `perdida` | `encontrada`
- `especie`: `perro` | `gato` | `otro`
- `raza` (opcional; texto libre, ej. "quiltro", "no sé")
- `nombre` (opcional)
- `descripcion` / señas (color, tamaño, collar, características)
- `fotos` (una o varias urls en Storage)
- `lat`, `lng` (ubicación para el mapa)
- `recompensa` (opcional; si va vacío, no se muestra)
- `activo` (bool; false = "ya apareció", sale del mapa)
- `creado_en`

**`messages` (chat interno)**
- `id`
- `pet_id` → pets (sobre qué mascota se habla)
- `from_user` → profiles
- `to_user` → profiles
- `texto`
- `leido` (bool)
- `creado_en`

**`push_tokens` (notificaciones)**
- `id`
- `user_id` → profiles
- `token` (token del dispositivo Expo)

**Relaciones:**
```
profiles ──< pets ──< messages
   │
   └──< push_tokens
```

## 5. Pantallas y navegación

```
Entrar / Registrarse
│
└─ App (barra inferior, 4 pestañas):
   ├─ 🗺️  Mapa       → pins de mascotas cercanas; tocar pin → detalle
   ├─ 📋  Lista      → mismos reportes en lista + filtros (estado, especie, cercanía)
   ├─ ➕  Publicar   → foto + señas + ubicación en mapa
   └─ 💬  Mensajes   → chats + perfil / mis reportes
```

**Pantallas de detalle:**
- **Detalle de mascota:** fotos, señas, raza, recompensa (si hay), mini-mapa, botón
  grande "Contactar" (abre chat).
- **Chat:** conversación en tiempo real con el autor.
- **Perfil:** foto, mis reportes activos, botón "ya apareció ✅".

**Flujo estrella — publicar:**
1. Toco ➕ Publicar
2. Elijo perdida o encontrada
3. Subo foto(s)
4. Escribo señas (color, tamaño, collar, raza…)
5. Marco en el mapa dónde fue
6. (Opcional) recompensa
7. Publico → aparece al instante en el mapa de los usuarios cercanos

## 6. Comportamiento (tiempo real, notificaciones, errores)

**Chat en tiempo real:** Supabase Realtime; los mensajes aparecen solos, sin recargar.

**Notificaciones push (Expo):**
- Al iniciar, la app pide permiso y guarda el `push_token` del dispositivo.
- Llega push cuando **te escriben un mensaje** nuevo (enviado desde una Edge Function).
- Preparado para futuro: "nueva mascota perdida cerca de ti".

**Manejo de errores:**
- Sin internet → mensaje "sin conexión" + botón reintentar (no pantalla en blanco).
- Foto pesada → se comprime antes de subir.
- Sin permiso de ubicación → el usuario mueve el pin / escribe la zona a mano.
- Campos vacíos al publicar → avisa qué falta antes de enviar (validación zod).

## 7. Seguridad

Estándar del proyecto (traducido al stack React Native + Supabase; se aplica el
*intento* de cada regla, no la letra pensada para Express):

1. **Rate limiting:** Supabase Auth ya limita login/registro. Las Edge Functions
   (envío de push, acciones sensibles) llevan rate limiting propio y responden **429**
   con mensaje claro al exceder el límite.
2. **Secretos / variables de entorno:** la clave `service_role` **nunca** va en la app
   (solo en Edge Functions). En la app solo la `anon key` (pública por diseño, protegida
   por RLS). Todo en `.env`, con `.env.example` (solo nombres), `.env` en `.gitignore`,
   y **validación al arrancar**: si falta una variable requerida, la app/función no inicia.
3. **Validación de inputs (anti-inyección):** **zod** valida y sanitiza todo input antes
   de enviarlo. Supabase usa **queries parametrizadas** (nada de concatenar SQL). React
   Native no renderiza HTML → superficie XSS casi nula; se prohíben WebViews con HTML
   crudo. Inputs inválidos se **rechazan y loguean**.
4. **Headers de seguridad:** aplican en las **Edge Functions** (CSP, X-Content-Type-Options,
   HSTS, etc.). HTTPS forzado por Supabase de fábrica. La app móvil no sirve HTML, así que
   helmet/CSP no aplica a pantallas.
5. **Autenticación y sesiones:** Supabase Auth hashea contraseñas con **bcrypt**. El token
   de sesión se guarda en **expo-secure-store** (almacenamiento cifrado del teléfono),
   nunca en texto plano. CSRF casi no aplica (auth por token, no cookies).
6. **Logging de seguridad:** se loguean intentos fallidos de login, golpes de rate limit e
   inputs rechazados. **Nunca** se loguean contraseñas, tokens ni datos personales.
7. **Row Level Security (RLS):** activo desde el inicio. Un usuario solo puede
   editar/borrar **sus propios** reportes y leer **sus propios** mensajes. Las fotos en
   Storage tienen reglas de acceso.
8. **Privacidad de contacto:** el teléfono no se muestra; el contacto es **solo** por chat
   interno.

## 8. Pruebas

- **Manuales en teléfono real** con Expo Go (QR).
- **Datos de prueba:** 2 usuarios y reportes falsos para probar match y chat.
- **Checklist por función:** publicar → aparece en mapa → otro usuario contacta → llega
  chat en tiempo real → llega push → marcar "ya apareció" → desaparece del mapa.
- **Pruebas de seguridad:** verificar que un usuario NO pueda borrar/editar el reporte de
  otro (RLS), que inputs inválidos se rechacen, y que la app no inicie sin variables de
  entorno requeridas.

## 9. Fuera de alcance / decisiones tomadas

- **Match manual** en v1 (no automático, no IA).
- **Mapa con react-native-maps** (no Google Maps de pago).
- **Supabase** en vez de Neon (Neon es solo DB; Supabase trae auth + fotos + chat).
- **Recompensa opcional**, nunca obligatoria; la app es comunitaria.
