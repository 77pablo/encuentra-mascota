import React, { useCallback, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { confirmAction, notify } from '../lib/notify';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { pickFromLibrary, takePhoto } from '../lib/pickImage';
import { uploadPetPhoto } from '../services/storage';
import { moderarTextoReporte } from '../lib/moderarTexto';
import { myPetSchema } from '../schemas/myPet';
import {
  CarnetInput,
  createMyPet,
  deleteMyPet,
  listMyPets,
  MyPet,
  updateMyPet,
} from '../services/myPets';
import { collarUrl } from '../lib/collarTag';
import CollarTag from '../components/CollarTag';
import { RecordatoriosBanner } from '../components/RecordatoriosBanner';
import { armarFechaISO } from '../lib/fechaCampos';
import { edadDesde } from '../lib/edadDesde';
import { estadoDosis } from '../lib/recordatorios';
import { AppText, Button, Card, EmptyState, Input, Loading, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

const especieLabel: Record<MyPet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

const especieOptions: { key: 'perro' | 'gato' | 'otro'; label: string }[] = [
  { key: 'perro', label: 'Perro' },
  { key: 'gato', label: 'Gato' },
  { key: 'otro', label: 'Otro' },
];

// Foto ya subida al bucket (URL http) vs. una recién elegida (uri local que hay
// que subir). Solo se sube lo local.
function esRemota(uri: string | null): boolean {
  return !!uri && /^https?:\/\//.test(uri);
}

// Un campo de fecha del carnet (Función 6), armado con 3 inputs sueltos
// (día/mes/año): mismo patrón que RegisterScreen para la fecha de nacimiento,
// sin depender de un DateTimePicker nativo (no hay ninguno en el repo) y
// funcionando igual en web.
function useCampoFecha(inicial: string | null) {
  const partes = inicial ? inicial.split('-') : [];
  const [anio, setAnio] = useState(partes[0] ?? '');
  const [mes, setMes] = useState(partes[1] ?? '');
  const [dia, setDia] = useState(partes[2] ?? '');

  const reset = (valor: string | null) => {
    const p = valor ? valor.split('-') : [];
    setAnio(p[0] ?? '');
    setMes(p[1] ?? '');
    setDia(p[2] ?? '');
  };

  return { dia, mes, anio, setDia, setMes, setAnio, reset };
}

type CampoFecha = ReturnType<typeof useCampoFecha>;

function FechaTresCampos({
  label,
  campo,
  styles,
}: {
  label: string;
  campo: CampoFecha;
  styles: ReturnType<typeof crearEstilos>;
}) {
  return (
    <View style={styles.fechaGrupo}>
      <AppText weight="semi" muted size={13} style={styles.label}>
        {label}
      </AppText>
      <View style={styles.fechaFila}>
        <View style={styles.fechaDia}>
          <Input placeholder="Día" keyboardType="number-pad" value={campo.dia} onChangeText={campo.setDia} />
        </View>
        <View style={styles.fechaMes}>
          <Input placeholder="Mes" keyboardType="number-pad" value={campo.mes} onChangeText={campo.setMes} />
        </View>
        <View style={styles.fechaAnio}>
          <Input placeholder="Año" keyboardType="number-pad" value={campo.anio} onChangeText={campo.setAnio} />
        </View>
      </View>
    </View>
  );
}

// Color del estado de una dosis, con los colores del tema (nunca hardcodeado):
// al día = texto normal, vence pronto = dorado (el mismo tono de "destacado"
// que ya usa la app), vencida = coral (mismo color que un reporte "perdida").
function colorDeEstado(estado: ReturnType<typeof estadoDosis>, colors: Colors): string {
  if (estado === 'vencida') return colors.lost;
  if (estado === 'vence_pronto') return colors.sun;
  return colors.muted;
}

function etiquetaEstado(estado: ReturnType<typeof estadoDosis>): string {
  if (estado === 'vencida') return 'vencida';
  if (estado === 'vence_pronto') return 'vence pronto';
  return 'al día';
}

// 'YYYY-MM-DD' → 'DD-MM-YYYY' para mostrar en la ficha (el formato de la base
// no es el que lee una persona común).
function formatoFechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}-${mes}-${anio}`;
}

export default function MyPetsScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { user } = useAuth();
  const [fichas, setFichas] = useState<MyPet[]>([]);
  const [loading, setLoading] = useState(true);

  // Form inline (alta o edición). `editId` null = alta nueva.
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'otro'>('perro');
  const [raza, setRaza] = useState('');
  const [senas, setSenas] = useState('');
  const [chip, setChip] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Carnet "Mi mascota" (Función 6): 4 fechas opcionales del formulario.
  const fechaNacimientoCampo = useCampoFecha(null);
  const vacunaCampo = useCampoFecha(null);
  const antiIntCampo = useCampoFecha(null);
  const antiExtCampo = useCampoFecha(null);

  // Ficha para la que se está generando la etiqueta de collar (monta CollarTag).
  const [collarPet, setCollarPet] = useState<MyPet | null>(null);
  const [generando, setGenerando] = useState(false);

  const cargar = useCallback(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listMyPets(user.id)
      .then(setFichas)
      .catch((e) => notify('No se pudo cargar', mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  }, [user]);

  useFocusEffect(cargar);

  const abrirNueva = () => {
    setEditId(null);
    setNombre('');
    setEspecie('perro');
    setRaza('');
    setSenas('');
    setChip('');
    setFotoUri(null);
    fechaNacimientoCampo.reset(null);
    vacunaCampo.reset(null);
    antiIntCampo.reset(null);
    antiExtCampo.reset(null);
    setFormOpen(true);
  };

  const abrirEditar = (ficha: MyPet) => {
    setEditId(ficha.id);
    setNombre(ficha.nombre);
    setEspecie(ficha.especie);
    setRaza(ficha.raza ?? '');
    setSenas(ficha.senas ?? '');
    setChip(ficha.chip ?? '');
    setFotoUri(ficha.foto ?? null);
    fechaNacimientoCampo.reset(ficha.fecha_nacimiento);
    vacunaCampo.reset(ficha.vacuna_proxima);
    antiIntCampo.reset(ficha.antiparasitario_interno_proximo);
    antiExtCampo.reset(ficha.antiparasitario_externo_proximo);
    setFormOpen(true);
  };

  const onTakePhoto = async () => {
    const uri = await takePhoto();
    if (uri) setFotoUri(uri);
  };

  const onPickFromLibrary = async () => {
    const uris = await pickFromLibrary(1);
    if (uris[0]) setFotoUri(uris[0]);
  };

  const guardar = async () => {
    const parsed = myPetSchema.safeParse({ nombre, especie, raza, senas, chip });
    if (!parsed.success) {
      notify('Falta algo', parsed.error.issues[0].message);
      return;
    }
    // Mismo filtro de contenido que un reporte: nombre, raza y señas son texto libre.
    const moderacion = moderarTextoReporte({ nombre, raza, descripcion: senas || nombre, recompensa: '' });
    if (!moderacion.ok) {
      notify('Revisá el texto', moderacion.motivo);
      return;
    }

    // Carnet (Función 6): cada fecha llega como `string` (válida), `null`
    // (vacía, se omite) o `undefined` (a medio llenar / imposible). Ante
    // cualquier `undefined` no seguimos: es mejor avisar que guardar una
    // fecha rota o incompleta.
    const fechaNacimientoISO = armarFechaISO(
      fechaNacimientoCampo.dia,
      fechaNacimientoCampo.mes,
      fechaNacimientoCampo.anio,
    );
    const vacunaISO = armarFechaISO(vacunaCampo.dia, vacunaCampo.mes, vacunaCampo.anio);
    const antiIntISO = armarFechaISO(antiIntCampo.dia, antiIntCampo.mes, antiIntCampo.anio);
    const antiExtISO = armarFechaISO(antiExtCampo.dia, antiExtCampo.mes, antiExtCampo.anio);
    if (
      fechaNacimientoISO === undefined ||
      vacunaISO === undefined ||
      antiIntISO === undefined ||
      antiExtISO === undefined
    ) {
      notify(
        'Revisá una fecha',
        'Alguna fecha del carnet quedó a medio llenar o no es una fecha real. Completá día, mes y año, o dejá los 3 vacíos.',
      );
      return;
    }
    const carnet: CarnetInput = {
      fechaNacimiento: fechaNacimientoISO,
      vacunaProxima: vacunaISO,
      antiparasitarioInternoProximo: antiIntISO,
      antiparasitarioExternoProximo: antiExtISO,
    };

    if (!user) return;
    setSaving(true);
    try {
      // Solo subimos si la foto es nueva (uri local). Una foto remota ya vive en
      // el bucket y se reusa tal cual.
      let fotoUrl: string | null = fotoUri;
      if (fotoUri && !esRemota(fotoUri)) {
        fotoUrl = await uploadPetPhoto(fotoUri, user.id);
      }

      if (editId) {
        await updateMyPet(editId, {
          nombre,
          especie,
          raza,
          senas,
          chip,
          foto: fotoUrl,
          fechaNacimiento: fechaNacimientoISO,
          vacunaProxima: vacunaISO,
          antiparasitarioInternoProximo: antiIntISO,
          antiparasitarioExternoProximo: antiExtISO,
        });
        notify('Listo', 'Actualizamos la ficha de tu mascota.');
      } else {
        await createMyPet(parsed.data, fotoUrl, user.id, carnet);
        notify('¡Guardada!', 'Ya tenés la ficha de tu mascota lista.');
      }
      setFormOpen(false);
      cargar();
    } catch (e: any) {
      notify('No se pudo guardar', mensajeDeErrorDb(e));
    } finally {
      setSaving(false);
    }
  };

  const borrar = async (ficha: MyPet) => {
    const ok = await confirmAction(
      `¿Borrar la ficha de ${ficha.nombre}?`,
      'Se borrará la ficha y su etiqueta de collar dejará de funcionar. Esta acción no se puede deshacer.',
    );
    if (!ok || !user) return;
    try {
      await deleteMyPet(ficha.id, user.id);
      notify('Borrada', 'La ficha se eliminó.');
      cargar();
    } catch (e: any) {
      notify('No se pudo borrar', mensajeDeErrorDb(e));
    }
  };

  // Reportar como perdida EN UN TOQUE: lleva a Publicar con todo pre-cargado y el
  // vínculo con la ficha (origenMyPet) para que la RPC del collar sepa que está
  // perdida.
  const reportarPerdida = (ficha: MyPet) => {
    navigation.navigate('Publicar', {
      estado: 'perdida',
      especie: ficha.especie,
      raza: ficha.raza ?? '',
      nombre: ficha.nombre,
      descripcion: ficha.senas ?? '',
      origenMyPet: ficha.id,
      fotoUri: ficha.foto ?? undefined,
    });
  };

  const generarCollar = (ficha: MyPet) => {
    // Sin base web configurada el QR no llevaría a ningún lado: avisamos en vez
    // de generar una placa muerta.
    if (!collarUrl(ficha.collar_token)) {
      notify(
        'Falta configurar la web',
        'La etiqueta necesita la dirección pública de la app. Intentá desde la versión web.',
      );
      return;
    }
    setGenerando(true);
    setCollarPet(ficha);
  };

  if (loading) return <Loading />;

  if (formOpen) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Title size={22} style={styles.pageTitle}>
            {editId ? 'Editar ficha' : 'Nueva mascota'}
          </Title>

          <Card style={styles.section}>
            {fotoUri ? (
              <View style={styles.fotoWrap}>
                <Image source={{ uri: fotoUri }} style={styles.foto} />
                <TouchableOpacity
                  accessibilityLabel="Quitar foto"
                  activeOpacity={0.8}
                  onPress={() => setFotoUri(null)}
                  style={styles.fotoRemove}
                >
                  <Ionicons name="close" size={16} color={colors.white} />
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.photoButtonsRow}>
              <Button title="Tomar foto" variant="secondary" icon="camera" onPress={onTakePhoto} style={styles.photoButton} />
              <Button title="Galería" variant="secondary" icon="image" onPress={onPickFromLibrary} style={styles.photoButton} />
            </View>

            <Input label="Nombre" placeholder="Pelusa" value={nombre} onChangeText={setNombre} />

            <AppText weight="semi" muted size={13} style={styles.label}>
              Especie
            </AppText>
            <View style={styles.chipsRow}>
              {especieOptions.map((o) => {
                const active = especie === o.key;
                return (
                  <TouchableOpacity
                    key={o.key}
                    activeOpacity={0.8}
                    onPress={() => setEspecie(o.key)}
                    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                  >
                    <AppText weight="bold" size={14} color={active ? colors.white : colors.muted}>
                      {o.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Input label="Raza (opcional)" placeholder="Quiltro" value={raza} onChangeText={setRaza} />
            <Input
              label="Señas particulares (opcional)"
              placeholder="Color, tamaño, cicatrices, collar…"
              value={senas}
              onChangeText={setSenas}
              multiline
            />
            <Input
              label="N° de microchip (opcional)"
              placeholder="981..."
              value={chip}
              onChangeText={setChip}
            />
          </Card>

          {/* Carnet "Mi mascota" (Función 6): todo opcional. Si se completa,
              calculamos la edad y avisamos acá mismo cuando se acerque una
              dosis (nunca por push ni correo). */}
          <Card style={styles.section}>
            <Title size={16} style={styles.sectionTitle}>
              Carnet (opcional)
            </Title>
            <AppText muted size={12} style={styles.carnetHelp}>
              Guardá estas fechas y te avisamos acá mismo cuando se acerquen.
            </AppText>
            <FechaTresCampos label="Fecha de nacimiento" campo={fechaNacimientoCampo} styles={styles} />
            <FechaTresCampos label="Próxima vacuna" campo={vacunaCampo} styles={styles} />
            <FechaTresCampos
              label="Próximo antiparasitario interno"
              campo={antiIntCampo}
              styles={styles}
            />
            <FechaTresCampos
              label="Próximo antiparasitario externo"
              campo={antiExtCampo}
              styles={styles}
            />
          </Card>

          <Button
            title={editId ? 'Guardar cambios' : 'Guardar mascota'}
            icon="paw"
            onPress={guardar}
            loading={saving}
            disabled={saving}
            style={styles.saveButton}
          />
          <Button title="Cancelar" variant="ghost" onPress={() => setFormOpen(false)} disabled={saving} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={24} style={styles.pageTitle}>
          Mis mascotas
        </Title>
        <AppText muted size={14} style={styles.pageSubtitle}>
          Registrá a tu mascota una vez. Si algún día se pierde, la publicás en un toque, y con
          su etiqueta de collar cualquiera que la encuentre puede avisarte.
        </AppText>

        {user && fichas.length > 0 ? (
          <View style={styles.bannerWrap}>
            <RecordatoriosBanner fichas={fichas} />
          </View>
        ) : null}

        {fichas.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              illustration
              title="Todavía no registraste ninguna"
              subtitle="Agregá a tu mascota para tener su ficha y su placa de collar listas."
            />
          </View>
        ) : (
          <View style={styles.list}>
            {fichas.map((ficha) => {
              const edad = ficha.fecha_nacimiento
                ? edadDesde(ficha.fecha_nacimiento, new Date())
                : null;
              const dosis: { etiqueta: string; fecha: string | null }[] = [
                { etiqueta: 'Vacuna', fecha: ficha.vacuna_proxima },
                { etiqueta: 'Antiparasitario interno', fecha: ficha.antiparasitario_interno_proximo },
                { etiqueta: 'Antiparasitario externo', fecha: ficha.antiparasitario_externo_proximo },
              ];
              const dosisConFecha = dosis.filter(
                (d): d is { etiqueta: string; fecha: string } => !!d.fecha,
              );

              return (
                <Card key={ficha.id} style={styles.fichaCard}>
                  <View style={styles.fichaHeader}>
                    {ficha.foto ? (
                      <Image source={{ uri: ficha.foto }} style={styles.fichaFoto} />
                    ) : (
                      <View style={[styles.fichaFoto, styles.fichaFotoPlaceholder]}>
                        <AppText size={28}>🐾</AppText>
                      </View>
                    )}
                    <View style={styles.fichaInfo}>
                      <Title size={18}>{ficha.nombre}</Title>
                      <AppText muted size={13}>
                        {especieLabel[ficha.especie]}
                        {ficha.raza ? ` · ${ficha.raza}` : ''}
                      </AppText>
                      {edad ? (
                        <AppText muted size={12} style={styles.edadLine}>
                          🎂 {edad}
                        </AppText>
                      ) : null}
                    </View>
                    <View style={styles.fichaActions}>
                      <TouchableOpacity accessibilityLabel="Editar" onPress={() => abrirEditar(ficha)} style={styles.iconBtn}>
                        <Ionicons name="create-outline" size={20} color={colors.brand} />
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityLabel="Borrar" onPress={() => borrar(ficha)} style={styles.iconBtn}>
                        <Ionicons name="trash-outline" size={20} color={colors.lost} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {dosisConFecha.length > 0 ? (
                    <View style={styles.carnetWrap}>
                      {dosisConFecha.map((d) => {
                        const estado = estadoDosis(d.fecha, new Date());
                        return (
                          <View key={d.etiqueta} style={styles.carnetRow}>
                            <AppText size={12} muted>
                              {d.etiqueta}
                            </AppText>
                            <AppText size={12} weight="semi" color={colorDeEstado(estado, colors)}>
                              {formatoFechaCorta(d.fecha)} · {etiquetaEstado(estado)}
                            </AppText>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  <Button
                    title="Reportar como perdida"
                    icon="alert-circle"
                    variant="danger"
                    onPress={() => reportarPerdida(ficha)}
                    style={styles.fichaButton}
                  />
                  <Button
                    title="Etiqueta de collar"
                    icon="qr-code"
                    variant="secondary"
                    onPress={() => generarCollar(ficha)}
                    disabled={generando}
                    loading={generando && collarPet?.id === ficha.id}
                    style={styles.fichaButton}
                  />
                </Card>
              );
            })}
          </View>
        )}

        <Button
          title="Agregar mascota"
          icon="add"
          onPress={abrirNueva}
          style={styles.addButton}
        />

        {/* EL EMPUJÓN A INSCRIBIR EL CHIP. Va acá y no en el flujo de publicar
            porque este es el lugar tranquilo: quien perdió a su mascota hoy no
            está para trámites, pero quien está armando su ficha sí.
            No mira ninguna columna de chip en la base a propósito (esa la está
            agregando otra rama): el texto sirve igual tenga o no tenga chip. */}
        <Card style={styles.chipCard}>
          <View style={styles.chipHeader}>
            <Ionicons name="hardware-chip" size={18} color={colors.brand} />
            <AppText weight="bold" size={14} style={styles.chipTitulo}>
              ¿Tiene el chip inscrito?
            </AppText>
          </View>
          <AppText muted size={13} style={styles.chipTexto}>
            Con chip inscrito vuelven a casa más del doble de los perros perdidos, y
            casi veinte veces más los gatos. En Chile inscribirlo es gratis y
            obligatorio por la Ley 21.020, y se hace en tu municipalidad o en una
            veterinaria registradora.
          </AppText>
          <Button
            title="Cómo funciona el chip"
            variant="secondary"
            onPress={() => navigation.navigate('Microchip')}
            style={styles.chipBoton}
          />
        </Card>
      </ScrollView>

      {collarPet ? (
        <CollarTag
          pet={collarPet}
          onDone={() => {
            setCollarPet(null);
            setGenerando(false);
          }}
          onError={(m) => {
            setCollarPet(null);
            setGenerando(false);
            notify('No se pudo generar', m);
          }}
        />
      ) : null}
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  pageTitle: { marginBottom: spacing.xs },
  pageSubtitle: { marginBottom: spacing.sm },
  section: { gap: spacing.sm },
  label: { marginBottom: spacing.xs },
  emptyWrap: { paddingVertical: spacing.xxxl },
  list: { gap: spacing.md },
  fichaCard: { gap: spacing.sm },
  fichaHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fichaFoto: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.sky },
  fichaFotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  fichaInfo: { flex: 1 },
  fichaActions: { flexDirection: 'row', gap: spacing.xs },
  iconBtn: { padding: spacing.xs },
  fichaButton: { alignSelf: 'stretch', marginTop: spacing.xs },
  addButton: { alignSelf: 'stretch', marginTop: spacing.md },
  chipCard: { marginTop: spacing.xl, gap: spacing.sm },
  chipHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chipTitulo: { flex: 1 },
  chipTexto: { lineHeight: 19 },
  chipBoton: { alignSelf: 'flex-start', paddingHorizontal: spacing.lg },
  saveButton: { alignSelf: 'stretch', marginTop: spacing.sm },
  fotoWrap: { alignSelf: 'center', position: 'relative', marginBottom: spacing.sm },
  foto: { width: 140, height: 140, borderRadius: radius.md, backgroundColor: colors.sky },
  fotoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtonsRow: { flexDirection: 'row', gap: spacing.sm },
  photoButton: { flex: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1 },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipInactive: { backgroundColor: colors.card, borderColor: colors.line },
  sectionTitle: { marginBottom: spacing.xs },
  carnetHelp: { marginTop: -spacing.xs, marginBottom: spacing.sm, lineHeight: 17 },
  fechaGrupo: { marginBottom: spacing.sm },
  fechaFila: { flexDirection: 'row', gap: spacing.sm },
  fechaDia: { flex: 1 },
  fechaMes: { flex: 1 },
  fechaAnio: { flex: 1.4 },
  bannerWrap: { marginBottom: spacing.xs },
  edadLine: { marginTop: 2 },
  carnetWrap: { gap: 4, marginTop: spacing.xs },
  carnetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
