# Edge Function `send-notifications`

Despacha los avisos que salen de la app: correo (Resend) y push (Expo).

## Cómo funciona

1. Los **triggers** de la migración `0011_avisos.sql` encolan un evento en
   `notification_events` cada vez que se publica un reporte (`pets`), se marca un
   avistamiento (`sightings`) o se deja una pista (`pet_tips`). El cliente nunca
   escribe en esa tabla: si pudiera, cualquiera podría forjar avisos hacia otros.
2. Esta función corre con la **service role key** (la tabla no tiene ninguna
   política de RLS, así que es invisible desde la app) y lee hasta 50 eventos
   `pendiente` ordenados por antigüedad.
3. Para cada evento arma el contexto (dueño y nombre del reporte, zonas de alerta
   activas, preferencias de los candidatos) y llama a `resolverDestinatarios` y
   `componerAviso`.
4. Despacha y marca el evento como `enviado`. Si falla, suma `intentos` y lo deja
   `pendiente`; a los **3 intentos** queda en `error` para que la cola no se trabe.

Si un canal no tiene su configuración (por ejemplo, falta `RESEND_API_KEY`), ese
canal se salta en silencio y el otro igual se envía.

## ⚠️ `notifyTargets.ts` está espejado

`notifyTargets.ts` de esta carpeta es una **copia** de `src/lib/notifyTargets.ts`
(más `distanceKm` de `src/lib/geo.ts`, inlineado). Se duplica porque el runtime de
Deno solo empaqueta lo que está dentro de la carpeta de la función y no puede
importar desde `src/`.

**Si cambiás una regla de targeting, cambiala en los dos archivos.** Los tests que
cubren esas reglas viven en `__tests__/lib/notifyTargets.test.ts`.

## Variables de entorno

| Variable | Para qué | Si falta |
|---|---|---|
| `SUPABASE_URL` | cliente de Supabase | la función no arranca (suele inyectarse sola) |
| `SUPABASE_SERVICE_ROLE_KEY` | leer la cola y los tokens de push | la función no arranca |
| `RESEND_API_KEY` | enviar correo | el canal correo se salta |
| `RESEND_FROM` | remitente del correo | el canal correo se salta |
| `EXPO_PUBLIC_WEB_URL` | armar el link del reporte | el link queda relativo |

## Desplegar

Ver la sección **C) Avisos que salen de la app** de `SETUP-PUSH-CORREO.md`, en la
raíz del repo, con los comandos exactos y cómo agendarla.
