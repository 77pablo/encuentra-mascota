import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Screen, Title } from '../ui';
import { Colors, radius, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// Política de privacidad y Términos de uso que se muestran DENTRO de la app.
//
// Este archivo es la versión de pantalla de los documentos largos que viven en
// `docs/legal/politica-privacidad.md` y `docs/legal/terminos-de-uso.md`, escritos
// con la Ley 21.719 a la vista. Si cambia uno, hay que cambiar el otro: no puede
// decir una cosa el documento y otra la app.
//
// Criterio de redacción: formal y completo, pero legible. No se usa jerga
// impenetrable a propósito — la Ley 21.719 exige información "clara" y los
// revisores de App Store y Play rechazan las políticas genéricas o confusas.
const ULTIMA_ACTUALIZACION = '27 de julio de 2026';
const VERSION = '2.0';

// PENDIENTE: falta definir el correo de contacto de la app. Mientras no exista,
// no se promete ningún canal por escrito: las secciones que dependen de él
// muestran, en su lugar, la vía que sí funciona hoy (la de la propia app).
// Ambas tiendas EXIGEN un contacto del desarrollador, así que esto sigue
// bloqueando la publicación en App Store y Google Play.
const CORREO_CONTACTO: string | null = null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  // Subcomponente a nivel de módulo: no puede leer el `styles` de
  // LegalScreen (es local a ese componente), así que resuelve sus propios
  // colores y estilos con el mismo `crearEstilos`.
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <View style={styles.section}>
      <Title size={18} style={styles.sectionTitle}>
        {title}
      </Title>
      {children}
    </View>
  );
}

function Sub({ title }: { title: string }) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <AppText size={15} style={styles.sub}>
      {title}
    </AppText>
  );
}

function P({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <AppText size={14} style={styles.paragraph}>
      {children}
    </AppText>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <AppText style={styles.item} size={14}>
      {'•  '}
      {children}
    </AppText>
  );
}

/** Bloque destacado: para lo que el usuario no debería pasar por alto. */
function Nota({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <View style={styles.nota}>
      <AppText size={14} style={styles.paragraph}>
        {children}
      </AppText>
    </View>
  );
}

/** Fila etiqueta/valor, para lo que en el documento largo es una tabla. */
function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <View style={styles.dato}>
      <AppText size={13} style={styles.datoEtiqueta}>
        {etiqueta}
      </AppText>
      <AppText size={14} style={styles.paragraph}>
        {children}
      </AppText>
    </View>
  );
}

/** Canal de contacto: no promete un correo que todavía no existe. */
function Canal({ para }: { para: string }) {
  if (CORREO_CONTACTO) {
    return (
      <P>
        Para {para}, escríbenos a {CORREO_CONTACTO}. Contesta una persona.
      </P>
    );
  }
  return (
    <P>
      Todavía no publicamos un correo de contacto, y preferimos no prometerte un canal que
      hoy no atenderíamos. Mientras tanto, lo que puedes resolver por tu cuenta está en la
      app: Perfil → Editar perfil, Perfil → Avisos y Perfil → Borrar mi cuenta. Habrá un
      correo publicado acá antes de que la app llegue a App Store y Google Play, porque ambas
      tiendas lo exigen.
    </P>
  );
}

