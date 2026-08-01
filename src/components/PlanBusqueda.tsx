import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  etiquetaTiempo,
  planDeBusqueda,
  VENTANAS,
  type Ambito,
  type PasoPlan,
  type Temperamento,
  type VentanaId,
} from '../lib/planBusqueda';
import { getEstadoPlan, setPasoHecho, setPerfilPlan } from '../lib/planLocal';
import { resolverNavegacionGuia } from '../lib/guiaNavegacion';
import type { Pet } from '../services/pets';
import { AppText, Button, Card, Chip, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// EL PLAN DE BÚSQUEDA, EN LA FICHA DEL REPORTE PROPIO.
//
// La guía "recién se me perdió" dice bien qué hacer, pero se lo dice igual a
// todos y sin reloj. Acá el mismo contenido se ordena por HORAS y por especie
// (ver src/lib/planBusqueda.ts), que es como trabajan los grupos de rescate.
//
// Tono: alguien que acaba de perder a su animal. Nada de gamificación, ni
// porcentajes festivos, ni arengas. Una cosa a la vez: se abre la ventana que
// toca ahora, con el primer paso pendiente desplegado, y el resto queda a un
// toque de distancia.
//
// El progreso se guarda LOCAL (src/lib/planLocal.ts): sin migración, sin
// columna nueva. Si el almacenamiento falla, el plan se ve igual, desmarcado.

export interface PlanBusquedaProps {
  // `ambito` entra acá porque el dueño ya pudo haberlo contestado al publicar
  // (`SelectorAmbito` → `pets.ambito`, migración 0046). Sin esto, el plan
  // preguntaba lo mismo por segunda vez y podía mostrar el chip contrario al
  // que la persona había elegido cinco minutos antes.
  pet: Pick<Pet, 'id' | 'especie' | 'creado_en'> & { ambito?: Ambito | null };
  /** Convención del repo: el reloj entra por parámetro, nunca `new Date()` adentro. */
  ahora?: Date;
  navigation?: { navigate: (name: string, params?: Record<string, unknown>) => void };
  /** El generador de afiches vive en la ficha; el plan sólo lo llama. */
  onAfiche?: () => void;
}

export function PlanBusqueda({ pet, ahora, navigation, onAfiche }: PlanBusquedaProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);

  const [hechos, setHechos] = useState<Set<string>>(new Set());
  const [temperamento, setTemperamento] = useState<Temperamento | undefined>();
  const [ambito, setAmbito] = useState<Ambito | undefined>();
  const [abiertoManual, setAbiertoManual] = useState<Record<string, boolean>>({});
  const [ventanasAbiertas, setVentanasAbiertas] = useState<Record<string, boolean>>({});

  // El progreso guardado llega asíncrono; hasta entonces el plan se ve entero y
  // desmarcado, que es un estado válido y no bloquea la lectura.
  useEffect(() => {
    let vivo = true;
    getEstadoPlan(pet.id).then((e) => {
      if (!vivo) return;
      setHechos(new Set(e.hechos));
      setTemperamento(e.temperamento);
      // Lo guardado en el reporte gana sobre lo local: es lo que el dueño
      // contestó explícitamente al publicar. Lo local solo completa cuando el
      // reporte no tiene el dato (reportes de antes de la 0046, o la migración
      // todavía sin aplicar).
      setAmbito(e.ambito ?? pet.ambito ?? undefined);
    });
    return () => {
      vivo = false;
    };
    // `pet.ambito` en las dependencias: si el dueño lo edita, el plan tiene que
    // acompañar en vez de quedarse con la respuesta vieja.
  }, [pet.id, pet.ambito]);

  const plan = useMemo(
    () =>
      planDeBusqueda(
        { especie: pet.especie, temperamento, ambito },
        pet.creado_en,
        ahora ?? new Date(),
      ),
    [pet.especie, pet.creado_en, temperamento, ambito, ahora],
  );

  // "Lo que sigue": el primer paso sin marcar de la ventana que toca ahora. Si
  // ya está todo marcado ahí, se mira hacia adelante. Uno solo, nunca una lista
  // de tareas pendientes en la cara.
  const destacado = useMemo(() => {
    const desde = plan.ventanas.findIndex((v) => v.id === plan.ventanaActual);
    for (const v of plan.ventanas.slice(desde)) {
      const paso = v.pasos.find((p) => !hechos.has(p.id));
      if (paso) return paso;
    }
    return null;
  }, [plan, hechos]);

  const marcar = useCallback(
    (paso: PasoPlan) => {
      const hecho = !hechos.has(paso.id);
      setHechos((prev) => {
        const next = new Set(prev);
        if (hecho) next.add(paso.id);
        else next.delete(paso.id);
        return next;
      });
      // Persistimos sin esperar: el estado visual ya cambió y nunca lanza.
      setPasoHecho(pet.id, paso.id, hecho);
    },
    [hechos, pet.id],
  );

  const elegirTemperamento = (v: Temperamento) => {
    setTemperamento(v);
    setPerfilPlan(pet.id, { temperamento: v });
  };
  const elegirAmbito = (v: Ambito) => {
    setAmbito(v);
    setPerfilPlan(pet.id, { ambito: v });
  };

  const irA = (paso: PasoPlan) => {
    if (paso.accionLocal === 'afiche') {
      onAfiche?.();
      return;
    }
    if (!paso.accion || !navigation) return;
    const { name, params } = resolverNavegacionGuia(paso.accion.ruta, paso.accion.params);
    navigation.navigate(name, params);
  };

  const ventanaAbierta = (id: VentanaId, estado: string) =>
    ventanasAbiertas[id] ?? estado === 'actual';
  const pasoAbierto = (paso: PasoPlan) => abiertoManual[paso.id] ?? paso.id === destacado?.id;

  const tieneAccion = (paso: PasoPlan) =>
    (paso.accionLocal === 'afiche' && !!onAfiche) || (!!paso.accion && !!navigation);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="compass-outline" size={18} color={colors.brand} />
        <Title size={17} style={styles.headerTitle}>
          Plan de búsqueda
        </Title>
      </View>
      <AppText muted size={13} style={styles.reloj}>
        {etiquetaTiempo(plan.horas)}. {VENTANAS[plan.ventanaActual].entrada}
      </AppText>

      {/* Lo que el dueño nos cuenta cambia el plan de verdad: a un perro
          asustadizo no se lo busca como a uno sociable, ni a un gato de
          interior como a uno que salía solo. */}
      {pet.especie === 'perro' ? (
        <View style={styles.perfil}>
          <AppText muted size={12} style={styles.perfilPregunta}>
            Cuando se asusta, ¿se esconde o se acerca a la gente?
          </AppText>
          <View style={styles.perfilChips}>
            <Chip
              label="Se esconde"
              active={temperamento !== 'sociable'}
              onPress={() => elegirTemperamento('asustadizo')}
            />
            <Chip
              label="Se acerca"
              active={temperamento === 'sociable'}
              onPress={() => elegirTemperamento('sociable')}
            />
          </View>
        </View>
      ) : null}

      {pet.especie === 'gato' ? (
        <View style={styles.perfil}>
          <AppText muted size={12} style={styles.perfilPregunta}>
            ¿Salía solo a la calle?
          </AppText>
          <View style={styles.perfilChips}>
            <Chip
              label="Vivía adentro"
              active={ambito !== 'exterior'}
              onPress={() => elegirAmbito('interior')}
            />
            <Chip
              label="Salía solo"
              active={ambito === 'exterior'}
              onPress={() => elegirAmbito('exterior')}
            />
          </View>
        </View>
      ) : null}

      {plan.ventanas.map((ventana) => {
        const abierta = ventanaAbierta(ventana.id, ventana.estado);
        const pendientes = ventana.pasos.filter((p) => !hechos.has(p.id)).length;
        return (
          <View key={ventana.id} style={styles.ventana}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.ventanaHeader}
              onPress={() =>
                setVentanasAbiertas((prev) => ({ ...prev, [ventana.id]: !abierta }))
              }
              accessibilityRole="button"
              accessibilityLabel={`${ventana.titulo}, ${
                pendientes === 0 ? 'todo marcado' : `${pendientes} sin marcar`
              }`}
            >
              <View
                style={[
                  styles.ventanaPunto,
                  ventana.estado === 'actual' && styles.ventanaPuntoActual,
                  ventana.estado === 'pasada' && styles.ventanaPuntoPasada,
                ]}
              />
              <AppText
                weight={ventana.estado === 'actual' ? 'bold' : 'semi'}
                size={14}
                color={ventana.estado === 'actual' ? colors.ink : colors.muted}
                style={styles.ventanaTitulo}
              >
                {ventana.titulo}
              </AppText>
              <Ionicons
                name={abierta ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.muted}
              />
            </TouchableOpacity>

            {abierta
              ? ventana.pasos.map((paso) => {
                  const hecho = hechos.has(paso.id);
                  const abierto = pasoAbierto(paso);
                  const esElQueSigue = paso.id === destacado?.id;
                  return (
                    <View
                      key={paso.id}
                      style={[styles.paso, esElQueSigue && styles.pasoDestacado]}
                    >
                      <View style={styles.pasoFila}>
                        <TouchableOpacity
                          onPress={() => marcar(paso)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="checkbox"
                          // `aria-checked` además del state: react-native-web
                          // 0.21 ya no traduce `accessibilityState`.
                          accessibilityState={{ checked: hecho }}
                          aria-checked={hecho}
                          accessibilityLabel={`${paso.titulo}, marcar como hecho`}
                        >
                          <Ionicons
                            name={hecho ? 'checkmark-circle' : 'ellipse-outline'}
                            size={22}
                            color={hecho ? colors.found : colors.muted}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.pasoTexto}
                          activeOpacity={0.8}
                          onPress={() =>
                            setAbiertoManual((prev) => ({ ...prev, [paso.id]: !abierto }))
                          }
                          accessibilityRole="button"
                          accessibilityLabel={paso.titulo}
                        >
                          <AppText
                            weight="semi"
                            size={14}
                            style={[styles.pasoTitulo, hecho && styles.pasoTituloHecho]}
                          >
                            {paso.titulo}
                          </AppText>
                          {abierto ? (
                            <AppText muted size={13} style={styles.pasoDetalle}>
                              {paso.detalle}
                            </AppText>
                          ) : null}
                        </TouchableOpacity>
                      </View>

                      {abierto && tieneAccion(paso) ? (
                        <Button
                          title={paso.accionLocal === 'afiche' ? 'Crear el afiche' : paso.accion!.label}
                          variant="secondary"
                          onPress={() => irA(paso)}
                          style={styles.pasoBoton}
                        />
                      ) : null}
                    </View>
                  );
                })
              : null}
          </View>
        );
      })}

      <AppText muted size={12} style={styles.pie}>
        Lo que marcás queda sólo en este teléfono. Son consejos prácticos de búsqueda,
        no una indicación veterinaria.
      </AppText>
    </Card>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    card: {
      marginTop: spacing.md,
      gap: spacing.xs,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    headerTitle: {
      flexShrink: 1,
    },
    reloj: {
      lineHeight: 19,
      marginBottom: spacing.xs,
    },
    perfil: {
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    perfilPregunta: {
      lineHeight: 17,
    },
    perfilChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    ventana: {
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: spacing.sm,
      marginTop: spacing.xs,
    },
    ventanaHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    ventanaPunto: {
      width: 8,
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.line,
    },
    ventanaPuntoActual: {
      backgroundColor: colors.brand,
    },
    ventanaPuntoPasada: {
      backgroundColor: colors.muted,
    },
    ventanaTitulo: {
      flex: 1,
    },
    paso: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      gap: spacing.xs,
    },
    pasoDestacado: {
      backgroundColor: colors.sky,
    },
    pasoFila: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    pasoTexto: {
      flex: 1,
      gap: 2,
    },
    pasoTitulo: {
      lineHeight: 19,
    },
    pasoTituloHecho: {
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    pasoDetalle: {
      lineHeight: 19,
      marginTop: 2,
    },
    pasoBoton: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.lg,
      marginLeft: spacing.xl,
    },
    pie: {
      marginTop: spacing.sm,
      lineHeight: 17,
    },
  });
