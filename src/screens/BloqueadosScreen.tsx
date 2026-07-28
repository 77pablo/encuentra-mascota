import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { desbloquear, listarBloqueados, PersonaBloqueada } from '../services/bloqueos';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { confirmAction, notify } from '../lib/notify';
import { useAuth } from '../hooks/useAuth';
import { timeAgo } from '../lib/time';
import { AppText, Button, Card, EmptyState, ErrorState, Loading, Screen } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// PERSONAS BLOQUEADAS (Perfil → Personas bloqueadas).
//
// Hasta ahora la unica forma de deshacer un bloqueo era volver a entrar al
// perfil publico o al chat de esa persona — justo lo que nadie quiere hacer con
// alguien a quien bloqueo. Ademas las dos tiendas piden que el bloqueo sea
// visible y reversible desde un lugar propio.
//
// La pantalla es a proposito lo mas seca posible: nombre, cuando la bloqueaste
// y un boton para deshacerlo. Sin enlace a su perfil ni a su contenido: sumar
// atajos hacia esa persona seria trabajar en contra de por que se la bloqueo.
export default function BloqueadosScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { user } = useAuth();
  const [personas, setPersonas] = useState<PersonaBloqueada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // userId en curso: deshabilita solo SU boton mientras se procesa, no todos.
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = useCallback(() => {
    // Sin sesion no hay bloqueos que mostrar. No deberia pasar (a esta pantalla
    // se llega desde el Perfil con sesion), pero si pasara el spinner se
    // quedaria girando para siempre.
    if (!user) {
      setPersonas([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    listarBloqueados()
      .then(setPersonas)
      .catch((e: any) => setError(mensajeDeErrorDb(e)))
      .finally(() => setCargando(false));
  }, [user]);

  useFocusEffect(cargar);

  const quitarBloqueo = async (persona: PersonaBloqueada) => {
    const comoSeLlama = persona.nombre ?? 'esta persona';
    const ok = await confirmAction(
      `¿Desbloquear a ${comoSeLlama}?`,
      'Va a poder escribirte de nuevo y vas a volver a ver lo que publique.',
    );
    if (!ok) return;
    setProcesando(persona.userId);
    try {
      await desbloquear(persona.userId);
      // Se saca de la lista en el acto en vez de recargar: la respuesta es
      // inmediata y `useFocusEffect` ya recarga de verdad al volver a entrar.
      setPersonas((prev) => prev.filter((p) => p.userId !== persona.userId));
      notify('Desbloqueada', 'Esta persona vuelve a poder escribirte.');
    } catch (e: any) {
      notify('No se pudo desbloquear', mensajeDeErrorDb(e));
    } finally {
      setProcesando(null);
    }
  };

  if (cargando) return <Loading />;

  if (error) {
    return (
      <Screen padded>
        <ErrorState message={error} onRetry={cargar} />
      </Screen>
    );
  }

  return (
    <Screen padded>
      <FlatList
        data={personas}
        keyExtractor={(p) => p.userId}
        contentContainerStyle={styles.lista}
        ItemSeparatorComponent={() => <View style={styles.separador} />}
        ListHeaderComponent={
          personas.length > 0 ? (
            <AppText muted size={13} style={styles.ayuda}>
              Estas personas no pueden escribirte y no ves lo que publican. Podés deshacerlo cuando
              quieras.
            </AppText>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            emoji="🙂"
            title="No bloqueaste a nadie"
            subtitle="Si alguien te molesta, podés bloquearlo desde su perfil o desde el chat."
          />
        }
        renderItem={({ item }) => (
          <Card style={styles.fila}>
            <View style={styles.avatar}>
              <Ionicons name="person-outline" size={20} color={colors.muted} />
            </View>
            <View style={styles.info}>
              <AppText weight="semi" size={15} numberOfLines={1}>
                {item.nombre ?? 'Persona bloqueada'}
              </AppText>
              <AppText muted size={12}>
                Bloqueada {timeAgo(item.creadoEn)}
              </AppText>
            </View>
            <Button
              title="Desbloquear"
              variant="secondary"
              loading={procesando === item.userId}
              disabled={procesando != null}
              onPress={() => quitarBloqueo(item)}
              style={styles.boton}
            />
          </Card>
        )}
      />
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  lista: {
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  ayuda: {
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  separador: {
    height: spacing.sm,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  boton: {
    paddingHorizontal: spacing.md,
  },
});
