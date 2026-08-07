import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Loading, Screen, Title } from '../ui';
import { spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import ReportesLista from '../components/ReportesLista';
import { eventoPorId, type Evento } from '../services/eventos';
import type { FiltrosBusqueda } from '../services/busqueda';

// Pantalla de un evento de emergencia (Tanda 19). Se abre desde el banner de
// Inicio o por deep link (`evento/:id`), en modo invitado. Trae el evento por
// id y muestra los reportes de su ZONA desde que empezó, reusando el mismo feed
// paginado que Explorar (`ReportesLista` + `buscar_reportes`): no hay un feed
// nuevo ni se etiquetan reportes, la zona + la ventana hacen el trabajo.
export default function EventoScreen({ route, navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const id: string | undefined = route?.params?.id;
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'noExiste' | 'error'>('cargando');
  const [evento, setEvento] = useState<Evento | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!id) {
      setEstado('noExiste');
      return;
    }
    eventoPorId(id)
      .then((ev) => {
        if (!vivo) return;
        setEvento(ev);
        setEstado(ev ? 'listo' : 'noExiste');
      })
      .catch(() => vivo && setEstado('error'));
    return () => {
      vivo = false;
    };
  }, [id]);

  if (estado === 'cargando') {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (estado !== 'listo' || !evento) {
    return (
      <Screen>
        <View style={styles.centro}>
          <Title size={18}>
            {estado === 'error' ? 'No pudimos abrir la emergencia' : 'Esta emergencia ya no está'}
          </Title>
          <AppText muted size={14} style={styles.centroTexto}>
            {estado === 'error'
              ? 'Probá de nuevo en un rato.'
              : 'Puede que haya terminado. Mirá los reportes desde Explorar.'}
          </AppText>
        </View>
      </Screen>
    );
  }

  // El feed del evento: reportes en la zona (centro + radio) desde que empezó.
  const filtros: FiltrosBusqueda = {
    lat: evento.lat,
    lng: evento.lng,
    radioKm: evento.radio_km,
    desde: new Date(evento.desde),
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Title size={22}>{evento.nombre}</Title>
        {evento.descripcion ? (
          <AppText muted size={14} style={styles.desc}>
            {evento.descripcion}
          </AppText>
        ) : null}
        <AppText muted size={12} style={styles.desc}>
          Reportes de mascotas perdidas y encontradas en la zona afectada.
        </AppText>
      </View>
      <ReportesLista filtros={filtros} navigation={navigation} ofrecerSeguirComuna={false} />
    </Screen>
  );
}

function crearEstilos(colors: Colors) {
  return StyleSheet.create({
    header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.xs },
    desc: { lineHeight: 19 },
    centro: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
    centroTexto: { textAlign: 'center' },
  });
}
