import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
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
import { supabase } from '../lib/supabase';
import { bloqueEmitido, bloquear, desbloquear } from '../services/bloqueos';
import { denunciarUsuario, MOTIVOS_DENUNCIA } from '../services/moderation';
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
  const { refresh: refreshUnread } = useUnread();
  const [otroEliminado, setOtroEliminado] = useState(false);
  const [otroNombre, setOtroNombre] = useState<string | null>(null);
  // Bloqueo/denuncia desde el propio chat.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [procesandoBloqueo, setProcesandoBloqueo] = useState(false);
  const [mostrarMotivos, setMostrarMotivos] = useState(false);
  const [enviandoDenuncia, setEnviandoDenuncia] = useState(false);

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

  const onSend = async () => {
    const t = texto;
    setTexto('');
    try {
      await sendMessage(ctx, me, otherUserId, t);
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
      supabase.functions
        .invoke('send-push', {
          body: {
            toUserId: otherUserId,
            title: ctx.tipo === 'adopcion' ? 'Nuevo mensaje sobre una adopción' : 'Nuevo mensaje sobre una mascota',
            body: t.slice(0, 80),
            ruta,
          },
        })
        .catch((e) => console.warn('No se pudo mandar el aviso push del mensaje:', e));
    } catch {
      setTexto(t); // restaurar si falla
    }
  };

  const puedeEnviar = texto.trim().length > 0;

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
            return (
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  <AppText size={15} color={mine ? colors.white : colors.ink}>
                    {item.texto}
                  </AppText>
                </View>
              </View>
            );
          }}
        />
        {otroEliminado ? (
          <View style={styles.inputRow}>
            <AppText muted style={styles.cerrado}>
              Esta persona borró su cuenta. La conversación queda como recuerdo.
            </AppText>
          </View>
        ) : bloqueado ? (
          <View style={styles.inputRow}>
            <AppText muted style={styles.cerrado}>
              Bloqueaste a esta persona. Podés desbloquearla desde el menú de arriba.
            </AppText>
          </View>
        ) : (
          <View style={styles.inputRow}>
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
              disabled={!puedeEnviar}
              style={[styles.sendButton, !puedeEnviar && styles.sendButtonDisabled]}
            >
              <Ionicons name="send" size={18} color={colors.white} />
            </TouchableOpacity>
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
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
