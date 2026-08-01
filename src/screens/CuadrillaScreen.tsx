import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Cuadrilla,
  Invitacion,
  agregarTarea,
  borrarTarea,
  completarTarea,
  crearCuadrilla,
  estadoDeCuadrilla,
  invitacionPorToken,
  listarMiembros,
  listarTareas,
  soltarTarea,
  sumarmeALaCuadrilla,
  tomarTarea,
} from '../services/cuadrilla';
import {
  Miembro,
  TAREA_MAX,
  Tarea,
  agruparTareas,
  puedeCompletar,
  puedeSoltar,
  puedeTomar,
  quienLaTiene,
  resumenCuadrilla,
  sugerenciaDeInvitacion,
  tareasSugeridas,
} from '../lib/cuadrilla';
import { getPet, Pet } from '../services/pets';
import { shareCuadrillaInvite } from '../lib/share';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { notify } from '../lib/notify';
import { useAuth } from '../hooks/useAuth';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { AppText, Button, Card, EmptyState, ErrorState, Input, Loading, Screen, Title } from '../ui';
import { Colors, radius, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// CUADRILLA — organizar la búsqueda física del barrio (migración 0048).
//
// Dos formas de entrar:
//   · `{ petId }`  — desde la ficha del reporte (el dueño, o alguien que ya se
//                    sumó y vuelve por ahí).
//   · `{ token }`  — desde el link de WhatsApp (`/cuadrilla/:token`), en modo
//                    invitado, igual que la página del collar.
//
// LO QUE PASA SI LA MIGRACIÓN 0048 NO ESTÁ APLICADA (el caso real: el dueño
// sube la web antes de correr el SQL): las funciones del servicio devuelven
// `no-disponible` en vez de romper, y esta pantalla lo dice con todas las
// letras — NUNCA "el link está vencido", que sería mentirle a un vecino que
// quiso ayudar. La ficha del reporte, por su parte, ni siquiera muestra la
// entrada (ver PetDetailScreen).
//
// TRES COSAS QUE ESTA PANTALLA NO HACE, A PROPÓSITO:
//   · No gamifica. Sin puntajes, sin rankings, sin insignias, sin confeti. Del
//     otro lado hay alguien angustiado.
//   · No promete avisos. La cuadrilla no manda notificaciones a nadie (eso
//     exigiría tocar la cola de avisos y su Edge Function, fuera de alcance).
//   · No trata "una sola persona" como un fracaso. Es el estado normal del
//     primer minuto, y el tablero ya le sirve al dueño tal cual está.

type Vista =
  | { modo: 'cargando' }
  | { modo: 'no-disponible' }
  | { modo: 'no-existe' }
  | { modo: 'invitacion'; invitacion: Invitacion }
  | { modo: 'crear' }
  | { modo: 'tablero'; cuadrilla: Cuadrilla };

export default function CuadrillaScreen({ route, navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { user } = useAuth();
  const requireAuth = useRequireAuth();

  const token: string | undefined = route?.params?.token;
  const petIdParam: string | undefined = route?.params?.petId;

  const [vista, setVista] = useState<Vista>({ modo: 'cargando' });
  const [pet, setPet] = useState<Pet | null>(null);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [sumandome, setSumandome] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nuevaTarea, setNuevaTarea] = useState('');
  const [agregando, setAgregando] = useState(false);

  // El reporte se lee aparte y su fallo NO tumba el tablero: sirve para el
  // título y para el texto de la invitación, no para funcionar.
  const cargarPet = useCallback(async (id: string) => {
    try {
      const p = await getPet(id);
      setPet(p);
      return p;
    } catch {
      return null;
    }
  }, []);

  const cargarTablero = useCallback(async (cuadrilla: Cuadrilla) => {
    const [t, m] = await Promise.all([listarTareas(cuadrilla.id), listarMiembros(cuadrilla.id)]);
    setTareas(t);
    setMiembros(m);
    setVista({ modo: 'tablero', cuadrilla });
  }, []);

  const cargar = useCallback(async () => {
    setError(null);
    setVista({ modo: 'cargando' });
    try {
      // Entrada por link.
      if (token) {
        const r = await invitacionPorToken(token);
        if (r.tipo === 'no-disponible') return setVista({ modo: 'no-disponible' });
        if (r.tipo === 'no-existe') return setVista({ modo: 'no-existe' });
        await cargarPet(r.invitacion.petId);
        if (!r.invitacion.yaEstoy) return setVista({ modo: 'invitacion', invitacion: r.invitacion });
        // Ya soy de la cuadrilla: se entra derecho, sin pedirle nada de nuevo.
        const est = await estadoDeCuadrilla(r.invitacion.petId);
        if (est.tipo === 'no-disponible') return setVista({ modo: 'no-disponible' });
        if (est.tipo === 'sin-crear') return setVista({ modo: 'no-existe' });
        return cargarTablero(est.cuadrilla);
      }

      // Entrada desde la ficha del reporte.
      if (!petIdParam) return setVista({ modo: 'no-existe' });
      const p = await cargarPet(petIdParam);
      const est = await estadoDeCuadrilla(petIdParam);
      if (est.tipo === 'no-disponible') return setVista({ modo: 'no-disponible' });
      if (est.tipo === 'sin-crear') {
        // La RLS no devuelve la fila a quien no es del grupo, así que "sin
        // crear" y "existe pero no soy de acá" se ven igual desde el cliente.
        // Solo el dueño ve la opción de armarla.
        return setVista(p && p.user_id === user?.id ? { modo: 'crear' } : { modo: 'no-existe' });
      }
      return cargarTablero(est.cuadrilla);
    } catch (e: any) {
      setError(mensajeDeErrorDb(e));
    }
  }, [token, petIdParam, user?.id, cargarPet, cargarTablero]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const recargarTareas = useCallback(async (cuadrilla: Cuadrilla) => {
    try {
      const [t, m] = await Promise.all([listarTareas(cuadrilla.id), listarMiembros(cuadrilla.id)]);
      setTareas(t);
      setMiembros(m);
    } catch (e: any) {
      notify('No se pudo actualizar', mensajeDeErrorDb(e));
    }
  }, []);

  // ── Acciones ────────────────────────────────────────────────────────────
  const conCuadrilla = vista.modo === 'tablero' ? vista.cuadrilla : null;
  const esDueno = !!conCuadrilla && !!user && conCuadrilla.duenoId === user.id;

  const accionSobreTarea = async (tarea: Tarea, fn: () => Promise<unknown>) => {
    if (!conCuadrilla) return;
    setOcupada(tarea.id);
    try {
      await fn();
    } catch (e: any) {
      notify('No se pudo', mensajeDeErrorDb(e));
    } finally {
      setOcupada(null);
      // Se recarga SIEMPRE, también al fallar: si a alguien se le adelantaron,
      // lo que está viendo en pantalla ya no es verdad.
      await recargarTareas(conCuadrilla);
    }
  };

  const onTomar = (t: Tarea) => {
    if (!user) return;
    accionSobreTarea(t, () => tomarTarea(t.id, user.id));
  };
  const onSoltar = (t: Tarea) => accionSobreTarea(t, () => soltarTarea(t.id));
  const onCompletar = (t: Tarea) => accionSobreTarea(t, () => completarTarea(t.id));
  const onBorrar = (t: Tarea) => accionSobreTarea(t, () => borrarTarea(t.id));

  const onAgregar = async () => {
    if (!conCuadrilla) return;
    setAgregando(true);
    try {
      await agregarTarea(conCuadrilla.id, nuevaTarea);
      setNuevaTarea('');
      await recargarTareas(conCuadrilla);
    } catch (e: any) {
      notify('No se pudo agregar', mensajeDeErrorDb(e));
    } finally {
      setAgregando(false);
    }
  };

  const onInvitar = async () => {
    if (!conCuadrilla || !pet) return;
    try {
      await shareCuadrillaInvite(pet, conCuadrilla.token);
    } catch (e: any) {
      notify('No se pudo compartir', mensajeDeErrorDb(e));
    }
  };

  const onCrear = async () => {
    if (!pet) return;
    setCreando(true);
    try {
      await crearCuadrilla(pet.id, tareasSugeridas(pet));
      await cargar();
    } catch (e: any) {
      notify('No se pudo armar la cuadrilla', mensajeDeErrorDb(e));
    } finally {
      setCreando(false);
    }
  };

  const onSumarme = async () => {
    if (!token || vista.modo !== 'invitacion') return;
    const petId = vista.invitacion.petId;
    // El portero del modo invitado: sumarse pide cuenta (ver el comentario
    // largo de la migración 0048).
    if (!requireAuth('cuadrilla')) return;
    setSumandome(true);
    try {
      const id = await sumarmeALaCuadrilla(token);
      if (!id) {
        notify('No pudimos sumarte', 'Este enlace ya no está disponible.');
        return;
      }
      // Se entra derecho al tablero con el id que acaba de devolver la RPC, sin
      // volver a preguntar por el token: si se rehiciera la lectura de la
      // invitación y esa respuesta viniera un instante desactualizada, la
      // persona terminaría mirando otra vez la pantalla de "sumarme" DESPUÉS de
      // haberse sumado, y tocaría el botón de nuevo.
      const est = await estadoDeCuadrilla(petId);
      if (est.tipo === 'lista') return cargarTablero(est.cuadrilla);
      await cargar();
    } catch (e: any) {
      notify('No pudimos sumarte', mensajeDeErrorDb(e));
    } finally {
      setSumandome(false);
    }
  };

  // ── Estados que no son el tablero ───────────────────────────────────────
  if (error) {
    return (
      <Screen padded>
        <ErrorState message={error} onRetry={cargar} />
      </Screen>
    );
  }

  if (vista.modo === 'cargando') return <Loading />;

  if (vista.modo === 'no-disponible') {
    // La migración 0048 no está aplicada. Se dice tal cual: el enlace está
    // perfecto, lo que falta es del lado nuestro.
    return (
      <Screen padded>
        <EmptyState
          emoji="🛠️"
          title="Esto todavía no está disponible"
          subtitle="La búsqueda organizada se está terminando de habilitar. El enlace sigue sirviendo: probá de nuevo más tarde."
        />
      </Screen>
    );
  }

  if (vista.modo === 'no-existe') {
    return (
      <Screen padded>
        <EmptyState
          emoji="🔎"
          title="No encontramos esta cuadrilla"
          subtitle="Puede que ya no esté activa o que el enlace haya cambiado. Pedile el link de nuevo a quien te invitó."
        />
      </Screen>
    );
  }

  // Armar la cuadrilla: se muestra ANTES qué tareas van a quedar creadas. Un
  // botón que crea seis cosas sin decir cuáles es un salto al vacío.
  if (vista.modo === 'crear') {
    const sugeridas = pet ? tareasSugeridas(pet) : [];
    const nombre = pet?.nombre?.trim() || 'tu mascota';
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Title size={24}>Organizar la búsqueda de {nombre}</Title>
          <AppText muted size={15} style={styles.parrafo}>
            Recorrer el barrio es lo que más reencuentros consigue. Lo difícil no es que alguien
            quiera ayudar: es saber qué pedirle. Esto arma una lista corta de tareas concretas y un
            link para mandarle a tus vecinos por WhatsApp.
          </AppText>
          <Card style={styles.card}>
            <AppText weight="semi" size={15}>
              Vas a arrancar con estas tareas:
            </AppText>
            {sugeridas.map((t) => (
              <View key={t} style={styles.sugerida}>
                <Ionicons name="ellipse-outline" size={14} color={colors.muted} />
                <AppText size={14} style={styles.sugeridaTexto}>
                  {t}
                </AppText>
              </View>
            ))}
            <AppText muted size={13}>
              Después las podés cambiar, borrar o agregar las que quieras.
            </AppText>
          </Card>
          <Button
            title="Organizar la búsqueda"
            icon="people"
            loading={creando}
            disabled={creando || !pet}
            onPress={onCrear}
            style={styles.cta}
          />
        </ScrollView>
      </Screen>
    );
  }

  // Vista previa del link (anónima). Se ve DE QUÉ SE TRATA antes de pedir nada.
  if (vista.modo === 'invitacion') {
    const inv = vista.invitacion;
    const nombre = inv.mascota?.trim() || 'una mascota';
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          {inv.foto ? (
            <Image source={{ uri: inv.foto }} style={styles.foto} />
          ) : (
            <View style={[styles.foto, styles.fotoVacia]}>
              <AppText size={64}>🐾</AppText>
            </View>
          )}
          <Title size={24} align="center">
            Te invitaron a buscar a {nombre}
          </Title>
          <AppText muted size={15} align="center" style={styles.parrafo}>
            {inv.comuna
              ? `Se perdió en ${inv.comuna} y hay gente recorriendo el barrio.`
              : 'Hay gente recorriendo el barrio para encontrarla.'}
          </AppText>

          {!inv.reporteActivo ? (
            <Card style={styles.card}>
              <AppText size={15}>
                Este reporte ya no está activo. Puede que {nombre} haya vuelto a casa.
              </AppText>
            </Card>
          ) : (
            <>
              <Card style={styles.card}>
                <AppText weight="semi" size={16}>
                  {resumenDeInvitacion(inv)}
                </AppText>
                <AppText muted size={14}>
                  Son tareas cortas y concretas: pegar unos carteles, recorrer unas cuadras,
                  preguntar en los negocios. Elegís la que puedas y listo.
                </AppText>
              </Card>
              <Button
                title="Sumarme a buscar"
                icon="people"
                loading={sumandome}
                disabled={sumandome}
                onPress={onSumarme}
                style={styles.cta}
              />
              <AppText muted size={13} align="center">
                Sumarte necesita una cuenta: es la forma de que quien busca sepa quién se hizo cargo
                de cada tarea.
              </AppText>
            </>
          )}
        </ScrollView>
      </Screen>
    );
  }

  // ── El tablero ──────────────────────────────────────────────────────────
  const grupos = agruparTareas(tareas);
  const nombreMascota = pet?.nombre?.trim() || 'la búsqueda';
  const miId = user?.id ?? null;

  const filaTarea = (t: Tarea, apagada = false) => {
    const firma = quienLaTiene(t, miembros, miId);
    return (
      <View key={t.id} style={[styles.tarea, apagada && styles.tareaHecha]}>
        <View style={styles.tareaTexto}>
          <AppText size={15} style={apagada ? styles.tachada : undefined}>
            {t.titulo}
          </AppText>
          {firma ? (
            <AppText muted size={13}>
              {firma}
            </AppText>
          ) : null}
        </View>
        <View style={styles.tareaAcciones}>
          {puedeTomar(t, miId, esDueno) ? (
            <Button
              title="La tomo"
              variant="secondary"
              loading={ocupada === t.id}
              disabled={!!ocupada}
              onPress={() => onTomar(t)}
            />
          ) : null}
          {puedeCompletar(t, miId, esDueno) ? (
            <Button
              title="Listo"
              variant="secondary"
              icon="checkmark"
              loading={ocupada === t.id}
              disabled={!!ocupada}
              onPress={() => onCompletar(t)}
            />
          ) : null}
          {puedeSoltar(t, miId, esDueno) ? (
            <Button
              title="Soltar"
              variant="ghost"
              disabled={!!ocupada}
              onPress={() => onSoltar(t)}
            />
          ) : null}
          {esDueno ? (
            <Button title="Borrar" variant="ghost" disabled={!!ocupada} onPress={() => onBorrar(t)} />
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={22}>Cuadrilla · {nombreMascota}</Title>
        <AppText muted size={14}>
          {resumenCuadrilla(miembros.length, tareas)}
        </AppText>

        {/* Invitar está arriba de todo y siempre: es lo único que hace crecer
            la cuadrilla, y con una sola persona es LA acción de la pantalla. */}
        <Card style={styles.card}>
          <AppText size={14}>{sugerenciaDeInvitacion(miembros.length)}</AppText>
          <Button
            title="Invitar por WhatsApp"
            icon="logo-whatsapp"
            disabled={!pet}
            onPress={onInvitar}
            style={styles.cta}
          />
        </Card>

        {miembros.length > 1 ? (
          <View style={styles.miembros}>
            {miembros.map((m) => (
              <View key={m.userId} style={styles.miembro}>
                <Ionicons name="person-circle-outline" size={18} color={colors.brand} />
                <AppText size={14}>
                  {m.userId === miId ? 'Vos' : m.nombre?.trim() || 'Un vecino'}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {grupos.pendientes.length > 0 ? (
          <View style={styles.seccion}>
            <Title size={16}>Sin tomar</Title>
            {grupos.pendientes.map((t) => filaTarea(t))}
          </View>
        ) : null}

        {grupos.tomadas.length > 0 ? (
          <View style={styles.seccion}>
            <Title size={16}>En eso están</Title>
            {grupos.tomadas.map((t) => filaTarea(t))}
          </View>
        ) : null}

        {grupos.hechas.length > 0 ? (
          <View style={styles.seccion}>
            <Title size={16}>Ya se hizo</Title>
            {grupos.hechas.map((t) => filaTarea(t, true))}
          </View>
        ) : null}

        {tareas.length === 0 ? (
          <AppText muted size={14} style={styles.parrafo}>
            Todavía no hay tareas en la lista. Agregá la primera acá abajo.
          </AppText>
        ) : null}

        {esDueno ? (
          <Card style={styles.card}>
            <Input
              label="Agregar una tarea"
              placeholder={`Ej: preguntar en el taller de la esquina (máx. ${TAREA_MAX})`}
              value={nuevaTarea}
              onChangeText={setNuevaTarea}
            />
            <Button
              title="Agregar"
              icon="add"
              variant="secondary"
              loading={agregando}
              disabled={agregando || nuevaTarea.trim().length === 0}
              onPress={onAgregar}
            />
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

// Resumen de la vista previa del link. Con un solo ayudante NO se cuenta gente
// (mismo criterio que `resumenCuadrilla`): lo que se muestra es el trabajo que
// falta, que es lo que le da sentido a sumarse.
function resumenDeInvitacion(inv: Invitacion): string {
  const trabajo =
    inv.tareasPendientes === 1 ? '1 tarea sin tomar' : `${inv.tareasPendientes} tareas sin tomar`;
  return inv.ayudantes > 1 ? `${inv.ayudantes} personas buscando · ${trabajo}` : trabajo;
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    content: { padding: spacing.xl, gap: spacing.md },
    parrafo: { lineHeight: 21 },
    card: { gap: spacing.sm },
    cta: { alignSelf: 'stretch' },
    foto: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.sky },
    fotoVacia: { alignItems: 'center', justifyContent: 'center' },
    sugerida: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    sugeridaTexto: { flexShrink: 1 },
    seccion: { gap: spacing.sm, marginTop: spacing.sm },
    miembros: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    miembro: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    tarea: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      gap: spacing.sm,
    },
    tareaHecha: { opacity: 0.6 },
    tareaTexto: { gap: 2 },
    tachada: { textDecorationLine: 'line-through' },
    tareaAcciones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  });
