import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { HeaderBackButton } from '@react-navigation/elements';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { adoptionSchema } from '../schemas/adoption';
import { Adoption, updateAdoption } from '../services/adoptions';
import { notify } from '../lib/notify';
import { AppText, Button, Card, Chip, Input, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// Edita solo los campos de TEXTO/selectores de una publicación de adopción
// (nombre, descripción, edad, tamaño, salud, convivencia, requisitos). Fotos
// y ubicación/comuna no se editan en esta versión — mismo recorte que
// EditPetScreen ("para cambiarlas hay que publicar de nuevo"), aunque el
// servicio `updateAdoption` sí admite tocarlas (defensa en profundidad, no
// atadura a esta pantalla). La especie tampoco se edita acá: no forma parte
// de los campos editables del pulido (ver docs del 22-jul, sección "Pulido").

const edadOptions: { key: NonNullable<Adoption['edad']>; label: string }[] = [
  { key: 'cachorro', label: 'Cachorro' },
  { key: 'adulto', label: 'Adulto' },
  { key: 'senior', label: 'Senior' },
];

const tamanoOptions: { key: NonNullable<Adoption['tamano']>; label: string }[] = [
  { key: 'chico', label: 'Chico' },
  { key: 'mediano', label: 'Mediano' },
  { key: 'grande', label: 'Grande' },
];

const triOptions: { key: 'si' | 'no' | 'no_se'; label: string }[] = [
  { key: 'si', label: 'Sí' },
  { key: 'no', label: 'No' },
  { key: 'no_se', label: 'No sé' },
];

const vacunasOptions: { key: NonNullable<Adoption['vacunas']>; label: string }[] = [
  { key: 'al_dia', label: 'Al día' },
  { key: 'no', label: 'No' },
  { key: 'no_se', label: 'No sé' },
];

// Fila de chips para un campo opcional: tocar la opción activa la
// deselecciona (vuelve a "sin especificar"). Mismo patrón que
// PublicarAdopcionScreen.
function OptionRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <View style={styles.fieldBlock}>
      <AppText weight="semi" muted size={13} style={styles.fieldLabel}>
        {label}
      </AppText>
      <View style={styles.chipsRow}>
        {options.map((o) => (
          <Chip
            key={o.key}
            label={o.label}
            active={value === o.key}
            onPress={() => onChange(value === o.key ? null : o.key)}
          />
        ))}
      </View>
    </View>
  );
}

