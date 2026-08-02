import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from '../components/PlatformMap';
import ComunaPickerModal from '../components/ComunaPickerModal';
import { petSchema } from '../schemas/pet';
import { moderarTextoReporte } from '../lib/moderarTexto';
import {
  borrarFotosSubidas,
  esRechazoDefinitivo,
  estoySuspendido,
  uploadPetPhotos,
} from '../services/storage';
import { createPet, Pet } from '../services/pets';
import { useAuth } from '../hooks/useAuth';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { ErrorAmigable, mensajeDeErrorDb } from '../lib/dbErrors';
import { confirmAction, notify } from '../lib/notify';
// F1 — oferta de "Compartir tarjeta" tras publicar (agente A). Bloque
// autocontenido: el orquestador reconcilia si choca con la oferta de guía
// "encontrada" de otro agente en esta misma pantalla.
import TarjetaGenerador from '../components/TarjetaGenerador';
import { datosDeReporte } from '../lib/tarjeta';
import { pickFromLibrary, takePhoto } from '../lib/pickImage';
import { comunaDeCoords, comunasCercanas } from '../lib/comunas';
// Radio calibrado por especie y ámbito (estudio de la U. de Queensland +
// Missing Animal Response). La pregunta se hace acá porque es el único momento
// en que el dueño la puede contestar. Ver src/lib/radioSugerido.ts.
import { Ambito, preguntarAmbito } from '../lib/radioSugerido';
import { SelectorAmbito } from '../components/SelectorAmbito';
import { RECOMPENSA_SI } from '../lib/recompensa';
import { validarSenas } from '../lib/senaPrivada';
import { guardarSenasPrivadas } from '../services/senasPrivadas';
// Señas estructuradas (migración 0054): lo que hace que una coincidencia deje
// de ser "misma especie + 15 km".
import { SelectorSenas, SENAS_VACIAS, type Senas } from '../components/SelectorSenas';
import { chipPrecargable, normalizarChip, validarChip } from '../lib/senasMascota';
import { guardarChip } from '../services/petChip';
// El chip que la app YA tiene: la ficha "Mi mascota" (0027) lo guarda desde
// antes que la 0054 existiera. Se lee acá (no viaja por params) — ver el porqué
// en services/myPets.ts.
import { leerChipDeFicha } from '../services/myPets';
// Carga en lote para cuentas institucionales (migracion 0057). Un refugio con
// 15 animales no los sube de a uno con este formulario.
import { getMyProfile, Profile } from '../services/profile';
import { ofertaTrasPublicar, siguienteDelLote } from '../lib/loteInstitucional';
import { AppText, AvisoEstafa, Button, Card, Chip, Input, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

function estadoOptionsDe(colors: Colors): { key: 'perdida' | 'encontrada'; label: string; color: string }[] {
  return [
    { key: 'perdida', label: 'Perdida', color: colors.lost },
    { key: 'encontrada', label: 'Encontrada', color: colors.found },
  ];
}

const especieOptions: { key: 'perro' | 'gato' | 'otro'; label: string }[] = [
  { key: 'perro', label: 'Perro' },
  { key: 'gato', label: 'Gato' },
  { key: 'otro', label: 'Otro' },
];

const MAX_FOTOS = 4;

export default function PublishScreen({ navigation, route }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const estadoOptions = useMemo(() => estadoOptionsDe(colors), [colors]);
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const params = route?.params ?? {};
  const [estado, setEstado] = useState<'perdida' | 'encontrada'>(
    params.estado === 'perdida' || params.estado === 'encontrada' ? params.estado : 'perdida',
  );
  // Pre-carga opcional al reportar desde una ficha "Mi mascota" (Función 2).
  const especieParam =
    params.especie === 'perro' || params.especie === 'gato' || params.especie === 'otro'
      ? params.especie
      : 'perro';
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'otro'>(especieParam);
  // Ámbito del animal, para calibrar el radio de búsqueda. `null` = no contestó,
  // que es una respuesta válida (y el default): quien omite se queda con el
  // radio ancho. Solo se pregunta donde cambia algo — ver `mostrarAmbito`.
  const [ambito, setAmbito] = useState<Ambito | null>(null);
  const [raza, setRaza] = useState(typeof params.raza === 'string' ? params.raza : '');
  const [nombre, setNombre] = useState(typeof params.nombre === 'string' ? params.nombre : '');
  const [descripcion, setDescripcion] = useState(
    typeof params.descripcion === 'string' ? params.descripcion : '',
  );
  // Interruptor, ya no un campo de texto: el MONTO no se publica (ver
  // lib/recompensa.ts), así que pedirlo era invitar a escribir una cifra que
  // después no íbamos a mostrar. La columna sigue siendo texto y los reportes
  // viejos conservan lo suyo; lo nuevo guarda un centinela.
  const [ofreceRecompensa, setOfreceRecompensa] = useState(false);
  const recompensa = ofreceRecompensa ? RECOMPENSA_SI : '';
  // Seña secreta de verificación (migración 0047). NO se publica en ningún lado.
  const [sena1, setSena1] = useState('');
  const [sena2, setSena2] = useState('');
  // Señas estructuradas (0054). Estas SÍ se publican: son las que hay que gritar
  // en la calle, y las que dejan al motor descartar lo que claramente no es.
  const [senas, setSenas] = useState<Senas>(SENAS_VACIAS);
  // El número de chip (0054). NO se publica y NO viaja en el insert de `pets`:
  // vive en `pet_chips`, cerrado al dueño, y se guarda en otra llamada después
  // de crear el reporte. Ver src/services/petChip.ts.
  const [chip, setChip] = useState('');
  // ¿La persona ya escribió en la casilla del chip? Lo que tipeó MANDA sobre lo
  // que traiga la ficha: la pre-carga es asíncrona y sin esto una lectura lenta
  // le pisaría el número que acababa de escribir a mano. Va en un ref y no en
  // estado porque no dibuja nada y no tiene que provocar un re-render.
  const chipTocado = useRef(false);
  // Cómo salió la pre-carga del chip desde la ficha "Mi mascota". `null` = no
  // hubo pre-carga (lo normal: se publica sin venir de una ficha). Los otros
  // tres se le CUENTAN a la persona: una casilla vacía sin explicación es lo que
  // la hace publicar creyendo que su chip viajó. Ver el bloque de más abajo.
  const [precargaChip, setPrecargaChip] = useState<
    'precargado' | 'no_se_pudo' | 'no_sirve' | null
  >(null);
  const [fotoUris, setFotoUris] = useState<string[]>(
    typeof params.fotoUri === 'string' ? [params.fotoUri] : [],
  );
  // Vínculo con la ficha de origen, para que createPet lo guarde. Es ESTADO (no
  // una const derivada de params) a propósito: Publicar es un tab persistente, así
  // que si ya estaba montado cuando se toca "Reportar como perdida" desde una
  // ficha, los inicializadores de useState no vuelven a correr. Sin esto se
  // perdería el vínculo ficha↔reporte —el valor central de "Mi mascota"—. El
  // efecto de abajo lo re-aplica cuando llegan params de pre-carga nuevos.
  const [origenMyPet, setOrigenMyPet] = useState<string | null>(
    typeof params.origenMyPet === 'string' ? params.origenMyPet : null,
  );
  const [coords, setCoords] = useState({ lat: -33.45, lng: -70.66 });
  const [comuna, setComuna] = useState<string | null>(null);
  const [comunasAlcance, setComunasAlcance] = useState<string[]>([]);
  const [comunaManual, setComunaManual] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- CUENTA INSTITUCIONAL (0057) ---
  // Se lee una vez y no bloquea nada: si falla, `perfil` queda en null y la
  // pantalla se comporta exactamente como antes. Publicar un reporte es la
  // función central de la app; la carga en lote es un extra y no puede
  // impedirla un hipo al leer el perfil.
  const [perfil, setPerfil] = useState<Profile | null>(null);
  useEffect(() => {
    if (!user) {
      setPerfil(null);
      return;
    }
    let vivo = true;
    getMyProfile(user.id)
      .then((p) => {
        if (vivo) setPerfil(p);
      })
      .catch((e) =>
        console.warn('No se pudo leer tu perfil (carga en lote):', e?.message ?? e),
      );
    return () => {
      vivo = false;
    };
  }, [user]);
  // `institucion` es null si la cuenta no está verificada Y TAMBIÉN si la 0057
  // no está aplicada (la RPC vieja no trae esas columnas). Las dos cosas
  // significan lo mismo acá: nada cambia.
  const institucion = perfil?.institucion ?? null;

  // --- F1: "Compartir tarjeta" tras publicar (bloque autocontenido, agente A) ---
  const [tarjetaPet, setTarjetaPet] = useState<Pet | null>(null); // dispara el montaje off-screen
  const tarjetaResolver = useRef<(() => void) | null>(null);

  const ofrecerTarjeta = async (pet: Pet) => {
    const quiere = await confirmAction(
      'Compartir tarjeta',
      '¿Quieres compartir una tarjeta con la foto de tu reporte (para WhatsApp o redes)?',
    );
    if (!quiere) return;
    await new Promise<void>((resolve) => {
      tarjetaResolver.current = resolve;
      setTarjetaPet(pet);
    });
  };

  const onTarjetaFin = () => {
    setTarjetaPet(null);
    tarjetaResolver.current?.();
    tarjetaResolver.current = null;
  };
  // --- fin bloque F1 ---

  // Re-aplicar la pre-carga cuando se navega a Publicar desde una ficha "Mi
  // mascota" (Función 2) estando el tab YA montado: en ese caso los
  // inicializadores de useState no vuelven a correr y se perdería la pre-carga
  // (incluido origenMyPet). Solo actuamos si llegan params de pre-carga; una
  // entrada normal al tab (sin params, o con la misma referencia de params) no
  // dispara el efecto y no pisa lo que el usuario haya escrito.
  useEffect(() => {
    const p = route?.params;
    if (!p) return;
    const hayPrecarga =
      p.origenMyPet != null ||
      p.estado != null ||
      p.especie != null ||
      p.raza != null ||
      p.nombre != null ||
      p.descripcion != null ||
      p.fotoUri != null;
    if (!hayPrecarga) return;
    if (p.estado === 'perdida' || p.estado === 'encontrada') setEstado(p.estado);
    if (p.especie === 'perro' || p.especie === 'gato' || p.especie === 'otro') setEspecie(p.especie);
    // ACÁ EMPIEZA EL REPORTE DE OTRO ANIMAL, así que lo que la pre-carga no
    // trae se VACÍA en vez de quedarse con lo del anterior. Con un `if (typeof
    // p.raza === 'string')`, una ficha sin raza dejaba puesta la del animal que
    // se estaba cargando antes: la pestaña Publicar es persistente y estos
    // campos sobreviven a la navegación.
    setRaza(typeof p.raza === 'string' ? p.raza : '');
    setNombre(typeof p.nombre === 'string' ? p.nombre : '');
    setDescripcion(typeof p.descripcion === 'string' ? p.descripcion : '');
    setFotoUris(typeof p.fotoUri === 'string' ? [p.fotoUri] : []);
    const ficha = typeof p.origenMyPet === 'string' ? p.origenMyPet : null;
    setOrigenMyPet(ficha);

    // Y lo que es de ESE animal y la pre-carga nunca trae. Es exactamente la
    // lista que `siguienteDelLote` limpia para la carga en lote, y por los
    // mismos motivos —hay un test que cruza las dos listas para que no se
    // separen—: las señas heredadas hacen que el motor DESCARTE la coincidencia
    // buena (`senas_contradicen`), la seña secreta heredada le sirve a un
    // impostor que describe la cicatriz del perro anterior, y la casilla dice
    // "confirmo que la foto es de la mascota" sobre una foto que cambió.
    setSenas(SENAS_VACIAS);
    setSena1('');
    setSena2('');
    setAmbito(null);
    setOfreceRecompensa(false);
    setConfirmado(false);

    // --- EL CHIP QUE LA APP YA TIENE ---
    //
    // Se limpia SIEMPRE que llega una pre-carga, aunque no venga de una ficha:
    // acá empieza el reporte de OTRO animal, y un chip heredado no es un campo
    // sucio, es la certeza más alta que da el motor ("casi seguro es tu
    // mascota") apuntando al animal equivocado. Es el mismo bug mudo que
    // `siguienteDelLote` ya evita para la carga en lote.
    setChip('');
    chipTocado.current = false;
    setPrecargaChip(null);
    if (!ficha) return;

    // Y acá se repone con el de ESTA ficha. La lectura es aparte y asíncrona a
    // propósito (el número no viaja por params, ver services/myPets.ts), así que
    // puede llegar tarde o no llegar: nada de esto bloquea el formulario.
    let vivo = true;
    leerChipDeFicha(ficha)
      .then((lectura) => {
        // Si mientras tanto escribió el número a mano, no hay nada que pisarle
        // ni que contarle: el suyo es el bueno (lo está leyendo del carnet).
        if (!vivo || chipTocado.current) return;
        // `null` = no se pudo leer. NO es "no tiene chip", y la diferencia se
        // muestra: si no, la casilla vacía la hace publicar creyendo que su
        // número —el que más cuesta conseguir— viajó con el reporte.
        if (!lectura) {
          setPrecargaChip('no_se_pudo');
          return;
        }
        // Se leyó y la ficha no tiene ninguno: no hay nada que contar.
        if (lectura.chip === null) return;
        const listo = chipPrecargable(lectura.chip);
        if (listo === null) {
          // La ficha guarda algo que no es un chip ("no sé", el número a medias:
          // `my_pets.chip` nunca se validó). Copiarlo trabaría Publicar.
          setPrecargaChip('no_sirve');
          return;
        }
        setChip(listo);
        setPrecargaChip('precargado');
      })
      .catch(() => {
        if (vivo && !chipTocado.current) setPrecargaChip('no_se_pudo');
      });
    return () => {
      vivo = false;
    };
  }, [route?.params]);

  // Auto-sugerir la comuna desde el punto del mapa. Se recalcula cuando el
  // usuario mueve el pin, salvo que ya la haya fijado a mano. Al cambiar la
  // comuna "casa", se limpia el alcance (las vecinas de antes ya no aplican).
  useEffect(() => {
    if (comunaManual) return;
    const c = comunaDeCoords(coords.lat, coords.lng);
    if (c && c.nombre !== comuna) {
      setComuna(c.nombre);
      setComunasAlcance([]);
    }
  }, [coords, comunaManual, comuna]);

  const elegirComuna = (nombre: string) => {
    setComuna(nombre);
    setComunaManual(true);
    setComunasAlcance([]);
  };

  const toggleAlcance = (nombre: string) => {
    setComunasAlcance((prev) =>
      prev.includes(nombre) ? prev.filter((n) => n !== nombre) : [...prev, nombre],
    );
  };

  const addFotos = (nuevas: string[]) => {
    if (nuevas.length === 0) return;
    setFotoUris((prev) => [...prev, ...nuevas].slice(0, MAX_FOTOS));
  };

  const onTakePhoto = async () => {
    if (fotoUris.length >= MAX_FOTOS) return;
    const uri = await takePhoto();
    if (uri) addFotos([uri]);
  };

  const onPickFromLibrary = async () => {
    const restantes = MAX_FOTOS - fotoUris.length;
    if (restantes <= 0) return;
    const uris = await pickFromLibrary(restantes);
    addFotos(uris);
  };

  const removeFoto = (uri: string) => {
    setFotoUris((prev) => prev.filter((u) => u !== uri));
  };

  const useMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      notify('Sin permiso', 'Puedes mover el pin en el mapa a mano.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  };

  // Solo en gatos perdidos: es el único caso donde la respuesta cambia el radio
  // (50 m contra 315 m de mediana). Ver `preguntarAmbito`.
  const mostrarAmbito = preguntarAmbito({ especie, estado });

  // Deja el formulario listo para el SIGUIENTE animal del lote. Qué se conserva
  // y qué se limpia lo decide `siguienteDelLote` (función pura, con tests): lo
  // importante es que la foto, las señas (las secretas Y las estructuradas), el
  // número de chip y el vínculo con "Mi mascota" del animal anterior NO se
  // arrastren.
  //
  // OJO AL AGREGAR UN CAMPO: esta lista se escribe a mano dos veces (lo que se
  // le pasa a la función y lo que se aplica de vuelta), y así fue como las
  // señas y el chip de la 0054 se arrastraron al animal siguiente. Hay un test
  // que lee este archivo y exige que las dos listas estén completas
  // (`__tests__/lib/loteInstitucional.test.ts`).
  const prepararSiguienteDelLote = () => {
    const sig = siguienteDelLote({
      estado,
      especie,
      comuna,
      comunaManual,
      comunasAlcance,
      coords,
      ambito,
      raza,
      nombre,
      descripcion,
      ofreceRecompensa,
      sena1,
      sena2,
      fotoUris,
      confirmado,
      origenMyPet,
      senas,
      chip,
    });
    setEstado(sig.estado);
    setEspecie(sig.especie);
    setComuna(sig.comuna);
    setComunaManual(sig.comunaManual);
    setComunasAlcance(sig.comunasAlcance);
    setCoords(sig.coords);
    setAmbito(sig.ambito);
    setRaza(sig.raza);
    setNombre(sig.nombre);
    setDescripcion(sig.descripcion);
    setOfreceRecompensa(sig.ofreceRecompensa);
    setSena1(sig.sena1);
    setSena2(sig.sena2);
    setFotoUris(sig.fotoUris);
    setConfirmado(sig.confirmado);
    setOrigenMyPet(sig.origenMyPet);
    setSenas(sig.senas);
    setChip(sig.chip);
    // Lo que acompaña al chip vaciado: el animal #2 no hereda ni el "lo tocó a
    // mano" ni el cartel de dónde salió el número del #1.
    chipTocado.current = false;
    setPrecargaChip(null);
  };

  const onSubmit = async () => {
    // Portero (pulido): la pestaña Publicar ya bloquea la entrada a un
    // invitado (`porteroDeTab` en TabNavigator), pero esta pantalla también
    // se alcanza por los CTA de las guías (GuiaPerdidaScreen/GuiaEncontrada),
    // que esquivan ese portero de tab. Sin esto, un invitado que llegara por
    // ahí reventaba más abajo en `user!.id` con un error genérico.
    if (!requireAuth('publicar')) return;
    const parsed = petSchema.safeParse({
      estado,
      especie,
      // Se manda SOLO si la pregunta estaba en pantalla. Sin esto, contestar en
      // "gato" y después cambiar a "perro" publicaría el reporte con un dato
      // que la persona contestó sobre otro animal y que ya nadie ve.
      ambito: mostrarAmbito && ambito ? ambito : undefined,
      raza,
      nombre,
      descripcion,
      recompensa,
      comuna: comuna ?? undefined,
      comunas_alcance: comunasAlcance,
      // Lo que no se marcó no viaja: `undefined` y no null, para que
      // `createPet` ni siquiera arme la clave (ver opcionalesDe).
      colores: senas.colores.length > 0 ? senas.colores : undefined,
      tamano: senas.tamano ?? undefined,
      sexo: senas.sexo ?? undefined,
      esterilizado: senas.esterilizado ?? undefined,
      ...coords,
    });
    if (!parsed.success) {
      notify('Falta algo', parsed.error.issues[0].message);
      return;
    }
    // Filtro de contenido ANTES de subir las fotos: si el texto no pasa, no
    // gastamos una subida al bucket. Ver src/lib/moderarTexto.ts.
    const moderacion = moderarTextoReporte({ nombre, raza, descripcion, recompensa });
    if (!moderacion.ok) {
      notify('Revisá el texto', moderacion.motivo);
      return;
    }
    // La seña no pasa por el schema del reporte (no vive en `pets`), así que se
    // valida acá antes de subir nada.
    const senasOk = validarSenas(sena1, sena2);
    if (!senasOk.ok) {
      notify('Revisá la seña', senasOk.motivo);
      return;
    }
    // El chip tampoco pasa por el schema del reporte (no vive en `pets`). Se
    // valida ANTES de subir las fotos, igual que el filtro de texto: si va a
    // rebotar, no gastamos una subida al bucket.
    const chipOk = validarChip(chip);
    if (!chipOk.ok) {
      notify('Revisá el número de chip', chipOk.motivo);
      return;
    }
    if (fotoUris.length === 0) {
      notify('Falta la foto', 'Agrega al menos una foto de la mascota.');
      return;
    }
    if (!comuna) {
      notify('Falta la comuna', 'Confirmá la comuna del reporte.');
      return;
    }
    if (!confirmado) {
      notify(
        'Falta confirmar',
        'Marcá la casilla para confirmar que la foto es de la mascota y respeta las reglas.',
      );
      return;
    }
    setSaving(true);
    try {
      // [M-6] Suspensión ANTES de subir, mismo criterio que el filtro de texto
      // de arriba: si el insert va a rebotar, no gastamos una subida al bucket.
      // La defensa real es la RLS (0036: `and not estoy_suspendido()` en la
      // policy de INSERT de `pets`), que rechaza igual con o sin este chequeo;
      // esto solo evita la foto huérfana y le dice a la persona qué pasa en vez
      // del "No tenés permiso para hacer eso" genérico. Si la RPC no está
      // aplicada o falla, degrada a `false` y decide la base.
      if (await estoySuspendido()) {
        throw new ErrorAmigable(
          // Sin "escribinos": no hay dónde. `CORREO_CONTACTO` es null hasta que
          // haya dominio propio, y los Términos ahora dicen expresamente que no
          // mandamos aviso ni tenemos canal de apelación todavía. Prometer acá
          // un canal que el documento niega es peor que no ofrecer ninguno.
          'Tu cuenta está suspendida: no podés publicar reportes por ahora. Es una medida reversible: la revisa una persona y se puede levantar.',
        );
      }
      const urls = await uploadPetPhotos(fotoUris, user!.id);
      // `origenMyPet` (Función 2): si el reporte se publicó desde una ficha de
      // "Mi mascota", queda vinculado para que el QR del collar sepa que está
      // perdida. Es undefined en el flujo normal.
      //
      // [M-6] Si el insert lo RECHAZA la base por permisos (suspensión llegada
      // entre el chequeo y el insert, base sin la RPC, cualquier otra policy),
      // las fotos recién subidas ya no las referencia nadie: se borran acá.
      // Solo en ese caso — ver `esRechazoDefinitivo` en services/storage.ts.
      let nuevoPet: Pet;
      try {
        nuevoPet = await createPet(parsed.data, urls, user!.id, origenMyPet);
      } catch (e: any) {
        if (esRechazoDefinitivo(e)) await borrarFotosSubidas(urls, user!.id);
        throw e;
      }
      // La seña se guarda DESPUÉS y aparte, y su fracaso NO tumba la publicación:
      // el reporte ya existe y una mascota perdida importa más que un extra. Sin
      // la migración 0047 aplicada devuelve false y no pasa nada.
      try {
        await guardarSenasPrivadas(nuevoPet.id, user!.id, sena1, sena2);
      } catch (e: any) {
        console.warn('No se pudo guardar la seña secreta del reporte:', e?.message ?? e);
      }
      // El chip va DESPUÉS y aparte (otra tabla, otra llamada), por la misma
      // razón: el reporte ya existe y una mascota perdida importa más que un
      // extra. Sin la 0054 aplicada devuelve false y no pasa nada.
      //
      // Solo si hay algo que guardar: sin esto, publicar sin chip crearía y
      // borraría una fila en `pet_chips` por cada reporte.
      //
      // Y SI NO SE GUARDA, HAY QUE DECIRLO. Justo arriba del campo, la pantalla
      // promete: "si alguien publica una mascota encontrada con el mismo chip,
      // te avisamos enseguida. Es el dato que más sirve de todos". Un
      // `console.warn` no cumple esa promesa con nadie: la persona se va
      // creyendo que tiene el cruce por chip activo, y en Editar va a ver el
      // campo vacío, así que tampoco se entera ahí. `guardarChip` además
      // devuelve `false` (sin lanzar) cuando falta la tabla, y ese `false` no
      // lo miraba nadie: con la 0054 sin aplicar se descartaban TODOS los
      // chips que se tipearan, en silencio.
      let chipPendiente = false;
      if (normalizarChip(chip)) {
        try {
          chipPendiente = !(await guardarChip(nuevoPet.id, user!.id, chip));
        } catch (e: any) {
          console.warn('No se pudo guardar el número de chip del reporte:', e?.message ?? e);
          chipPendiente = true;
        }
      }
      // Se cuelga del "¡Publicado!" que ya existe en vez de abrir un diálogo
      // más: encadenar avisos es la forma más rápida de que no se lea ninguno.
      const avisoChip = chipPendiente
        ? ' Ojo: el número de chip no se pudo guardar. Agregalo desde Editar, es el dato que más sirve.'
        : '';
      // Qué se le ofrece a quien acaba de publicar. La guía de "qué hacer
      // ahora" está escrita para el dueño angustiado de una mascota perdida; a
      // un refugio que va por el animal 7 de 15 no le sirve. Ver
      // `ofertaTrasPublicar` (función pura, con tests).
      const oferta = ofertaTrasPublicar({ esInstitucion: !!institucion, estado });
      let destino: string;
      // [tanda6-A] La tarjeta se ofrece al terminar SOLO si el usuario no se
      // va a una guía (ya tiene bastante ahí; no encadenamos dos confirms).
      // Vale para las dos guías: perdida (func. previa) y encontrada (func. 4).
      let ofrecerAlTerminar = true;
      if (oferta.tipo === 'lote') {
        // [0057] CARGA EN LOTE. Se queda en el formulario con lo común puesto.
        const otro = await confirmAction(
          '¡Publicado!',
          '¿Cargás otro animal? Mantenemos la comuna, el punto del mapa y el estado; el resto se limpia.' +
            avisoChip,
        );
        if (otro) {
          prepararSiguienteDelLote();
          // Sin tarjeta y sin navegar: sería interrumpir quince veces seguidas.
          return;
        }
        // 'Mapa' ya no existe desde las 5 pestañas: se vuelve a Explorar, que
        // es donde vive el mapa hoy.
        destino = 'Explorar';
      } else {
        // Al publicar una PERDIDA (el momento de más angustia) ofrecemos la
        // guía de "qué hacer ahora" en vez de solo volver al mapa. En
        // "encontrada", la guía de "encontré una mascota" (func. 4).
        const quiereGuia = await confirmAction(
          '¡Publicado!',
          'Tu reporte ya aparece en el mapa. ¿Quieres una guía de qué hacer ahora?' + avisoChip,
        );
        ofrecerAlTerminar = !quiereGuia;
        // 'Mapa' ya no existe desde las 5 pestañas (bug latente preexistente,
        // arreglado en la reconciliación del merge): el que no va a la guía
        // vuelve a Explorar, que es donde vive el mapa hoy.
        destino = quiereGuia ? oferta.destino : 'Explorar';
      }
      // [tanda6-A] Oferta de "Compartir tarjeta" (agente A): único punto de
      // llamada, para no repetirla trenzada en cada rama de arriba.
      if (ofrecerAlTerminar) await ofrecerTarjeta(nuevoPet);
      navigation.navigate(destino);
    } catch (e: any) {
      notify('No se pudo publicar', mensajeDeErrorDb(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={24} style={styles.pageTitle}>
          Publicar un reporte
        </Title>
        <AppText muted size={14} style={styles.pageSubtitle}>
          Completa los datos y ayúdanos a encontrar a esta mascota.
        </AppText>

        {/* CUENTA INSTITUCIONAL (0057). Se dibuja sola para una persona y
            también mientras la 0057 no esté aplicada. No es un cartel: es
            decirle al refugio, antes de empezar, que no va a tener que repetir
            la comuna quince veces. */}
        {institucion ? (
          <Card style={styles.section}>
            <View style={styles.loteFila}>
              <Ionicons name="layers-outline" size={18} color={colors.brand} />
              <AppText size={13} style={styles.loteTexto}>
                Publicás como{' '}
                <AppText weight="bold" size={13}>
                  {institucion.nombre}
                </AppText>
                . Al terminar te ofrecemos cargar otro animal conservando la comuna y el
                punto del mapa.
              </AppText>
            </View>
          </Card>
        ) : null}

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

          {mostrarAmbito ? <SelectorAmbito valor={ambito} onChange={setAmbito} /> : null}

          <Input placeholder="Raza (opcional)" value={raza} onChangeText={setRaza} />
          <Input placeholder="Nombre (opcional)" value={nombre} onChangeText={setNombre} />
          <Input
            placeholder="Señas: color, tamaño, collar…"
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
          />

          {/* SEÑAS ESTRUCTURADAS (0054). Van justo debajo de la descripción
              porque son lo mismo que la gente ya escribía ahí, pero marcado de
              una forma que el motor de coincidencias puede leer. */}
          <SelectorSenas valor={senas} onChange={setSenas} />

          <View style={styles.recompensaRow}>
            <Chip
              label={ofreceRecompensa ? 'Ofrezco recompensa' : '¿Ofrecés recompensa?'}
              active={ofreceRecompensa}
              onPress={() => setOfreceRecompensa((v) => !v)}
            />
          </View>
          {ofreceRecompensa ? (
            <>
              <AppText muted size={12} style={styles.ayuda}>
                En el aviso solo va a decir «hay recompensa». El monto no se publica: la
                cifra atrae estafadores y hace que la gente persiga al animal, que es
                justo lo que no queremos. Lo arreglás en persona con quien la encuentre.
              </AppText>
              <AvisoEstafa variante="recompensa" />
            </>
          ) : null}

          {/* SEÑA SECRETA — el corazón de la protección contra estafas. */}
          <View style={styles.senaBloque}>
            <Title size={15}>Seña secreta (opcional)</Title>
            <AppText muted size={12} style={styles.ayuda}>
              Una o dos cosas que NO se publican: una cicatriz, una mancha en un lugar
              poco visible, algo que hace, cómo responde a un nombre. Cuando alguien te
              escriba diciendo que la tiene, pedile que te las describa. Solo las ves vos.
            </AppText>
            <Input
              placeholder="Ej: cicatriz chica en la panza"
              value={sena1}
              onChangeText={setSena1}
            />
            <Input
              placeholder="Ej: se sienta cuando le decís «cama»"
              value={sena2}
              onChangeText={setSena2}
            />
          </View>

          {/* NÚMERO DE CHIP — el dato más fuerte del motor, y el más sensible.
              Va en el bloque privado, pegado a la seña secreta, porque comparte
              exactamente su lógica: sirve para PROBAR de quién es el animal, y
              publicado deja de servir (el estafador lo lee del aviso). */}
          <View style={styles.senaBloque}>
            <Title size={15}>Número de chip (opcional)</Title>
            <AppText muted size={12} style={styles.ayuda}>
              No se publica y nadie más lo ve. Lo usamos solo para cruzarlo con los
              otros reportes: si alguien publica una mascota encontrada con el mismo
              chip, te avisamos enseguida. Es el dato que más sirve de todos.
            </AppText>
            {/* SIN `keyboardType="numeric"`. El validador acepta letras a
                propósito (los viejos AVID de 9-10 caracteres siguen dando
                vueltas, ver lib/senasMascota.ts) y un teclado numérico no
                rechaza esos chips: no tiene las teclas. La persona no ve ningún
                error —no hay error que ver— y publica sin el único dato que
                prueba de quién es el animal. `autoCapitalize` acompaña a la
                normalización, que pasa todo a mayúsculas. */}
            <Input
              placeholder="Ej: 985112003456789"
              value={chip}
              onChangeText={(t) => {
                chipTocado.current = true;
                // Los carteles de abajo hablan de la pre-carga; desde que la
                // persona escribe, el número es suyo y ya no dicen la verdad.
                setPrecargaChip(null);
                setChip(t);
              }}
              autoCapitalize="characters"
            />
            {precargaChip === 'precargado' ? (
              <AppText muted size={12} style={styles.ayuda}>
                Lo trajimos de la ficha de tu mascota. Revisá que esté bien.
              </AppText>
            ) : null}
            {precargaChip === 'no_se_pudo' ? (
              // Mismo criterio que EditPetScreen con la lectura fallida: una
              // casilla vacía sin explicación se lee como "la app ya lo tiene".
              <AppText muted size={12} style={styles.ayuda}>
                No pudimos traer el número de chip de tu ficha ahora mismo. Si lo
                tenés a mano, escribilo: es el dato que más sirve.
              </AppText>
            ) : null}
            {precargaChip === 'no_sirve' ? (
              <AppText muted size={12} style={styles.ayuda}>
                Lo que tenés guardado en tu ficha no parece un número de chip, así
                que no lo copiamos acá. Si lo tenés a mano, escribilo.
              </AppText>
            ) : null}
          </View>

          {fotoUris.length < MAX_FOTOS ? (
            <View style={styles.photoButtonsRow}>
              <Button
                title="Tomar foto"
                variant="secondary"
                icon="camera"
                onPress={onTakePhoto}
                style={styles.photoButton}
              />
              <Button
                title="Galería"
                variant="secondary"
                icon="image"
                onPress={onPickFromLibrary}
                style={styles.photoButton}
              />
            </View>
          ) : null}
          <AppText muted size={12} style={styles.photoHint}>
            {fotoUris.length}/{MAX_FOTOS} fotos
          </AppText>
          {fotoUris.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
              {fotoUris.map((uri) => (
                <View key={uri} style={styles.photoThumbWrap}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <TouchableOpacity
                    accessibilityLabel="Quitar foto"
                    activeOpacity={0.8}
                    onPress={() => removeFoto(uri)}
                    style={styles.photoRemove}
                  >
                    <Ionicons name="close" size={14} color={colors.white} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </Card>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            ¿Dónde?
          </Title>
          <AppText muted size={13} style={styles.helper}>
            Toca el mapa o arrastra el pin para ajustar el punto exacto.
          </AppText>
          <Button
            title="Usar mi ubicación"
            variant="secondary"
            icon="location"
            onPress={useMyLocation}
            style={styles.actionButton}
          />
          <MapView
            style={styles.map}
            region={{ latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
            onPress={(e) =>
              setCoords({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })
            }
          >
            <Marker
              draggable
              coordinate={{ latitude: coords.lat, longitude: coords.lng }}
              onDragEnd={(e) =>
                setCoords({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })
              }
            />
          </MapView>

          <View style={styles.comunaRow}>
            <Ionicons name="business-outline" size={18} color={colors.brand} />
            <AppText size={14} style={styles.comunaLabel}>
              Comuna: <AppText weight="bold" size={14}>{comuna ?? 'sin detectar'}</AppText>
            </AppText>
            <Button
              title="Cambiar"
              variant="ghost"
              onPress={() => setSelectorOpen(true)}
              style={styles.comunaCambiar}
            />
          </View>

          {comuna && comunasCercanas(comuna, 4).length > 0 ? (
            <>
              <AppText muted size={12} style={styles.helper}>
                Sumá comunas vecinas para que tu reporte llegue a más gente (opcional):
              </AppText>
              <View style={styles.chipsRow}>
                {comunasCercanas(comuna, 4).map((v) => (
                  <Chip
                    key={v.nombre}
                    label={v.nombre}
                    active={comunasAlcance.includes(v.nombre)}
                    onPress={() => toggleAlcance(v.nombre)}
                  />
                ))}
              </View>
            </>
          ) : null}
        </Card>

        {/* Casilla de confirmación, sin premarcar. Es el control de imagen que
            eligió el usuario en vez de moderación por IA: la persona atestigua
            que la foto es de la mascota y respeta las reglas; el resto lo cubre
            denunciar + retiro rápido. Mismo patrón que RegisterScreen. */}
        <TouchableOpacity
          style={styles.confirmRow}
          onPress={() => setConfirmado((v) => !v)}
          accessibilityRole="checkbox"
          // `aria-checked` además del state: en web, react-native-web 0.21 ya no
          // traduce `accessibilityState`. Ver RegisterScreen.
          accessibilityState={{ checked: confirmado }}
          aria-checked={confirmado}
          accessibilityLabel="Confirmo que la foto es de la mascota y respeta las reglas"
        >
          <Ionicons
            name={confirmado ? 'checkbox-outline' : 'square-outline'}
            size={22}
            color={confirmado ? colors.brand : colors.muted}
          />
          <AppText size={13} style={styles.confirmText}>
            Confirmo que la foto es de la mascota y que el reporte respeta las{' '}
            <AppText
              size={13}
              weight="bold"
              style={styles.confirmLink}
              onPress={() => navigation.navigate('Perfil', { screen: 'Legal' })}
            >
              reglas de la comunidad
            </AppText>
            .
          </AppText>
        </TouchableOpacity>

        <Button
          title="Publicar"
          icon="paw"
          onPress={onSubmit}
          disabled={saving}
          loading={saving}
          style={styles.submitButton}
        />
      </ScrollView>

      <ComunaPickerModal
        visible={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={elegirComuna}
      />

      {tarjetaPet && <TarjetaGenerador datos={datosDeReporte(tarjetaPet)} onFin={onTarjetaFin} />}
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  recompensaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  loteFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  loteTexto: {
    flex: 1,
    lineHeight: 18,
  },
  ayuda: {
    lineHeight: 17,
  },
  senaBloque: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  pageTitle: {
    marginBottom: spacing.xs,
  },
  pageSubtitle: {
    marginBottom: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
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
  actionButton: {
    alignSelf: 'stretch',
    marginTop: spacing.xs,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  photoButton: {
    flex: 1,
  },
  photoHint: {
    marginTop: spacing.xs,
  },
  photoRow: {
    marginTop: spacing.sm,
  },
  photoThumbWrap: {
    marginRight: spacing.sm,
    position: 'relative',
  },
  photoThumb: {
    width: 90,
    height: 90,
    borderRadius: radius.md,
  },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helper: {
    marginBottom: spacing.xs,
  },
  comunaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  comunaLabel: {
    flex: 1,
  },
  comunaCambiar: {
    paddingHorizontal: spacing.sm,
  },
  map: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  confirmText: {
    flex: 1,
    lineHeight: 19,
  },
  confirmLink: {
    color: colors.brandDark,
    textDecorationLine: 'underline',
  },
  submitButton: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});