export default function LegalScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText muted size={12}>
          Última actualización: {ULTIMA_ACTUALIZACION} · Versión {VERSION}
        </AppText>
        <AppText muted size={12} style={styles.disclaimer}>
          Esto no es asesoría legal. Es un texto escrito en serio, con la Ley 21.719 de Chile a
          la vista, para que se entienda de verdad cómo funciona la app y qué pasa con tus
          datos. Antes de publicarlo en las tiendas debería revisarlo un abogado.
        </AppText>

        {/* ------------------------------------------------------------------ */}
        <Title size={22} style={styles.mainTitle}>
          Política de privacidad
        </Title>

        <Section title="Léelo en 30 segundos">
          <Item>
            Publicamos tu reporte para que tus vecinos lo vean. Ese es todo el producto.
          </Item>
          <Item>
            Tu teléfono y tu red social son privados: solo los ves tú. No los publicamos, no
            los vendemos y no se los damos a nadie.
          </Item>
          <Item>
            La ubicación que se ve en el mapa no es la exacta: la movemos al azar unos 250
            metros, y la precisa no se guarda en ninguna parte.
          </Item>
          <Item>
            Tus conversaciones del chat no las leemos. Solo se revisa un hilo puntual si
            alguien lo denuncia.
          </Item>
          <Item>La app es gratis y sin publicidad. No te rastreamos entre sitios ni apps.</Item>
          <Item>
            Puedes borrar tu cuenta desde la app cuando quieras, sin pedirle permiso a nadie.
          </Item>
          <P>
            Lo que sigue es lo mismo, pero completo, porque la ley pide que esté todo escrito.
          </P>
        </Section>

        <Section title="1. Quién trata tus datos">
          <Dato etiqueta="Responsable">Pablo Espinoza, persona natural, domiciliado en Chile.</Dato>
          <Dato etiqueta="Qué es la app">
            Un servicio comunitario y gratuito para reunir mascotas perdidas o encontradas con
            su familia, y para difundir mascotas en adopción.
          </Dato>
          <Dato etiqueta="Dónde corre">
            En internet (sitio web) y como aplicación móvil. La base de datos, las cuentas y
            las fotos están alojadas en Supabase.
          </Dato>
          <Dato etiqueta="Delegado de protección de datos">
            No hay: la app la opera una sola persona, y esa persona es la que responde.
          </Dato>
          <Canal para="cualquier duda sobre tus datos" />
        </Section>

        <Section title="2. Qué datos tratamos y para qué">
          <Sub title="2.1 Cuando creas una cuenta" />
          <Item>
            Correo electrónico: identifica tu cuenta, te deja entrar y recuperar la contraseña.
            Se conserva mientras tengas cuenta.
          </Item>
          <Item>
            Contraseña: nunca la vemos. Se guarda con un hash irreversible; no es recuperable,
            solo reemplazable.
          </Item>
          <Item>
            Nombre: firma tus reportes, pistas y mensajes, para que tus vecinos sepan con quién
            están hablando.
          </Item>
          <Item>
            Fecha de nacimiento: solo para verificar la edad mínima. Es privada, no aparece en
            tu perfil y no la ve ningún otro usuario.
          </Item>
          <Item>
            Foto de perfil, teléfono y red social: son opcionales, se basan en tu
            consentimiento y los puedes borrar cuando quieras.
          </Item>
          <Nota>
            Tu teléfono y tu red social son privados. Nuestro servidor no permite que nadie los
            lea, salvo tú. No es una promesa de buena voluntad: es un permiso a nivel de
            columna en la base de datos. Ni otro usuario con cuenta, ni alguien que use nuestra
            API por fuera de la app, puede pedirlos. Distinto es el afiche imprimible: si tú
            pones ahí tu teléfono y lo compartes o lo pegas en un poste, esa ya es una decisión
            tuya y sale de nuestro control.
          </Nota>

          <Sub title="2.2 Cuando publicas un reporte" />
          <Item>
            Fotos de la mascota, descripción, especie, raza, color y nombre: para que la
            reconozcan y la busquen.
          </Item>
          <Item>Ubicación aproximada: para mostrar el reporte a la gente que vive cerca.</Item>
          <Item>Recompensa, si decides ofrecer una: es un dato informativo que publicas tú.</Item>
          <Item>
            Fechas del reporte y de su última actualización: para ordenarlos y saber si siguen
            vigentes.
          </Item>
          <Nota>
            La ubicación que se publica no es la exacta. Antes de guardarla la desplazamos a una
            distancia y en una dirección elegidas al azar, dentro de un radio de unos 250
            metros, y la coordenada precisa no se guarda en ninguna parte: ni en la base de
            datos, ni en un registro, ni “por si acaso”. Lo que no se guarda no se puede
            filtrar ni pedir por orden judicial. Lo hacemos porque el reporte es público y se ve
            sin cuenta: publicar el punto exacto sería publicar en un mapa abierto la cuadra
            donde vives. Y desplazamos al azar en vez de redondear, porque el redondeo se puede
            revertir cruzando varios reportes de la misma persona.
          </Nota>
          <Nota>
            Las fotos se recomprimen antes de subirse, y ese proceso elimina los metadatos EXIF,
            incluidas las coordenadas GPS que tu teléfono le pone a cada foto. Sin esto, la foto
            delataría tu casa con mucha más precisión que el mapa.
          </Nota>

          <Sub title="2.3 Cuando participas: pistas, avistamientos y mensajes" />
          <Item>
            Pistas que dejas en reportes ajenos: ayudan a quien busca. Si borras tu cuenta, la
            pista sobrevive firmada como “Un vecino”, sin tu nombre ni tu foto.
          </Item>
          <Item>
            Avistamientos: la ubicación, la nota y la foto opcional arman el rastro de dónde
            estuvo la mascota. Esa ubicación también se difumina 250 metros.
          </Item>
          <Item>
            Novedades del reporte: las publica su dueño para contar cómo va la búsqueda.
          </Item>
          <Item>
            Reportes guardados y favoritos: son tu lista privada de seguimiento. Nadie ve qué
            guardaste.
          </Item>
          <Nota>
            Sobre el chat, para que quede claro: guardamos los mensajes por una sola razón, que
            es que ustedes puedan seguir la conversación y coordinar la entrega de la mascota.
            No los leemos, no los analizamos, no los usamos para publicidad ni para entrenar
            nada. La única excepción es que alguien denuncie una conversación: en ese caso una
            persona revisa ese hilo puntual, únicamente para poder moderarlo, y esa revisión
            queda registrada con fecha y motivo. Tus mensajes tampoco son visibles para otros
            usuarios: solo para ti y para la persona con la que estás hablando.
          </Nota>

          <Sub title="2.4 Avisos" />
          <Item>
            Tus preferencias de avisos: para mandarte solo lo que pediste, por el canal que
            elegiste.
          </Item>
          <Item>
            Tu zona de alerta, si la configuras: para avisarte cuando aparece un reporte cerca
            tuyo. Es opcional.
          </Item>
          <Item>
            El identificador de notificaciones de tu dispositivo o navegador: para que el aviso
            llegue. Lo borramos cuando desactivas los avisos en ese dispositivo.
          </Item>

          <Sub title="2.5 Moderación y seguridad" />
          <Item>
            Denuncias: qué se denunció, por qué y cuándo. Nos permiten revisar y actuar sobre
            contenido o conductas que rompen las reglas.
          </Item>
          <Item>
            Registro de las acciones de moderación: qué se retiró, cuándo y por qué. Es la
            prueba de que actuamos con diligencia cuando nos avisaron.
          </Item>
          <Item>
            Registros técnicos del hosting y de la base de datos: para detectar abuso y ataques,
            y para depurar errores.
          </Item>
          <P>
            No hacemos publicidad, perfilamiento comercial, venta o cesión de datos a terceros,
            rastreo entre sitios ni apps, cookies de terceros, ni analítica que te identifique.
          </P>
        </Section>

        <Section title="3. Quién más ve tus datos">
          <Sub title="3.1 Otros usuarios" />
          <P>
            Los reportes son públicos y se ven sin tener cuenta. Eso no es un descuido: es
            justamente lo que hace que funcionen. Cualquier persona con el enlace puede ver las
            fotos y los datos de la mascota, tu nombre y tu foto de perfil (porque firman el
            reporte), la ubicación aproximada, y las pistas, avistamientos y novedades.
          </P>
          <P>
            Nadie ve tu correo, tu teléfono, tu red social, tu fecha de nacimiento, tus mensajes
            privados, tus reportes guardados, tu zona de alerta ni tus preferencias de avisos.
          </P>
          <Sub title="3.2 Proveedores" />
          <P>
            No les vendemos nada: son la infraestructura sobre la que corre la app, y cada uno
            trata datos por encargo nuestro y solo para lo que le encargamos. Supabase aloja la
            base de datos, las cuentas y las fotos; Cloudflare sirve el sitio web; un proveedor
            de correo envía los avisos y la recuperación de contraseña; y los servicios de
            notificaciones entregan los avisos a tu teléfono o navegador.
          </P>
          <Sub title="3.3 Autoridades" />
          <P>
            Entregamos datos a un tribunal, al Ministerio Público o a Carabineros solo si nos
            llega un requerimiento formal que estemos obligados a cumplir, y si podemos avisarte,
            te avisamos. Ten presente lo ya dicho: la ubicación exacta no la tenemos, así que no
            podemos entregarla aunque nos la pidan.
          </P>
        </Section>

        <Section title="4. Transferencias internacionales">
          <P>
            Sí, tus datos salen de Chile, y la ley nos obliga a decírtelo con claridad. La base
            de datos, las cuentas y las fotos están en infraestructura fuera del país; el correo
            se envía a través de un proveedor ubicado en el extranjero; y las notificaciones
            pasan por servicios que también están fuera de Chile. Eso significa que datos como
            tu correo, tu nombre y tus reportes se almacenan y procesan en países cuya
            legislación de protección de datos puede ser distinta a la chilena.
          </P>
          <P>Lo que hacemos al respecto:</P>
          <Item>
            Elegimos proveedores con compromisos contractuales de protección de datos, que se
            obligan a tratarlos solo por encargo nuestro.
          </Item>
          <Item>
            Minimizamos lo que sale del país: la coordenada exacta no se guarda, los metadatos
            EXIF se eliminan, y el teléfono y la red social no se pueden leer ni siquiera desde
            nuestra propia API.
          </Item>
          <Item>Todo viaja cifrado y se guarda cifrado en reposo.</Item>
        </Section>

        <Section title="5. Qué pasa cuando borras tu cuenta">
          <P>
            Puedes borrarla desde la app, en Perfil → Borrar mi cuenta. Es inmediato e
            irreversible, y no hay que escribirle a nadie ni esperar.
          </P>
          <Sub title="Se destruye lo que es solo tuyo" />
          <Item>Tus reportes, con todas sus fotos.</Item>
          <Item>
            Tu zona de alerta, tus reportes guardados, tus preferencias de avisos y tus
            suscripciones a notificaciones.
          </Item>
          <Item>
            Tu usuario del sistema de autenticación, incluido tu correo. Eso es lo que hace que
            el borrado sea irreversible de verdad: sin el correo, el identificador que queda ya
            no se puede asociar a ninguna persona. Como efecto secundario, ese correo queda
            libre por si algún día quieres volver.
          </Item>
          <Sub title="Sobrevive, pero anónimo, lo que también es de otra persona" />
          <Item>
            Las pistas y avistamientos que dejaste en reportes ajenos quedan firmados como “Un
            vecino”, sin tu nombre ni tu foto. Si se borraran, le arrancaríamos información a
            alguien que todavía está buscando a su mascota.
          </Item>
          <Item>
            Tus conversaciones quedan visibles para la otra persona, con tu nombre reemplazado
            por “Cuenta eliminada” y sin posibilidad de responderte.
          </Item>
          <Sub title="Dos cosas que conviene saber antes de apretar el botón" />
          <Item>
            Si borras tu cuenta, también se borran las pistas y avistamientos que otros dejaron
            en tus reportes: se van con el reporte.
          </Item>
          <Item>
            Lo que ya compartiste fuera de la app (un afiche que mandaste por WhatsApp, una
            captura que alguien guardó) no lo podemos borrar. No está en nuestras manos.
          </Item>
          <P>
            También puedes pedir el borrado sin instalar la app, desde la página pública de
            solicitud de borrado del sitio web.
          </P>
        </Section>

        <Section title="6. Tus derechos">
          <P>
            La Ley 21.719 te da estos derechos sobre tus datos. Son gratis y los puedes ejercer
            las veces que quieras.
          </P>
          <Dato etiqueta="Acceso">
            Saber qué datos tuyos tenemos y qué hacemos con ellos. En la app ves casi todo.
          </Dato>
          <Dato etiqueta="Rectificación">
            Corregir datos equivocados o incompletos. Tu nombre, foto, teléfono y red social los
            cambias tú al instante, en Perfil → Editar perfil.
          </Dato>
          <Dato etiqueta="Cancelación">
            Que borremos tus datos. Perfil → Borrar mi cuenta, al instante.
          </Dato>
          <Dato etiqueta="Oposición">
            Que dejemos de tratar tus datos para una finalidad. En Perfil → Avisos apagas los
            avisos por canal y por tipo.
          </Dato>
          <Dato etiqueta="Portabilidad">
            Que te entreguemos tus datos en un formato que puedas llevarte.
          </Dato>
          <P>
            Cuando exista un canal escrito, el compromiso es acusar recibo en 5 días hábiles y
            responder en un máximo de 30 días corridos, que es el plazo que fija la ley. Para
            confirmar que eres tú responderíamos al correo con el que está registrada la cuenta:
            a propósito no te vamos a pedir foto de tu cédula ni de tu RUT, porque pedirte un
            documento de identidad significaría quedarnos con un dato mucho más sensible que los
            que ya tenemos. Si no podemos hacer lo que pides, te explicamos por qué.
          </P>
          <P>
            Si no te gusta nuestra respuesta, puedes reclamar ante la Agencia de Protección de
            Datos Personales de Chile. No hace falta que nos avises antes, pero preferimos
            arreglarlo directamente contigo.
          </P>
        </Section>

        <Section title="7. Menores de edad">
          <P>La edad mínima para tener cuenta es 14 años.</P>
          <P>
            Por qué 14 y no 18: porque los que más buscan a una mascota perdida son justamente
            los cabros chicos de la casa, y porque la ley chilena distingue entre niños (menores
            de 14) y adolescentes (de 14 a 17). Para tratar datos de un niño necesitamos la
            autorización de su madre, padre o tutor, y no tenemos ninguna forma seria de
            obtenerla y verificarla. Para un adolescente, en cambio, el tratamiento de datos que
            no son sensibles puede apoyarse en su propio consentimiento informado.
          </P>
          <Item>
            Al registrarte te pedimos tu fecha de nacimiento —día, mes y año—, no una casilla de
            “confirmo que soy mayor”. Una casilla no informa nada y no demuestra nada.
          </Item>
          <Item>
            Si tienes menos de 14 no se crea la cuenta, pero no te echamos: puedes seguir viendo
            todos los reportes, el mapa y las fotos sin cuenta, que es justamente lo que sirve
            para buscar. Para publicar o escribirle a alguien, pídele a un adulto de tu casa que
            lo haga desde su cuenta.
          </Item>
          <Item>
            Si nos avisan que un titular de cuenta es menor de 14, o si lo detectamos, se
            suspende la cuenta y, si no se acredita lo contrario, se elimina.
          </Item>
          <P>
            Somos honestos sobre el límite de esto: alguien puede escribir una fecha falsa. No
            pedimos cédula ni verificamos la identidad de nadie, porque hacerlo significaría
            recolectar documentos de identidad de todos nuestros usuarios para atrapar a unos
            pocos, y el remedio sería peor que la enfermedad.
          </P>
        </Section>

        <Section title="8. Cómo protegemos tus datos">
          <P>
            No es una lista de buenas intenciones: es lo que está implementado y verificado
            contra la base de datos real.
          </P>
          <Item>Todo viaja cifrado y se guarda cifrado en reposo.</Item>
          <Item>Tu contraseña no la tenemos: se guarda con un hash irreversible.</Item>
          <Item>
            Cada tabla tiene reglas de acceso aplicadas por la base de datos, no por la app.
            Aunque alguien se salte la app y hable directo con nuestra API, las reglas siguen
            ahí.
          </Item>
          <Item>
            Tu teléfono y tu red social tienen un permiso a nivel de columna: la base de datos
            simplemente no se los entrega a nadie que no seas tú.
          </Item>
          <Item>
            Las funciones que borran o anonimizan una cuenta no aceptan un destinatario: no
            existe forma de pedirle al servidor que borre la cuenta de otra persona.
          </Item>
          <Item>
            Las rutas de las fotos son aleatorias, así que nadie puede recorrer el almacenamiento
            adivinando nombres de archivo.
          </Item>
          <Item>La validación se hace en el servidor, no solo en el formulario.</Item>
          <Sub title="Lo que todavía no tenemos, dicho de frente" />
          <Item>No hay autenticación en dos pasos.</Item>
          <Item>
            El almacenamiento de fotos es público: cualquiera con la URL exacta ve la foto. Las
            URL no son adivinables, pero si compartes el enlace de una foto, ese enlace funciona.
          </Item>
          <Item>
            Al borrar un reporte, su foto puede quedar en el almacenamiento aunque el reporte
            desaparezca.
          </Item>
        </Section>

        <Section title="9. Si hay una filtración de datos">
          <Item>Primero la contenemos: cortar el acceso, rotar claves, cerrar el agujero.</Item>
          <Item>
            Avisamos a la Agencia de Protección de Datos Personales sin dilaciones indebidas. La
            ley no fija un número de horas; nuestro compromiso interno es hacerlo dentro de 72
            horas desde que tomamos conocimiento.
          </Item>
          <Item>
            Si la brecha puede afectarte de verdad, te escribimos: qué pasó, qué datos tuyos,
            qué hicimos y qué te conviene hacer.
          </Item>
          <Item>Queda anotado en un registro interno de incidentes, con fechas.</Item>
        </Section>

        <Section title="10. Decisiones automatizadas">
          <P>
            No tomamos ninguna decisión automatizada que produzca efectos jurídicos sobre ti ni
            que te afecte significativamente. No hay algoritmos que te puntúen ni que decidan
            nada sobre tu cuenta por su cuenta.
          </P>
          <P>
            Sí hay procesos automáticos, pero son mecánicos: la búsqueda y el orden de los
            reportes se calculan por distancia y fecha, sin curaduría editorial ni reportes
            destacados; las coincidencias que te sugerimos son una comparación simple de especie
            y cercanía, para que la mires tú; y los avisos se disparan por reglas fijas según las
            preferencias que configuraste. Las decisiones que sí afectan a una cuenta
            —suspenderla o eliminarla— las toma una persona y se pueden apelar.
          </P>
        </Section>

        <Section title="11. Cambios a esta política">
          <P>
            Si la cambiamos, actualizamos la fecha y la versión de arriba. Si el cambio es
            importante —datos nuevos, finalidad nueva, un proveedor nuevo— te avisamos dentro de
            la app y, si corresponde, por correo, antes de que empiece a aplicarse.
          </P>
        </Section>

        <Section title="12. Contacto">
          <Canal para="ejercer un derecho, denunciar algo o avisar de un problema de seguridad" />
        </Section>

        <View style={styles.divider} />

        {/* ------------------------------------------------------------------ */}
        <Title size={22} style={styles.mainTitle}>
          Términos de uso
        </Title>

        <Section title="Léelo en 30 segundos">
          <Item>Esto es una herramienta comunitaria y gratuita, operada por una persona.</Item>
          <Item>Lo que publicas sigue siendo tuyo. Solo lo mostramos para que funcione la app.</Item>
          <Item>
            Prohibido vender animales, estafar, acosar y publicar datos de terceros. Sin
            excepciones.
          </Item>
          <Item>
            Las recompensas son un acuerdo entre particulares: por acá no pasa ni un peso.
          </Item>
          <Item>Si algo está mal, se denuncia desde la app y lo revisa una persona.</Item>
          <Item>No garantizamos que encuentres a tu mascota. Ojalá, pero no lo podemos prometer.</Item>
        </Section>

        <Section title="1. Qué es esto y quién lo opera">
          <P>
            Es un servicio gratuito para publicar y buscar mascotas perdidas y encontradas, y
            para difundir mascotas en adopción, operado por una persona natural en Chile. No es
            una empresa de rescate, no es un refugio, no es un servicio veterinario y no es una
            intermediaria en ninguna transacción.
          </P>
          <P>
            No verificamos la veracidad de los reportes ni la identidad de las personas que usan
            la app. Es importante que eso lo tengas claro desde el principio, porque de ahí sale
            casi todo lo demás.
          </P>
        </Section>

        <Section title="2. Edad mínima">
          <P>
            Necesitas tener al menos 14 años para crear una cuenta. Sin cuenta puedes ver todos
            los reportes, el mapa y las fotos: para buscar no hace falta registrarse.
          </P>
        </Section>

        <Section title="3. Tu cuenta">
          <Item>Tus datos de registro tienen que ser reales, y tu cuenta es personal.</Item>
          <Item>
            Cuida tu contraseña: lo que se haga desde tu cuenta se considera hecho por ti.
          </Item>
          <Item>Puedes borrar tu cuenta cuando quieras, desde la app.</Item>
        </Section>

        <Section title="4. Lo que publicas es tuyo, y sigue siendo tuyo">
          <P>
            Las fotos y los textos que subes son tuyos. Al publicarlos nos das permiso para
            mostrarlos dentro de la app y en las páginas públicas de los reportes, que es lo
            necesario para que la búsqueda funcione y para que se puedan compartir. No los
            usamos para otra cosa, no los vendemos y no se los licenciamos a nadie.
          </P>
          <P>
            Publica solo fotos que hayas sacado tú o que tengas derecho a usar, y no publiques
            fotos donde aparezcan otras personas sin su permiso.
          </P>
        </Section>

        <Section title="5. Conductas y contenido prohibidos">
          <P>
            Esta lista es explícita a propósito. Publicar cualquiera de estas cosas es motivo de
            retiro del contenido y, según la gravedad y la reincidencia, de suspensión o
            eliminación de la cuenta.
          </P>
          <Sub title="5.1 Sobre animales" />
          <Item>
            Vender, ofrecer en venta, permutar, arrendar, rifar, sortear o subastar animales.
            Sin excepciones y sin importar el precio.
          </Item>
          <Item>
            Ofrecer animales en adopción a cambio de dinero, o pedir “colaboración”, “aporte” o
            “gastos” como condición para entregar un animal. Adopción responsable significa
            gratis.
          </Item>
          <Item>Promocionar criaderos, camadas, montas, cruzas o servicios reproductivos.</Item>
          <Item>
            Publicar contenido que muestre maltrato, crueldad, peleas de animales, caza o
            tortura, salvo que sea material que estés denunciando y con el que nos estés pidiendo
            ayuda.
          </Item>
          <Item>
            Publicar como perdido un animal que no es tuyo ni está a tu cuidado, o como
            encontrado uno que no has visto, para atraer contactos.
          </Item>
          <Item>
            Usar la app para quedarte con un animal ajeno: retenerlo, esconderlo o exigir dinero
            a su familia para devolverlo.
          </Item>
          <Sub title="5.2 Sobre el dinero y las estafas" />
          <Item>
            Pedir una transferencia, un depósito o un pago por adelantado a cambio de devolver o
            de “ubicar” una mascota.
          </Item>
          <Item>
            Decir que tienes a una mascota que no tienes, o mandar fotos ajenas para hacerte
            pasar por quien la encontró.
          </Item>
          <Item>
            Pedir datos bancarios, claves, códigos de verificación o de tarjetas a otro usuario,
            por cualquier motivo.
          </Item>
          <Item>
            Mandar enlaces de pago, códigos QR de cobro o enlaces a “seguimientos”, “encomiendas”
            o “trámites” que haya que pagar.
          </Item>
          <Item>
            Ofrecer servicios pagados de búsqueda, videncia, rastreo o “detección por satélite”.
          </Item>
          <Sub title="5.3 Sobre otras personas" />
          <Item>
            Acosar, amenazar, intimidar o insultar a otro usuario, acá o fuera de la app a partir
            de un contacto hecho acá.
          </Item>
          <Item>
            Publicar datos personales de terceros sin su permiso: teléfono, dirección, patente,
            lugar de trabajo, RUT, fotos de su casa o de su cara.
          </Item>
          <Item>
            Contenido de odio por origen, nacionalidad, etnia, religión, sexo, orientación
            sexual, identidad de género, edad o discapacidad.
          </Item>
          <Item>Contenido sexual, sexualmente explícito o violento gráfico de cualquier tipo.</Item>
          <Item>
            Cualquier contenido que involucre a menores de edad de forma sexualizada o que los
            ponga en riesgo. Esto no tiene advertencia previa: se retira, se elimina la cuenta y
            se denuncia a la autoridad.
          </Item>
          <Item>
            Suplantar a otra persona, a una organización, a una autoridad o al equipo de la app.
          </Item>
          <Sub title="5.4 Sobre el uso de la plataforma" />
          <Item>Spam, publicidad o promoción comercial de cualquier producto o servicio.</Item>
          <Item>Reportes falsos, duplicados o de prueba publicados a propósito.</Item>
          <Item>Denunciar en falso para hacer bajar el reporte de otra persona.</Item>
          <Item>
            Usar bots, scrapers o automatizaciones para publicar, extraer datos masivamente o
            saturar el servicio.
          </Item>
          <Item>
            Intentar saltarse los límites de la app, acceder a datos de otros usuarios o atacar
            la infraestructura. Si encuentras una falla de seguridad, avísanos en vez de
            explotarla: lo vamos a agradecer de verdad.
          </Item>
          <Item>Publicar enlaces a malware, phishing o descargas engañosas.</Item>
          <Item>
            Reutilizar el contenido de la app para armar otro servicio, base de datos o
            directorio.
          </Item>
          <Item>Cualquier uso contrario a la ley chilena.</Item>
        </Section>

        <Section title="6. Recompensas: lee esto con atención">
          <P>
            Un reporte puede mencionar una recompensa en dinero. Eso es solo información que
            publica el dueño de la mascota.
          </P>
          <P>
            La app no cobra, no paga, no retiene, no procesa, no garantiza y no media en ninguna
            recompensa. No hay pasarela de pagos, no hay billetera y no hay custodia de dinero:
            nunca pasa un peso por acá. El acuerdo, la entrega y el pago son exclusivamente entre
            las dos personas involucradas, fuera de la app. Si alguien te promete una recompensa y
            no te la paga, nosotros no podemos hacer nada al respecto.
          </P>
          <Nota>
            Si te piden que pagues antes de ver a la mascota, es una estafa. No hay ninguna
            excepción legítima a esta regla. Nunca transfieras antes de ver a la mascota en
            persona, júntate en un lugar público y de día, anda acompañado, pide una foto nueva
            con algo específico que solo tú puedas reconocer, y no mandes tus datos bancarios por
            el chat.
          </Nota>
        </Section>

        <Section title="7. Moderación: qué hacemos cuando algo está mal">
          <P>
            No revisamos previamente todo lo que se publica —no somos un medio con línea
            editorial, y no elegimos ni destacamos reportes—, pero sí actuamos cuando nos avisan
            o cuando lo detectamos. Hay un botón de denuncia en los reportes, en los perfiles y
            dentro del chat.
          </P>
          <Sub title="Nuestros compromisos de tiempo" />
          <Dato etiqueta="Máxima prioridad, apenas lo veamos">
            Contenido con menores en riesgo, o amenazas creíbles a una persona o a un animal:
            retiro inmediato, eliminación de la cuenta y denuncia a la autoridad.
          </Dato>
          <Dato etiqueta="Dentro de 24 horas">
            Estafa en curso, suplantación o acoso: revisamos y retiramos si corresponde.
          </Dato>
          <Dato etiqueta="Dentro de 72 horas">
            Venta de animales, spam, publicidad o reporte falso.
          </Dato>
          <Dato etiqueta="Dentro de 7 días">Todo lo demás.</Dato>
          <P>
            Cada retiro y cada suspensión queda registrada con fecha y motivo. Eso no es
            burocracia: es la prueba de que actuamos con diligencia cuando nos notificaron.
          </P>
          <Sub title="Qué puede pasar con el contenido o con la cuenta" />
          <Item>Retiro del contenido, explicando qué regla se rompió.</Item>
          <Item>Advertencia.</Item>
          <Item>
            Suspensión: mientras dure, no puedes publicar ni escribir, pero tu cuenta y tus datos
            siguen ahí.
          </Item>
          <Item>
            Eliminación de la cuenta, con el mismo procedimiento descrito en la Política de
            privacidad.
          </Item>
          <P>
            Vamos por los primeros pasos cuando parece un malentendido o un descuido, y directo a
            la eliminación en los casos graves. Si crees que nos equivocamos, puedes apelar y lo
            revisa una persona: las decisiones no las toma un algoritmo.
          </P>
        </Section>

        <Section title="8. De qué respondemos y de qué no">
          <P>
            Acá no vas a encontrar el párrafo en mayúsculas donde la app se exime de todo. Ese
            párrafo, además de desagradable, no serviría: en Chile las cláusulas que eximen
            anticipadamente de toda responsabilidad son nulas. Así que preferimos decir la
            verdad, que es más útil para los dos.
          </P>
          <Sub title="De lo que sí respondemos" />
          <Item>
            De operar la app con el cuidado razonable que se le puede pedir a un servicio
            gratuito hecho por una persona.
          </Item>
          <Item>
            De proteger tus datos como está descrito en la Política de privacidad, y de que lo
            que ahí decimos sea cierto.
          </Item>
          <Item>De actuar con rapidez cuando nos avisas, en los plazos de arriba.</Item>
          <Item>Del daño que causemos por nuestra propia culpa o dolo.</Item>
          <Sub title="De lo que no podemos responder" />
          <Item>
            De lo que publiquen o hagan otros usuarios: no verificamos la veracidad de los
            reportes ni la identidad de las personas.
          </Item>
          <Item>
            De lo que pase en un encuentro presencial entre dos usuarios, o de un acuerdo de
            recompensa cerrado fuera de la app.
          </Item>
          <Item>
            De que encuentres a tu mascota. Ojalá, pero esta app es una herramienta, no una
            promesa.
          </Item>
          <Item>
            De caídas o interrupciones del servicio, sobre todo las que dependen de terceros. Es
            un servicio gratuito y no hay garantía de disponibilidad continua.
          </Item>
          <Item>
            De que un aviso llegue a tiempo, o llegue: el correo y las notificaciones dependen de
            tu proveedor, de tu dispositivo y de tus permisos.
          </Item>
        </Section>

        <Section title="9. Interrupción y término del servicio">
          <Item>
            Puedes irte cuando quieras: Perfil → Borrar mi cuenta, o simplemente dejar de usar la
            app.
          </Item>
          <Item>
            Podemos cambiar o discontinuar funciones, y podríamos tener que cerrar la app. Si eso
            pasara, avisaríamos con al menos 30 días de anticipación dentro de la app, para que
            tengas tiempo de guardar lo que necesites.
          </Item>
          <Item>
            Si suspendemos o eliminamos tu cuenta por incumplir estos términos, te avisamos
            explicando el motivo, y puedes apelar.
          </Item>
        </Section>

        <Section title="10. Cambios a estos términos">
          <P>
            Si cambian, actualizamos la fecha y la versión de arriba. Si el cambio es importante,
            te avisamos dentro de la app antes de que empiece a aplicarse. Seguir usando la app
            después de eso significa que aceptas la versión nueva; si no la aceptas, puedes borrar
            tu cuenta.
          </P>
        </Section>

        <Section title="11. Ley aplicable y tribunales">
          <P>
            Estos términos se rigen por la ley chilena. Cualquier conflicto lo ven los tribunales
            ordinarios de justicia de Chile, sin renunciar a los derechos que te correspondan como
            titular de datos personales ante la Agencia de Protección de Datos Personales.
          </P>
        </Section>

        <Section title="12. Contacto">
          <Canal para="denuncias, apelaciones, dudas o fallas de seguridad" />
        </Section>
      </ScrollView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  disclaimer: {
    marginBottom: spacing.sm,
  },
  mainTitle: {
    marginTop: spacing.md,
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  sub: {
    color: colors.ink,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  item: {
    lineHeight: 20,
  },
  paragraph: {
    lineHeight: 20,
  },
  nota: {
    backgroundColor: colors.sky,
    borderLeftColor: colors.brand,
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dato: {
    marginTop: spacing.xs,
  },
  datoEtiqueta: {
    color: colors.muted,
    marginBottom: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
});
