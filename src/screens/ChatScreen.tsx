import React, { useEffect, useState } from 'react';
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
import { markThreadRead, sendMessage } from '../services/messages';
import { supabase } from '../lib/supabase';
import { AppText, AvisoEstafa, Screen } from '../ui';
import { colors, font, radius, spacing } from '../theme';

export default function ChatScreen({ route }: any) {
  const { petId, otherUserId } = route.params;
  const { user } = useAuth();
  const me = user!.id;
  const messages = useRealtimeMessages(petId, me, otherUserId);
  const [texto, setTexto] = useState('');
  const { refresh: refreshUnread } = useUnread();
  const [otroEliminado, setOtroEliminado] = useState(false);

  useEffect(() => {
    markThreadRead(petId, me, otherUserId)
      .then(() => refreshUnread())
      .catch((e) => console.error('No se pudo marcar el hilo como leído:', e));
  }, [petId, me, otherUserId, messages.length, refreshUnread]);

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
    // El builder de supabase es un PromiseLike, no un Promise completo (no
    // tiene `.catch`); lo envolvemos en Promise.resolve para poder atrapar el
    // rechazo sin dejar una promesa suelta.
    Promise.resolve(
      supabase.from('profiles').select('eliminado_en').eq('id', otherUserId).maybeSingle(),
    )
      .then(({ data }) => {
        if (vivo) setOtroEliminado(Boolean(data?.eliminado_en));
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
      await sendMessage(petId, me, otherUserId, t);
      // Push "best effort": si falla, el chat igual funcionó, así que no le
      // mostramos nada al usuario. Pero SÍ lo dejamos en la consola: este
      // `catch` vacío tapó durante semanas que la función `send-push` ni
      // siquiera estaba desplegada (respondía 404) y nadie se enteró.
      supabase.functions
        .invoke('send-push', {
          body: { toUserId: otherUserId, title: 'Nuevo mensaje sobre una mascota', body: t.slice(0, 80) },
        })
        .catch((e) => console.warn('No se pudo mandar el aviso push del mensaje:', e));
    } catch {
      setTexto(t); // restaurar si falla
    }
  };

  const puedeEnviar = texto.trim().length > 0;

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
