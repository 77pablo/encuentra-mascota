import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeMessages } from '../hooks/useRealtimeMessages';
import { useUnread } from '../hooks/useUnread';
import { ctxDeParams, markThreadRead, sendMessage } from '../services/messages';
import { getAdoption } from '../services/adoptions';
import { uploadPetPhoto } from '../services/storage';
import { pickFromLibrary, takePhoto } from '../lib/pickImage';
import { resolverUrlFoto } from '../lib/fotoAdjuntaChat';
import { supabase } from '../lib/supabase';
import { bloqueEmitido, bloquear, desbloquear } from '../services/bloqueos';
import { denunciarMensaje, denunciarUsuario, MOTIVOS_DENUNCIA } from '../services/moderation';
import { confirmAction, notify } from '../lib/notify';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { AppText, AvisoEstafa, Button, Screen } from '../ui';
import { font, radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

export default function ChatScreen({ route, navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  // Params generalizados (0030): un chat puede ser sobre un reporte (`petId`),
  // una adopcion (`adoptionId`) o un reporte ya borrado (ninguno de los dos).
  // Se reconstruye el `HiloCtx` explicito con `ctxDeParams`. Va en `useMemo`
  // para que sea estable entre renders (los hooks/efectos dependen de el).
  const { petId, adoptionId, otherUserId } = route.params;
  const ctx = useMemo(() => ctxDeParams({ petId, adoptionId }), [petId, adoptionId]);
  const { user } = useAuth();
  const me = user!.id;
  const messages = useRealtimeMessages(ctx, me, otherUserId);
  const [texto, setTexto] = useState('');
  // Foto adjunta al mensaje que se está por mandar (0038). `imagenAdjunta`
  // guarda SIEMPRE la uri LOCAL (de la cámara/galería), tanto para el
  // preview como para volver a subirla si hace falta. `urlSubida` guarda la
  // URL pública una vez que esa foto ya se subió: si `sendMessage` falla
  // después de una subida exitosa, un reintento reusa `urlSubida` en vez de
  // volver a subir la foto (ver `onSend` y `resolverUrlFoto`). `subiendo`
  // controla el spinner del botón de enviar mientras dura la subida.
  const [imagenAdjunta, setImagenAdjunta] = useState<string | null>(null);
  const [urlSubida, setUrlSubida] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [menuAdjuntarAbierto, setMenuAdjuntarAbierto] = useState(false);
  // Visor simple de la foto de una burbuja, a pantalla completa.
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  const { refresh: refreshUnread } = useUnread();
  const [otroEliminado, setOtroEliminado] = useState(false);
  const [otroNombre, setOtroNombre] = useState<string | null>(null);
  // Pulido: si el hilo es de una adopción, un renglón del encabezado se puede
  // tocar para ir al detalle de esa publicación. Solo el nombre a mostrar
  // (no hace falta la fila completa): si la adopción ya no está disponible
  // (borrada/adoptada), se degrada a una etiqueta genérica en vez de romper.
  const [adopcionNombre, setAdopcionNombre] = useState<string | null>(null);
  // Bloqueo/denuncia desde el propio chat.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [procesandoBloqueo, setProcesandoBloqueo] = useState(false);
  const [mostrarMotivos, setMostrarMotivos] = useState(false);
  const [enviandoDenuncia, setEnviandoDenuncia] = useState(false);
  // Denuncia de UN mensaje puntual (pulsación larga sobre la burbuja). Es
  // distinta de "Denunciar conversación" del menú: acá quien revisa recibe el
  // id del mensaje exacto, que es lo único que le permite actuar sobre algo que
  // la RLS no lo deja leer. Guarda el id del mensaje elegido, o null.
  const [mensajeADenunciar, setMensajeADenunciar] = useState<string | null>(null);
  const [enviandoDenunciaMensaje, setEnviandoDenunciaMensaje] = useState(false);

  useEffect(() => {
    markThreadRead(ctx, me, otherUserId)
      .then(() => refreshUnread())
      .catch((e) => console.error('No se pudo marcar el hilo como leído:', e));
  }, [ctx, me, otherUserId, messages.length, refreshUnread]);

  // Si la otra persona borró su cuenta, el hilo queda de solo lectura. La RLS
  // ya rechaza el insert (migración 0017); esto es para no ofrecer un campo de
  // texto que va a fallar. `eliminado_en` todavía no existe en la base real
  // hasta que se aplique esa migración: si el select falla, `data` llega
  // `null/undefined` y simplemente no marcamos nada como eliminado, en vez de
  // romper el chat (por eso el `catch` no hace nada más que no dejar la
  // promesa rechazada suelta).
  useEffect(() => {
    let vivo = true;
    // React Navigation suele reusar la misma instancia de esta pantalla al
    // pasar de un chat a otro (no la desmonta), asi que si no reseteamos aca
    // el estado del chat anterior queda pegado por un instante: el compositor
    // podria ocultarse o mostrarse con el dato de la conversacion previa hasta
    // que la consulta de abajo resuelva.
    setOtroEliminado(false);
    setOtroNombre(null);
    setMenuAbierto(false);
    setMostrarMotivos(false);
    setMensajeADenunciar(null);
    setBloqueado(false);
    // ¿Ya bloqueé a esta persona? Silencioso: si falla (tabla 0022 sin aplicar)
    // dejamos el chat como está.
    bloqueEmitido(otherUserId)
      .then((b) => {
        if (vivo) setBloqueado(b);
      })
      .catch(() => {});
    // El builder de supabase es un PromiseLike, no un Promise completo (no
    // tiene `.catch`); lo envolvemos en Promise.resolve para poder atrapar el
    // rechazo sin dejar una promesa suelta. Se lee también el nombre para el
    // encabezado tocable que lleva al perfil público.
    Promise.resolve(
      supabase.from('profiles').select('nombre, eliminado_en').eq('id', otherUserId).maybeSingle(),
    )
      .then(({ data }) => {
        if (!vivo) return;
        setOtroEliminado(Boolean(data?.eliminado_en));
        setOtroNombre(data?.eliminado_en ? null : (data?.nombre ?? '').trim() || null);
      })
      .catch(() => {
        // Best effort: si la consulta falla (columna inexistente, sin red,
        // etc.) el chat sigue funcionando como si nadie hubiera borrado nada.
      });
    return () => {
      vivo = false;
    };
  }, [otherUserId]);

  // Nombre a mostrar en el renglón tocable "Sobre: …" (solo hilos de
  // adopción). Silencioso: si la publicación ya no está disponible o falla la
  // consulta, se degrada a una etiqueta genérica en vez de romper el chat.
  useEffect(() => {
    if (ctx.tipo !== 'adopcion') {
      setAdopcionNombre(null);
      return;
    }
    let vivo = true;
    getAdoption(ctx.id)
      .then((a) => {
        if (vivo) setAdopcionNombre(a.nombre || 'esta mascota');
      })
      .catch(() => {
        if (vivo) setAdopcionNombre('esta publicación');
      });
    return () => {
      vivo = false;
    };
  }, [ctx]);

  const irAAdopcion = () => {
    if (ctx.tipo !== 'adopcion') return;
    // ChatScreen vive dentro del stack de una pestaña (Inicio/Explorar/
    // Adopción/Perfil/Mensajes); `AdopcionDetail` en cambio vive en el stack
    // RAÍZ (link público `adopcion/:id`, ver RootNavigator). Un nombre pelado
    // alcanza igual porque React Navigation burbujea `navigate` hacia el
    // ancestro que sí tiene esa pantalla (mismo patrón que `HomeScreen` con
    // `navigate('GuiaPerdida')`).
    navigation.navigate('AdopcionDetail', { id: ctx.id });
  };

  const onTomarFotoAdjunta = async () => {
    setMenuAdjuntarAbierto(false);
    const uri = await takePhoto();
    // Nueva foto: si había una `urlSubida` de un adjunto anterior (p. ej. de
    // un envío fallido), ya no corresponde — es la URL de OTRA foto.
    if (uri) {
      setImagenAdjunta(uri);
      setUrlSubida(null);
    }
  };

  const onElegirFotoAdjunta = async () => {
    setMenuAdjuntarAbierto(false);
    const uris = await pickFromLibrary(1);
    // Ídem: descartar cualquier `urlSubida` que quedara de un adjunto previo.
    if (uris[0]) {
      setImagenAdjunta(uris[0]);
      setUrlSubida(null);
    }
  };

  const onSend = async () => {
    const t = texto;
    const adjunta = imagenAdjunta;
    const yaSubida = urlSubida;
    setTexto('');
    setImagenAdjunta(null);
    // La foto se sube ANTES de intentar el insert: `sendMessage` necesita ya
    // la URL pública (no hay forma de "subir después" un mensaje ya mandado).
    // Si ya se había subido en un intento anterior (reintento tras un
    // `sendMessage` fallido), `resolverUrlFoto` reusa esa URL sin volver a
    // subir la foto — evita duplicar el archivo en Storage y evita pasarle
    // una URL remota a `uploadPetPhoto`, que espera una uri local. Si la
    // subida falla, no se manda nada y se le devuelven el texto y la foto a
    // la persona para que reintente.
    let url: string | undefined;
    if (adjunta) {
      if (!yaSubida) setSubiendo(true);
      try {
        url = await resolverUrlFoto(adjunta, yaSubida, (uriLocal) => uploadPetPhoto(uriLocal, me));
      } catch (e: any) {
        setSubiendo(false);
        setTexto(t);
        setImagenAdjunta(adjunta);
        notify('No se pudo subir la foto', mensajeDeErrorDb(e));
        return;
      }
      setSubiendo(false);
      setUrlSubida(url ?? null);
    }
    try {
      await sendMessage(ctx, me, otherUserId, t, url);
      // Se mandó: si había foto, ya no hace falta conservar su URL subida
      // (no hay reintento pendiente).
      if (url) setUrlSubida(null);
      // Push "best effort": si falla, el chat igual funcionó, así que no le
      // mostramos nada al usuario. Pero SÍ lo dejamos en la consola: este
      // `catch` vacío tapó durante semanas que la función `send-push` ni
      // siquiera estaba desplegada (respondía 404) y nadie se enteró.
      // El titulo se adapta al contexto: una adopcion no es "una mascota"
      // (reporte perdida/encontrada). La ruta del deep-link SÍ la arma el
      // cliente (acá): `send-push` hoy no construía ninguna, solo reenviaba
      // title/body a Expo sin `data`. Se sigue el mismo patrón que
      // `send-notifications` (la cola de avisos), que ya manda `data: { ruta }`
      // en el push. Un hilo de reporte borrado (`pet_borrado`) no tiene a
      // dónde llevar: se manda sin ruta.
      const ruta =
        ctx.tipo === 'adopcion' ? `/adopcion/${ctx.id}` : ctx.tipo === 'pet' ? `/mascota/${ctx.id}` : undefined;
      // Un mensaje solo-foto no tiene texto para el cuerpo del push (0038):
      // se avisa igual, con un cuerpo genérico.
      const cuerpoPush = t.trim() ? t.slice(0, 80) : '📷 Foto';
      supabase.functions
        .invoke('send-push', {
          body: {
            toUserId: otherUserId,
            title: ctx.tipo === 'adopcion' ? 'Nuevo mensaje sobre una adopción' : 'Nuevo mensaje sobre una mascota',
            body: cuerpoPush,
            ruta,
          },
        })
        .catch((e) => console.warn('No se pudo mandar el aviso push del mensaje:', e));
    } catch (e: any) {
      // El insert falló. Si había foto, ya quedó subida (su URL sigue en
      // `urlSubida`, sin tocar): se restaura la uri LOCAL para el preview y
      // el reintento, que gracias a `urlSubida` no la vuelve a subir.
      setTexto(t);
      if (adjunta) setImagenAdjunta(adjunta);
      // Antes esto fallaba EN SILENCIO: el mensaje volvía al compositor y no se
      // decía nada, así que quien está bloqueado (o le escribe a una cuenta
      // borrada) reintentaba para siempre sin entender. El texto del 42501 es
      // neutro y simétrico a propósito: no revela que alguien te bloqueó (ver
      // `ContextoError` en dbErrors.ts).
      notify('No se pudo enviar', mensajeDeErrorDb(e, 'mensaje'));
    }
  };

  const puedeEnviar = texto.trim().length > 0 || imagenAdjunta != null;

  const alternarBloqueo = async () => {
    setMenuAbierto(false);
    if (!bloqueado) {
      const ok = await confirmAction(
        '¿Bloquear a esta persona?',
        'No podrá escribirte y dejarás de ver lo que publique. Puedes deshacerlo cuando quieras.',
      );
      if (!ok) return;
    }
    setProcesandoBloqueo(true);
    try {
      if (bloqueado) {
        await desbloquear(otherUserId);
        setBloqueado(false);
        notify('Desbloqueada', 'Esta persona vuelve a poder escribirte.');
      } else {
        await bloquear(otherUserId);
        setBloqueado(true);
        // Al bloquear se corta el chat y se vuelve a Conversaciones.
        navigation.goBack();
      }
    } catch (e: any) {
      notify('No se pudo completar', mensajeDeErrorDb(e));
    } finally {
      setProcesandoBloqueo(false);
    }
  };

  const abrirDenuncia = () => {
    setMenuAbierto(false);
    setMostrarMotivos((v) => !v);
  };

  const denunciar = async (motivo: string) => {
    setEnviandoDenuncia(true);
    try {
      await denunciarUsuario(otherUserId, me, motivo);
      setMostrarMotivos(false);
      if (!bloqueado) {
        const ok = await confirmAction(
          'Denuncia recibida',
          'La revisaremos dentro de las próximas 24 horas. ¿Querés también bloquear a esta persona?',
        );
        if (ok) {
          await bloquear(otherUserId);
          navigation.goBack();
        }
      } else {
        notify('Denuncia recibida', 'La revisaremos dentro de las próximas 24 horas.');
      }
    } catch (e: any) {
      setMostrarMotivos(false);
      notify('No se pudo denunciar', mensajeDeErrorDb(e));
    } finally {
      setEnviandoDenuncia(false);
    }
  };

  // Denunciar el mensaje puntual que se dejó apretado. El aviso de recibido es
  // el mismo que el de la denuncia de conversación: quien denuncia no tiene por
  // qué distinguir dos "canales" de moderación.
  const denunciarElMensaje = async (motivo: string) => {
    const id = mensajeADenunciar;
    if (!id) return;
    setEnviandoDenunciaMensaje(true);
    try {
      await denunciarMensaje(id, me, motivo);
      setMensajeADenunciar(null);
      notify('Denuncia recibida', 'La revisaremos dentro de las próximas 24 horas.');
    } catch (e: any) {
      setMensajeADenunciar(null);
      notify('No se pudo denunciar', mensajeDeErrorDb(e));
    } finally {
      setEnviandoDenunciaMensaje(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.headerBar}>
          <View style={styles.headerLeft}>
            {otroEliminado ? (
              <View style={styles.headerRow}>
                <Ionicons name="person-circle-outline" size={18} color={colors.muted} />
                <AppText muted weight="semi" size={14} style={styles.headerNombre}>
                  Cuenta eliminada
                </AppText>
              </View>
            ) : otroNombre ? (
              <TouchableOpacity
                style={styles.headerRow}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('PublicProfile', { userId: otherUserId })}
              >
                <Ionicons name="person-circle-outline" size={18} color={colors.brand} />
                <AppText weight="semi" size={14} color={colors.brand} style={styles.headerNombre}>
                  {otroNombre}
                </AppText>
                <Ionicons name="chevron-forward" size={14} color={colors.brand} />
              </TouchableOpacity>
            ) : null}
            {/* Pulido: encabezado del chat de adopción tocable → detalle de la
                publicación. Renglón aparte del nombre de la otra persona (que
                sigue yendo a su perfil público), para no pisar esa acción. */}
            {ctx.tipo === 'adopcion' ? (
              <TouchableOpacity
                style={styles.headerAdopcionRow}
                activeOpacity={0.7}
                onPress={irAAdopcion}
              >
                <Ionicons name="paw" size={13} color={colors.muted} />
                <AppText muted size={12} numberOfLines={1} style={styles.headerAdopcionTexto}>
                  Sobre: {adopcionNombre ?? 'esta publicación'}
                </AppText>
                <Ionicons name="chevron-forward" size={12} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
          {/* Menú de la conversación: denunciar / bloquear sin salir del chat.
              A una cuenta eliminada no se le ofrece: ya no puede escribir. */}
          {!otroEliminado ? (
            <TouchableOpacity
              onPress={() => setMenuAbierto((v) => !v)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.menuBoton}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
        {menuAbierto && !otroEliminado ? (
          <View style={styles.menu}>
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={abrirDenuncia}>
              <Ionicons name="flag-outline" size={17} color={colors.ink} />
              <AppText size={14} style={styles.menuItemTexto}>
                Denunciar conversación
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              disabled={procesandoBloqueo}
              onPress={alternarBloqueo}
            >
              <Ionicons name="ban-outline" size={17} color={colors.ink} />
              <AppText size={14} style={styles.menuItemTexto}>
                {bloqueado ? 'Desbloquear a esta persona' : 'Bloquear a esta persona'}
              </AppText>
            </TouchableOpacity>
          </View>
        ) : null}
        {mostrarMotivos && !otroEliminado ? (
          <View style={styles.reasonList}>
            <AppText muted size={13} style={styles.reasonTitle}>
              ¿Por qué quieres denunciar esta conversación?
            </AppText>
            {MOTIVOS_DENUNCIA.map((motivo) => (
              <Button
                key={motivo}
                title={motivo}
                variant="secondary"
                loading={enviandoDenuncia}
                disabled={enviandoDenuncia}
                onPress={() => denunciar(motivo)}
                style={styles.reasonButton}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.aviso}>
          <AvisoEstafa variante="chat" />
        </View>
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mine = item.from_user === me;
            // Denunciar el mensaje ajeno. Solo los ajenos: denunciar el propio
            // no le sirve a nadie y ensucia la bandeja de quien modera.
            //
            // DOS caminos a la misma acción, y ninguno sobra:
            //  · pulsación larga sobre la burbuja — natural con el dedo, y es
            //    lo que ya conocía quien venía usando la app;
            //  · botón ⋯ al lado — el único que funciona con TECLADO. La
            //    pulsación larga vive en `onLongPress`, y la activación por
            //    teclado de react-native-web pasa por `onPress`: verificado en
            //    el navegador (Enter sobre un control con `onPress` lo dispara;
            //    sobre la burbuja, que no lo tenía, no pasaba nada). Sin este
            //    botón, denunciar un mensaje puntual era imposible sin mouse ni
            //    pantalla táctil. `delayLongPress` alto para no dispararlo al
            //    desplazar la lista.
            const abrirDenunciaDelMensaje = mine ? undefined : () => setMensajeADenunciar(item.id);
            return (
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
                <TouchableOpacity
                  activeOpacity={mine ? 1 : 0.85}
                  disabled={mine}
                  onLongPress={abrirDenunciaDelMensaje}
                  delayLongPress={400}
                  // La burbuja NO lleva `accessibilityLabel`: un label sobre un
                  // elemento que envuelve contenido se convierte en su nombre
                  // accesible y TAPA lo que hay adentro. Verificado en el árbol
                  // de accesibilidad del navegador: con el label puesto, cada
                  // mensaje ajeno se anunciaba "Denunciar este mensaje" en vez
                  // del texto que la persona escribió. El label vive ahora en
                  // el botón ⋯, que es el que de verdad hace la acción.
                  // (`accessibilityHint` tampoco servía: react-native-web no lo
                  // reenvía — no aparece en su tabla de props ni en su código.)
                  style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}
                >
                  {item.imagen_url ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setFotoGrande(item.imagen_url)}
                      // La foto se come el toque del contenedor: sin repetir acá
                      // el onLongPress, sobre una burbuja SOLO-foto no habría
                      // forma de denunciarla (que es justo el caso más grave).
                      onLongPress={abrirDenunciaDelMensaje}
                      delayLongPress={400}
                    >
                      <Image source={{ uri: item.imagen_url }} style={styles.bubbleImage} />
                    </TouchableOpacity>
                  ) : null}
                  {item.texto ? (
                    <AppText
                      size={15}
                      color={mine ? colors.white : colors.ink}
                      style={item.imagen_url ? styles.bubbleTextoConFoto : undefined}
                    >
                      {item.texto}
                    </AppText>
                  ) : null}
                </TouchableOpacity>
                {mine ? null : (
                  <TouchableOpacity
                    onPress={abrirDenunciaDelMensaje}
                    accessibilityRole="button"
                    accessibilityLabel="Denunciar este mensaje"
                    // El ícono es chico a propósito (no queremos un chat lleno
                    // de botones gritando), así que el área de toque se agranda
                    // con hitSlop en vez de con relleno visible.
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.denunciarMensajeBtn}
                  >
                    <Ionicons name="ellipsis-horizontal" size={16} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
        {/* Denuncia de un mensaje puntual: se abre con la pulsación larga sobre
            una burbuja ajena o con su botón ⋯ (que es el camino con teclado).
            Hoja simple con la MISMA lista cerrada de motivos que el resto de la
            app. */}
        <Modal
          visible={mensajeADenunciar != null}
          transparent
          animationType="fade"
          onRequestClose={() => setMensajeADenunciar(null)}
        >
          <View style={styles.hojaFondo}>
            <View style={styles.hoja}>
              <AppText weight="bold" size={15}>
                Denunciar este mensaje
              </AppText>
              <AppText muted size={13} style={styles.hojaSubtitulo}>
                ¿Por qué querés denunciarlo? Lo revisamos dentro de las próximas 24 horas.
              </AppText>
              {MOTIVOS_DENUNCIA.map((motivo) => (
                <Button
                  key={motivo}
                  title={motivo}
                  variant="secondary"
                  loading={enviandoDenunciaMensaje}
                  disabled={enviandoDenunciaMensaje}
                  onPress={() => denunciarElMensaje(motivo)}
                  style={styles.hojaBoton}
                />
              ))}
              <Button
                title="Cancelar"
                variant="ghost"
                disabled={enviandoDenunciaMensaje}
                onPress={() => setMensajeADenunciar(null)}
                style={styles.hojaBoton}
              />
            </View>
          </View>
        </Modal>
        {/* Visor a pantalla completa: tocar la foto de una burbuja la agranda. */}
        <Modal visible={fotoGrande != null} transparent animationType="fade" onRequestClose={() => setFotoGrande(null)}>
          <TouchableOpacity
            style={styles.visorFondo}
            activeOpacity={1}
            onPress={() => setFotoGrande(null)}
          >
            {fotoGrande ? (
              <Image source={{ uri: fotoGrande }} style={styles.visorImagen} resizeMode="contain" />
            ) : null}
            <TouchableOpacity
              style={styles.visorCerrar}
              onPress={() => setFotoGrande(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={28} color={colors.white} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        {otroEliminado ? (
          <View style={[styles.composer, styles.inputRow]}>
            <AppText muted style={styles.cerrado}>
              Esta persona borró su cuenta. La conversación queda como recuerdo.
            </AppText>
          </View>
        ) : bloqueado ? (
          <View style={[styles.composer, styles.inputRow]}>
            <AppText muted style={styles.cerrado}>
              Bloqueaste a esta persona. Podés desbloquearla desde el menú de arriba.
            </AppText>
          </View>
        ) : (
          <View style={styles.composer}>
            {imagenAdjunta ? (
              <View style={styles.previewRow}>
                <Image source={{ uri: imagenAdjunta }} style={styles.previewImagen} />
                <TouchableOpacity
                  onPress={() => {
                    setImagenAdjunta(null);
                    setUrlSubida(null);
                  }}
                  style={styles.previewQuitar}
                  accessibilityLabel="Quitar foto"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={22} color={colors.ink} />
                </TouchableOpacity>
              </View>
            ) : null}
            {menuAdjuntarAbierto ? (
              <View style={styles.adjuntarButtonsRow}>
                <Button
                  title="Cámara"
                  variant="secondary"
                  icon="camera"
                  onPress={onTomarFotoAdjunta}
                  style={styles.adjuntarButton}
                />
                <Button
                  title="Galería"
                  variant="secondary"
                  icon="image"
                  onPress={onElegirFotoAdjunta}
                  style={styles.adjuntarButton}
                />
              </View>
            ) : null}
            <View style={styles.inputRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setMenuAdjuntarAbierto((v) => !v)}
                disabled={subiendo}
                style={styles.attachButton}
                accessibilityLabel="Adjuntar foto"
              >
                <Ionicons name="attach" size={22} color={colors.muted} />
              </TouchableOpacity>
              <TextInput
                placeholder="Escribe un mensaje…"
                placeholderTextColor={colors.muted}
                value={texto}
                onChangeText={setTexto}
                style={styles.input}
                multiline
              />
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onSend}
                disabled={!puedeEnviar || subiendo}
                style={[styles.sendButton, (!puedeEnviar || subiendo) && styles.sendButtonDisabled]}
              >
                {subiendo ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="send" size={18} color={colors.white} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerNombre: {
    flexShrink: 1,
  },
  headerAdopcionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  headerAdopcionTexto: {
    flexShrink: 1,
  },
  menuBoton: {
    paddingLeft: spacing.md,
  },
  menu: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuItemTexto: {
    flexShrink: 1,
  },
  reasonList: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  reasonTitle: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  reasonButton: {
    width: '100%',
  },
  aviso: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    flexGrow: 1,
  },
  bubbleRow: {
    flexDirection: 'row',
    // Al pie: el ⋯ queda a la altura de la última línea de la burbuja, no
    // flotando al medio de un mensaje largo.
    alignItems: 'flex-end',
  },
  denunciarMensajeBtn: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bubbleMine: {
    backgroundColor: colors.brand,
  },
  bubbleOther: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  bubbleImage: {
    width: 200,
    height: 200,
    borderRadius: radius.md,
  },
  bubbleTextoConFoto: {
    marginTop: spacing.sm,
  },
  hojaFondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  hoja: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  hojaSubtitulo: {
    marginBottom: spacing.xs,
    lineHeight: 18,
  },
  hojaBoton: {
    width: '100%',
  },
  visorFondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visorImagen: {
    width: '100%',
    height: '80%',
  },
  visorCerrar: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
  },
  composer: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  previewImagen: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
  },
  previewQuitar: {
    marginLeft: -14,
    marginTop: -8,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
  },
  adjuntarButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  adjuntarButton: {
    flex: 1,
  },
  attachButton: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  cerrado: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
