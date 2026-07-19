# Los 12 testers de Google Play — guía práctica

Esto **no se arregla programando**: hace falta que 12 personas reales acepten y se queden 14
días. Es el camino crítico de todo el lanzamiento en Android, así que conviene empezar antes
de que el código esté listo.

## La regla, en corto

Google exige que las cuentas de desarrollador **personales** (no de empresa) creadas después
del 13 de noviembre de 2023 corran un **testing cerrado con 12 testers activos durante 14
días consecutivos** antes de poder publicar en producción.

Lo que hay que saber para no perder tiempo:

- Son **12 al mismo tiempo**, no 12 en total a lo largo del tiempo.
- Los **14 días son consecutivos**. Si un tester se sale, el contador se rompe y **los días no
  se acumulan**: se vuelve a empezar.
- Hace falta que tengan la app **instalada**, no solo que acepten la invitación.
- Después de los 14 días se pide producción desde Play Console (**"Apply for production"**),
  con un cuestionario de 3 partes. La respuesta suele tardar hasta 7 días.
- **Total realista: ~21 días** desde que empieza el testing hasta poder publicar.

⚠️ Verificar la regla en la fuente antes de empezar, porque Google la ha ido cambiando:
https://support.google.com/googleplay/android-developer/answer/14151465

## Qué necesitas de cada persona

Solo una cosa: **el correo de su cuenta de Google** (el de su teléfono Android). Con eso los
agregas a la lista de testers en Play Console.

**Tienen que tener Android.** Alguien con iPhone no sirve para esto.

## A quién pedirle (apunta a 15, no a 12)

Pide de más: siempre hay quien acepta y no instala. Con 15 confirmados llegas a 12 activos.

Gente que suele funcionar para esto:
- Familia y amigos cercanos con Android.
- Compañeros de trabajo o de estudio.
- Un grupo de WhatsApp de la junta de vecinos o del edificio — **y acá hay una ventaja: son
  justamente el público de la app**, así que el feedback sirve de verdad.
- Grupos de rescate de animales o veterinarias del barrio: les interesa el tema.

## Mensaje para mandar por WhatsApp

> Hola! Estoy por lanzar una app que hice, se llama [[NOMBRE]] y sirve para encontrar
> mascotas perdidas en el barrio: publicas al perro o gato que se perdió, aparece en un mapa,
> y los vecinos pueden avisarte si lo vieron.
>
> Para poder publicarla en Google Play necesito 12 personas que la prueben durante 2 semanas.
> Es literalmente instalarla y dejarla ahí — no tienes que hacer nada más, aunque si la
> pruebas y me dices qué te parece, mejor todavía.
>
> ¿Me pasas el correo de tu cuenta de Google (el de tu celular Android)? Con eso te mando la
> invitación.
>
> Es gratis y la puedes desinstalar cuando quieras después de las 2 semanas. Gracias!

Y cuando ya tengas el enlace de prueba:

> Listo, acá está el link para instalarla: [[ENLACE]]
>
> Ábrelo con el mismo correo de Google que me pasaste, dale a "Convertirme en tester" y
> después instala desde Play Store como cualquier app.
>
> Un favor importante: **no la desinstales durante 2 semanas**, aunque no la uses. Google
> cuenta los días seguidos y si alguien se sale tengo que empezar de nuevo 🙏

## Planilla de seguimiento

Copia esto y ve llenándolo. La fecha de inicio real es cuando el **doceavo** ya está dentro.

| # | Nombre | Correo de Google | ¿Aceptó? | ¿Instaló? | Fecha |
|---|--------|------------------|----------|-----------|-------|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
| 4 |  |  |  |  |  |
| 5 |  |  |  |  |  |
| 6 |  |  |  |  |  |
| 7 |  |  |  |  |  |
| 8 |  |  |  |  |  |
| 9 |  |  |  |  |  |
| 10 |  |  |  |  |  |
| 11 |  |  |  |  |  |
| 12 |  |  |  |  |  |
| 13 | *(de repuesto)* |  |  |  |  |
| 14 | *(de repuesto)* |  |  |  |  |
| 15 | *(de repuesto)* |  |  |  |  |

- **Día 1 del conteo:** ____________
- **Día 14 (se puede pedir producción):** ____________

## Lo que hay que tener listo antes de invitarlos

No se puede empezar sin esto:

1. **Cuenta de desarrollador de Google Play** — US$25 pago único, con verificación de
   identidad: **cédula y tarjeta a nombre de Pablo Espinoza**, y los datos tienen que
   coincidir exactamente. Si los rechazan, **la tarifa no se devuelve**. No aceptan tarjetas
   prepago.
2. **Un build de Android (`.aab`)** subido a un canal de prueba cerrada. Hoy solo tenemos la
   web: falta `eas build`, que además necesita `eas init` (pendiente).
3. **Política de privacidad en una URL pública** — es la tanda C.
4. Los requisitos bloqueantes de la tanda B (bloquear usuarios, denuncias completas, página
   web de borrado de cuenta, permisos).

O sea: **juntar los correos se puede hacer desde ya**, en paralelo, pero la invitación no se
puede mandar hasta tener el `.aab` y la cuenta. Por eso conviene ir juntando la gente ahora.

## Alternativa, por si se hace cuesta arriba

Registrarse como **Organización** en vez de persona natural elimina el requisito de los 12
testers. A cambio pide una entidad legal y un número **D-U-N-S**, con su propia verificación.
Si juntar 12 personas resulta imposible, vale la pena comparar; si no, sale más barato juntar
a los 12.

---

Nota: en **App Store no existe este requisito**. Apple revisa en 24-48 horas típicas. El
cuello de botella es solo Android.
