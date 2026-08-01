import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ambito, PASOS_PLAN, Temperamento } from './planBusqueda';

// Estado LOCAL del plan de búsqueda de UN reporte: qué pasos ya marcó el dueño
// y qué nos contó del carácter (perro) o del ámbito (gato) de su mascota.
//
// Vive SOLO en este dispositivo —localStorage en web, SecureStore en móvil,
// mismo enfoque never-throws que src/lib/onboarding.ts y temaPref.ts— y por eso
// NO necesita migración ni columna nueva. Es una ayuda para quien busca, no un
// dato que le sirva a nadie más. Si el almacenamiento falla, el plan se ve
// igual con todo desmarcado: nunca rompe la pantalla.

export interface EstadoPlan {
  hechos: string[];
  temperamento?: Temperamento;
  ambito?: Ambito;
}

/** Una clave por reporte: alguien puede tener dos búsquedas abiertas a la vez. */
export const CLAVE_PLAN = (reporteId: string) => `plan_busqueda_${reporteId}`;

const IDS_VALIDOS = new Set(PASOS_PLAN.map((p) => p.id));

const esTemperamento = (v: unknown): v is Temperamento =>
  v === 'asustadizo' || v === 'sociable' || v === 'desconocido';
const esAmbito = (v: unknown): v is Ambito =>
  v === 'interior' || v === 'exterior' || v === 'desconocido';

const VACIO: EstadoPlan = { hechos: [] };

async function leerCrudo(clave: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(clave) : null;
  }
  return SecureStore.getItemAsync(clave);
}

export async function getEstadoPlan(reporteId: string): Promise<EstadoPlan> {
  try {
    const raw = await leerCrudo(CLAVE_PLAN(reporteId));
    if (!raw) return { ...VACIO };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...VACIO };
    // Defensa ante datos corruptos o tocados a mano: sólo ids que existen en el
    // catálogo, y sólo valores que el plan sabe interpretar.
    const hechos = Array.isArray(parsed.hechos)
      ? parsed.hechos.filter((x: unknown): x is string => typeof x === 'string' && IDS_VALIDOS.has(x))
      : [];
    const estado: EstadoPlan = { hechos };
    if (esTemperamento(parsed.temperamento)) estado.temperamento = parsed.temperamento;
    if (esAmbito(parsed.ambito)) estado.ambito = parsed.ambito;
    return estado;
  } catch {
    return { ...VACIO };
  }
}

async function guardar(reporteId: string, estado: EstadoPlan): Promise<EstadoPlan> {
  try {
    const clave = CLAVE_PLAN(reporteId);
    const raw = JSON.stringify(estado);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(clave, raw);
    } else {
      await SecureStore.setItemAsync(clave, raw);
    }
  } catch {
    // Sin almacenamiento no pasa nada grave: sólo no recordamos el progreso.
  }
  return estado;
}

/** Marca (o desmarca) un paso. Devuelve el estado ya actualizado. */
export async function setPasoHecho(
  reporteId: string,
  pasoId: string,
  hecho: boolean,
): Promise<EstadoPlan> {
  const actual = await getEstadoPlan(reporteId);
  const set = new Set(actual.hechos);
  if (hecho) set.add(pasoId);
  else set.delete(pasoId);
  return guardar(reporteId, { ...actual, hechos: [...set] });
}

/** Guarda lo que el dueño nos contó, sin tocar el progreso ya marcado. */
export async function setPerfilPlan(
  reporteId: string,
  perfil: { temperamento?: Temperamento; ambito?: Ambito },
): Promise<EstadoPlan> {
  const actual = await getEstadoPlan(reporteId);
  return guardar(reporteId, { ...actual, ...perfil });
}