export default function EditAdoptionScreen({ route, navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const adoption: Adoption = route.params.adoption;

  const [nombre, setNombre] = useState(adoption.nombre ?? '');
  const [descripcion, setDescripcion] = useState(adoption.descripcion ?? '');
  const [edad, setEdad] = useState<NonNullable<Adoption['edad']> | null>(adoption.edad ?? null);
  const [tamano, setTamano] = useState<NonNullable<Adoption['tamano']> | null>(adoption.tamano ?? null);
  const [esterilizado, setEsterilizado] = useState<'si' | 'no' | 'no_se' | null>(
    adoption.esterilizado ?? null,
  );
  const [vacunas, setVacunas] = useState<NonNullable<Adoption['vacunas']> | null>(adoption.vacunas ?? null);
  const [conviveNinos, setConviveNinos] = useState<'si' | 'no' | 'no_se' | null>(
    adoption.convive_ninos ?? null,
  );
  const [convivePerros, setConvivePerros] = useState<'si' | 'no' | 'no_se' | null>(
    adoption.convive_perros ?? null,
  );
  const [conviveGatos, setConviveGatos] = useState<'si' | 'no' | 'no_se' | null>(
    adoption.convive_gatos ?? null,
  );
  const [requisitos, setRequisitos] = useState(adoption.requisitos ?? '');
  const [saving, setSaving] = useState(false);

  // Volver al detalle (no al feed) — ni al guardar ni al cancelar.
  // EditAdoption se llega con navegación anidada absoluta desde
  // AdopcionDetail (que vive en el stack RAÍZ, ver AdopcionDetailScreen); esa
  // navegación deja a EditAdoption apilada arriba del feed DENTRO del stack
  // de la pestaña Adopción. Un `goBack()` a secas caería en el feed, y encima
  // dejaría a EditAdoption como pantalla zombi si se reingresara a la pestaña
  // por otro lado. Por eso: primero se saca del stack de la pestaña
  // (`goBack()`, "dentro" de este stack), y recién después se navega
  // explícito de vuelta al detalle (push nuevo en el stack raíz, mismo
  // patrón que `contactar`/`editar` en AdopcionDetailScreen).
  const volverAlDetalle = useCallback(() => {
    navigation.goBack();
    navigation.navigate('AdopcionDetail', { id: adoption.id });
  }, [navigation, adoption.id]);

  // El back nativo del header (chevron) y el gesto de swipe de iOS harían un
  // `goBack()` por defecto -> feed. Se reemplaza el botón del header por uno
  // que usa `volverAlDetalle`, y se apaga el gesto para no dejar un camino
  // sin cubrir (solo queda el botón del header y el back físico de Android,
  // ambos cableados acá).
  useLayoutEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      headerLeft: (props: any) => <HeaderBackButton {...props} onPress={volverAlDetalle} />,
    });
  }, [navigation, volverAlDetalle]);

  // Back físico de Android: mismo trato que el header, para que "cancelar"
  // sea consistente sin importar cómo se salga de la pantalla.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        volverAlDetalle();
        return true;
      });
      return () => sub.remove();
    }, [volverAlDetalle]),
  );

  const onSubmit = async () => {
    const parsed = adoptionSchema.safeParse({
      especie: adoption.especie,
      nombre,
      descripcion,
      edad: edad ?? undefined,
      tamano: tamano ?? undefined,
      esterilizado: esterilizado ?? undefined,
      vacunas: vacunas ?? undefined,
      convive_ninos: conviveNinos ?? undefined,
      convive_perros: convivePerros ?? undefined,
      convive_gatos: conviveGatos ?? undefined,
      requisitos,
    });
    if (!parsed.success) {
      notify('Falta algo', parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      // `updateAdoption` ya pasa nombre/descripción/requisitos por moderación
      // ANTES de escribir — no hace falta repetirlo acá.
      await updateAdoption(adoption.id, {
        nombre: parsed.data.nombre || null,
        descripcion: parsed.data.descripcion,
        edad: edad,
        tamano: tamano,
        esterilizado: esterilizado,
        vacunas: vacunas,
        convive_ninos: conviveNinos,
        convive_perros: convivePerros,
        convive_gatos: conviveGatos,
        requisitos: parsed.data.requisitos || null,
      });
      notify('Guardado', 'Tu publicación se actualizó.');
      // `AdopcionDetailScreen` refresca al recuperar el foco.
      volverAlDetalle();
    } catch (e: any) {
      notify('No se pudo guardar', mensajeDeErrorDb(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            Sobre la mascota
          </Title>
          <Input placeholder="Nombre (opcional)" value={nombre} onChangeText={setNombre} />
          <Input
            placeholder="Describe a la mascota: personalidad, historia, señas…"
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
          />
        </Card>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            Más datos (opcional)
          </Title>
          <OptionRow label="Edad" options={edadOptions} value={edad} onChange={setEdad} />
          <OptionRow label="Tamaño" options={tamanoOptions} value={tamano} onChange={setTamano} />
          <OptionRow
            label="Esterilizado"
            options={triOptions}
            value={esterilizado}
            onChange={setEsterilizado}
          />
          <OptionRow label="Vacunas" options={vacunasOptions} value={vacunas} onChange={setVacunas} />
          <OptionRow
            label="Convive bien con niños"
            options={triOptions}
            value={conviveNinos}
            onChange={setConviveNinos}
          />
          <OptionRow
            label="Convive bien con perros"
            options={triOptions}
            value={convivePerros}
            onChange={setConvivePerros}
          />
          <OptionRow
            label="Convive bien con gatos"
            options={triOptions}
            value={conviveGatos}
            onChange={setConviveGatos}
          />
          <Input
            placeholder="Requisitos para adoptarla (opcional)"
            value={requisitos}
            onChangeText={setRequisitos}
            multiline
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
  fieldBlock: {
    marginBottom: spacing.xs,
  },
  fieldLabel: {
    marginBottom: spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  submitButton: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});
