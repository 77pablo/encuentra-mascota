import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { petSchema } from '../schemas/pet';
import { Pet, updatePet } from '../services/pets';
import { moderarTextoReporte } from '../lib/moderarTexto';
import { notify } from '../lib/notify';
import { RECOMPENSA_SI, tieneRecompensa } from '../lib/recompensa';
import { validarSenas } from '../lib/senaPrivada';
import { guardarSenasPrivadas, obtenerSenasPrivadas } from '../services/senasPrivadas';
import { AppText, Button, Card, Chip, Input, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

function estadoOptionsDe(colors: Colors): { key: Pet['estado']; label: string; color: string }[] {
  return [
    { key: 'perdida', label: 'Perdida', color: colors.lost },
    { key: 'encontrada', label: 'Encontrada', color: colors.found },
  ];
}

const especieOptions: { key: Pet['especie']; label: string }[] = [
  { key: 'perro', label: 'Perro' },
  { key: 'gato', label: 'Gato' },
  { key: 'otro', label: 'Otro' },
];

// Edita solo los campos de texto de un reporte (estado, especie, raza,
// nombre, descripción, recompensa). Fotos y ubicación no se editan en esta
// versión: para cambiarlas hay que cerrar el reporte y publicar uno nuevo.
export default function EditPetScreen({ route, navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const estadoOptions = useMemo(() => estadoOptionsDe(colors), [colors]);
  const pet: Pet = route.params.pet;
  const [estado, setEstado] = useState<Pet['estado']>(pet.estado);
  const [especie, setEspecie] = useState<Pet['especie']>(pet.especie);
  const [raza, setRaza] = useState(pet.raza ?? '');
  const [nombre, setNombre] = useState(pet.nombre ?? '');
  const [descripcion, setDescripcion] = useState(pet.descripcion ?? '');
  // Interruptor, no una cifra (ver lib/recompensa.ts). Un reporte VIEJO con
  // "$50.000" guardado arranca encendido: el dato no se toca ni se pierde, y solo
  // se reescribe con el centinela si la persona guarda cambios.
  const [ofreceRecompensa, setOfreceRecompensa] = useState(tieneRecompensa(pet.recompensa));
  const recompensa = ofreceRecompensa ? RECOMPENSA_SI : '';
  // Seña secreta (migración 0047). Se cargan aparte porque no viven en `pets`.
  const [sena1, setSena1] = useState('');
  const [sena2, setSena2] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let vivo = true;
    // No tira nunca: sin migración, sin fila o sin permiso devuelve null y las
    // casillas quedan vacías, listas para escribir la seña por primera vez.
    obtenerSenasPrivadas(pet.id).then((s) => {
      if (!vivo || !s) return;
      setSena1(s.sena1 ?? '');
      setSena2(s.sena2 ?? '');
    });
    return () => {
      vivo = false;
    };
  }, [pet.id]);

  const onSubmit = async () => {
    const parsed = petSchema.safeParse({
      estado,
      especie,
      raza,
      nombre,
      descripcion,
      recompensa,
      lat: pet.lat,
      lng: pet.lng,
    });
    if (!parsed.success) {
      notify('Falta algo', parsed.error.issues[0].message);
      return;
    }
    // Filtro de contenido: editar es el otro camino de escritura del reporte, así
    // que se revisa igual que al publicar (si no, sería el bypass obvio).
    const moderacion = moderarTextoReporte({ nombre, raza, descripcion, recompensa });
    if (!moderacion.ok) {
      notify('Revisá el texto', moderacion.motivo);
      return;
    }
    const senasOk = validarSenas(sena1, sena2);
    if (!senasOk.ok) {
      notify('Revisá la seña', senasOk.motivo);
      return;
    }
    setSaving(true);
    try {
      await updatePet(pet.id, { estado, especie, raza, nombre, descripcion, recompensa });
      // Acá SÍ se deja propagar el error (a diferencia de al publicar): la
      // persona apretó "Guardar cambios" y tiene que enterarse si su seña no
      // quedó. Sin la migración 0047 devuelve false, sin ruido.
      await guardarSenasPrivadas(pet.id, pet.user_id, sena1, sena2);
      notify('Guardado', 'Tu reporte se actualizó.');
      navigation.goBack();
    } catch (e: any) {
      notify('Error', mensajeDeErrorDb(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            ¿Qué pasó?
          </Title>
          <View style={styles.chipsRow}>
            {estadoOptions.map((o) => {
              const active = estado === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  activeOpacity={0.8}
                  onPress={() => setEstado(o.key)}
                  style={[
                    styles.chip,
                    active ? { backgroundColor: o.color, borderColor: o.color } : styles.chipInactive,
                  ]}
                >
                  <AppText weight="bold" size={14} color={active ? colors.white : colors.muted}>
                    {o.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            Sobre la mascota
          </Title>
          <View style={styles.chipsRow}>
            {especieOptions.map((o) => {
              const active = especie === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  activeOpacity={0.8}
                  onPress={() => setEspecie(o.key)}
                  style={[styles.chip, active ? styles.chipActiveBrand : styles.chipInactive]}
                >
                  <AppText weight="bold" size={14} color={active ? colors.white : colors.muted}>
                    {o.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          <Input placeholder="Raza (opcional)" value={raza} onChangeText={setRaza} />
          <Input placeholder="Nombre (opcional)" value={nombre} onChangeText={setNombre} />
          <Input
            placeholder="Señas: color, tamaño, collar…"
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
          />
          <View style={styles.chipsRow}>
            <Chip
              label={ofreceRecompensa ? 'Ofrezco recompensa' : '¿Ofrecés recompensa?'}
              active={ofreceRecompensa}
              onPress={() => setOfreceRecompensa((v) => !v)}
            />
          </View>
          {ofreceRecompensa ? (
            <AppText muted size={12} style={styles.ayuda}>
              En el aviso solo dice «hay recompensa». El monto no se publica: la cifra
              atrae estafadores. Lo arreglás en persona con quien la encuentre.
            </AppText>
          ) : null}
        </Card>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            Seña secreta
          </Title>
          <AppText muted size={12} style={styles.ayuda}>
            Una o dos cosas que NO se publican: una cicatriz, una mancha poco visible,
            algo que hace. Cuando alguien te escriba diciendo que la tiene, pedile que
            te las describa. Solo las ves vos.
          </AppText>
          <Input placeholder="Ej: cicatriz chica en la panza" value={sena1} onChangeText={setSena1} />
          <Input
            placeholder="Ej: se sienta cuando le decís «cama»"
            value={sena2}
            onChangeText={setSena2}
          />
        </Card>

        <Button
          title="Guardar cambios"
          icon="save"
          onPress={onSubmit}
          disabled={saving}
          loading={saving}
          style={styles.submitButton}
        />
      </ScrollView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  ayuda: {
    lineHeight: 17,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipInactive: {
    backgroundColor: colors.card,
    borderColor: colors.line,
  },
  chipActiveBrand: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  submitButton: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});
