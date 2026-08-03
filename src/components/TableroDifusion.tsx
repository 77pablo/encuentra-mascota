import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Input, Title } from '../ui';
import { spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { distanceLabel } from '../lib/geo';
import { notify } from '../lib/notify';
import { urlBusquedaMapa, abrirEnlace } from '../lib/mapas';
import { radioSugerido } from '../lib/radioSugerido';
import {
  agruparDestinos,
  Destino,
  resumenDifusion,
  sugerenciasDePersonas,
  validarEtiqueta,
} from '../lib/difusion';
import {
  agregarLugar,
  agregarPersona,
  borrarDestino,
  listarDestinos,
  LugarCerca,
  lugaresCerca,
  marcarAvisado,
} from '../services/difusion';
import type { Pet } from '../services/pets';

// TABLERO DE DIFUSION — "¿a quién le avisé?" (migracion 0063).
//
// POR QUE EXISTE: hay cuatro caminos de salida (texto, tarjeta, afiche, placa)
// y ninguno dejaba registro. Quien busca a su animal termina sin saber a quien
// ya le aviso, y repite o se olvida.
//
// LO QUE ESTE COMPONENTE NO HACE: no manda nada. Ningun lugar de la semilla
// recibe un correo ni un push. La lista es para que LA PERSONA avise.
//
// ATRIBUCION: los lugares son datos de OpenStreetMap bajo ODbL, que OBLIGA a
// atribuir. El credito va visible acá abajo, no escondido en un about.

export interface TableroDifusionProps {
  pet: Pick<Pet, 'id' | 'especie' | 'comuna' | 'creado_en' | 'ambito'>;
  onAfiche?: () => void;
}

const NOMBRE_CATEGORIA: Record<LugarCerca['categoria'], string> = {
  veterinaria: 'Veterinaria',
  refugio: 'Refugio',
};

export function TableroDifusion({ pet, onAfiche }: TableroDifusionProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);

  const [estado, setEstado] = useState<'cargando' | 'no-disponible' | 'listo'>('cargando');
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [lugares, setLugares] = useState<LugarCerca[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [agregandoLugar, setAgregandoLugar] = useState<string | null>(null);
  const [etiqueta, setEtiqueta] = useState('');
  const [errorEtiqueta, setErrorEtiqueta] = useState<string | undefined>();
  const [agregando, setAgregando] = useState(false);

  // El radio sale de radioSugerido (tanda 10), que ya calibra por especie,
  // ambito y dias transcurridos. Un numero nuevo aca seria una SEGUNDA fuente
  // de verdad para lo mismo (Critical #4 de la tanda 10).
  // OJO: devuelve un OBJETO. Hay que leer `.km`.
  const radioKm = useMemo(() => {
    const dias = Math.max(
      0,
      Math.floor((Date.now() - new Date(pet.creado_en).getTime()) / 86_400_000),
    );
    return radioSugerido({ especie: pet.especie, ambito: pet.ambito ?? undefined, dias }).km;
  }, [pet.especie, pet.ambito, pet.creado_en]);

  const cargar = useCallback(async () => {
    try {
      const t = await listarDestinos(pet.id);
      if (t.tipo === 'no-disponible') {
        setEstado('no-disponible');
        return;
      }
      setDestinos(t.destinos);
      // Los lugares son un agregado: si fallan, el tablero se muestra igual
      // con los destinos que el dueño escribio a mano.
      setLugares(await lugaresCerca(pet.id, radioKm).catch(() => []));
      setEstado('listo');
    } catch {
      // Best-effort (restricción global de la tanda 14: "Nada bloquea
      // publicar. Vector, semilla y tablero son best-effort"): un fallo
      // inesperado de red o de RLS al leer los destinos se trata igual que
      // "no disponible" — la ficha se ve exactamente como hoy, sin el
      // tablero, en vez de trabarse.
      setEstado('no-disponible');
    }
  }, [pet.id, radioKm]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Recarga sólo los destinos (agregar/marcar/borrar): los lugares no cambian
  // con esas acciones, así que no vale la pena repetir esa llamada.
  const recargarDestinos = useCallback(async () => {
    const t = await listarDestinos(pet.id);
    if (t.tipo === 'listo') setDestinos(t.destinos);
  }, [pet.id]);

  // La ficha tiene que quedar EXACTAMENTE como hoy si la migracion no esta.
  if (estado === 'no-disponible') return null;
  if (estado === 'cargando') return null;

  const { pendientes, avisados } = agruparDestinos(destinos);
  const lugaresEnTablero = new Set(
    destinos.filter((d) => d.tipo === 'lugar').map((d) => d.lugarId),
  );

  const onToggle = async (d: Destino) => {
    setOcupado(d.id);
    try {
      await marcarAvisado(d.id, d.estado !== 'avisado');
      await recargarDestinos();
    } catch (e: any) {
      notify('No se pudo actualizar', mensajeDeErrorDb(e));
    } finally {
      setOcupado(null);
    }
  };

  const onQuitar = async (d: Destino) => {
    setOcupado(d.id);
    try {
      await borrarDestino(d.id);
      await recargarDestinos();
    } catch (e: any) {
      notify('No se pudo quitar', mensajeDeErrorDb(e));
    } finally {
      setOcupado(null);
    }
  };

  const onAgregarPersona = async () => {
    const v = validarEtiqueta(etiqueta);
    if (!v.ok) {
      setErrorEtiqueta(v.motivo);
      return;
    }
    setErrorEtiqueta(undefined);
    setAgregando(true);
    try {
      await agregarPersona(pet.id, etiqueta);
      setEtiqueta('');
      await recargarDestinos();
    } catch (e: any) {
      notify('No se pudo agregar', mensajeDeErrorDb(e));
    } finally {
      setAgregando(false);
    }
  };

  const onAgregarLugar = async (lugarId: string) => {
    setAgregandoLugar(lugarId);
    try {
      await agregarLugar(pet.id, lugarId);
      await recargarDestinos();
    } catch (e: any) {
      notify('No se pudo agregar', mensajeDeErrorDb(e));
    } finally {
      setAgregandoLugar(null);
    }
  };

  const etiquetaDe = (d: Destino) => d.etiqueta ?? 'Destino';

  const filaDestino = (d: Destino) => {
    const avisado = d.estado === 'avisado';
    return (
      <View key={d.id} style={styles.fila}>
        <TouchableOpacity
          onPress={() => onToggle(d)}
          disabled={ocupado === d.id}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="checkbox"
          // `aria-checked` además del state: react-native-web 0.21 ya no
          // traduce `accessibilityState`.
          accessibilityState={{ checked: avisado }}
          aria-checked={avisado}
          accessibilityLabel={`${etiquetaDe(d)}, marcar como avisado`}
        >
          <Ionicons
            name={avisado ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={avisado ? colors.found : colors.muted}
          />
        </TouchableOpacity>
        <AppText size={14} style={[styles.filaTexto, avisado ? styles.filaTextoHecho : null]}>
          {etiquetaDe(d)}
        </AppText>
        <TouchableOpacity
          onPress={() => onQuitar(d)}
          disabled={ocupado === d.id}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Quitar a ${etiquetaDe(d)} del tablero`}
        >
          <Ionicons name="close" size={18} color={colors.muted} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="megaphone" size={18} color={colors.brand} />
        <Title size={17} style={styles.headerTitle}>
          Tablero de difusión
        </Title>
      </View>
      <AppText muted size={13} style={styles.resumen}>
        {resumenDifusion(destinos)}
      </AppText>

      {pendientes.length > 0 ? (
        <View style={styles.seccion}>
          <AppText weight="semi" muted size={13}>
            Por avisar
          </AppText>
          {pendientes.map(filaDestino)}
        </View>
      ) : null}

      {avisados.length > 0 ? (
        <View style={styles.seccion}>
          <AppText weight="semi" muted size={13}>
            Ya avisados
          </AppText>
          {avisados.map(filaDestino)}
        </View>
      ) : null}

      <View style={styles.seccion}>
        <Input
          label="Agregar a quién avisarle"
          placeholder="Ej: la junta de vecinos"
          value={etiqueta}
          onChangeText={(v) => {
            setEtiqueta(v);
            setErrorEtiqueta(undefined);
          }}
        />
        {errorEtiqueta ? (
          <AppText size={12} style={[styles.errorTexto, { color: colors.lost }]}>
            {errorEtiqueta}
          </AppText>
        ) : null}
        <View style={styles.sugerencias}>
          {sugerenciasDePersonas(pet).map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setEtiqueta(s)}
              accessibilityRole="button"
              accessibilityLabel={`Usar la sugerencia: ${s}`}
              style={styles.sugerencia}
            >
              <AppText size={12} style={{ color: colors.brand }}>
                {s}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>
        <Button
          title="Agregar"
          variant="secondary"
          icon="add"
          loading={agregando}
          disabled={agregando || etiqueta.trim().length === 0}
          onPress={onAgregarPersona}
          style={styles.botonAgregar}
        />
      </View>

      {lugares.length > 0 ? (
        <View style={styles.seccion}>
          <AppText weight="semi" muted size={13}>
            Cerca tuyo
          </AppText>
          {lugares.map((l) => {
            const yaEnTablero = lugaresEnTablero.has(l.id);
            return (
              <View key={l.id} style={styles.lugar}>
                <AppText size={14} weight="semi">
                  {l.nombre}
                </AppText>
                <AppText muted size={12} style={styles.lugarDetalle}>
                  {NOMBRE_CATEGORIA[l.categoria]} · {distanceLabel(l.distanciaKm)}
                  {l.direccion ? ` · ${l.direccion}` : ''}
                </AppText>
                <View style={styles.lugarAcciones}>
                  <Button
                    title="Buscar en Maps"
                    variant="ghost"
                    icon="map-outline"
                    onPress={() => abrirEnlace(urlBusquedaMapa(`${l.nombre} ${l.comuna ?? ''}`.trim()))}
                    style={styles.lugarBoton}
                  />
                  {!yaEnTablero ? (
                    <Button
                      title="Agregar al tablero"
                      variant="secondary"
                      loading={agregandoLugar === l.id}
                      disabled={agregandoLugar === l.id}
                      onPress={() => onAgregarLugar(l.id)}
                      style={styles.lugarBoton}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
          <AppText muted size={11} style={styles.atribucion}>
            © colaboradores de OpenStreetMap
          </AppText>
        </View>
      ) : null}

      {onAfiche ? (
        <Button
          title="Crear el afiche"
          variant="secondary"
          icon="print"
          onPress={onAfiche}
          style={styles.botonAfiche}
        />
      ) : null}
    </Card>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    card: {
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    headerTitle: {
      flexShrink: 1,
    },
    resumen: {
      lineHeight: 19,
    },
    seccion: {
      gap: spacing.xs,
      marginTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: spacing.sm,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    filaTexto: {
      flex: 1,
      lineHeight: 19,
    },
    filaTextoHecho: {
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    errorTexto: {
      marginTop: -spacing.xs,
    },
    sugerencias: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    sugerencia: {
      paddingVertical: spacing.xs,
    },
    botonAgregar: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.lg,
    },
    lugar: {
      gap: 2,
      paddingVertical: spacing.xs,
    },
    lugarDetalle: {
      lineHeight: 17,
    },
    lugarAcciones: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    lugarBoton: {
      paddingHorizontal: spacing.lg,
      minHeight: 40,
    },
    atribucion: {
      marginTop: spacing.xs,
    },
    botonAfiche: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.lg,
      marginTop: spacing.xs,
    },
  });
