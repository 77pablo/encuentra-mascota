import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Encuentra tu Mascota',
  slug: 'encuentra-mascota',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'encuentramascota',
  android: {
    package: 'com.pabloespinoza.encuentramascota',
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'android.permission.CAMERA',
      // Android 13+ (API 33): sin este permiso el sistema NO entrega ningún push,
      // aunque la Edge Function los mande. Necesario para los avisos de la app.
      'android.permission.POST_NOTIFICATIONS',
    ],
    // Ubicación EN SEGUNDO PLANO: la app no la usa ni la quiere. Se bloquea de
    // forma explícita para que ninguna dependencia la cuele en el manifest: si
    // aparece, Google exige un formulario + video + una revisión de semanas.
    blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
    config: {
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY },
    },
  },
  ios: {
    bundleIdentifier: 'com.pabloespinoza.encuentramascota',
    // Purpose strings con la fórmula que Apple acepta: qué se accede + para qué
    // función + beneficio. Los genéricos cortos ("usamos la cámara") los rechaza.
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Usamos tu ubicación aproximada para mostrarte mascotas perdidas cerca tuyo y para ubicar tu reporte en el mapa, así los vecinos del sector pueden ayudar. No guardamos tu ubicación exacta.',
      NSCameraUsageDescription:
        'Usamos la cámara para que tomes una foto de la mascota y sumarla a tu reporte, para que otros puedan reconocerla.',
      NSPhotoLibraryUsageDescription:
        'Accedemos a tu galería para que elijas una foto de la mascota y adjuntarla a tu reporte, para que otros puedan reconocerla.',
    },
  },
  plugins: [
    [
      'expo-build-properties',
      {
        android: {
          // Ofuscación + reducción de código en el APK de release
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
    'expo-secure-store',
    'expo-notifications',
    'expo-font',
    'expo-splash-screen',
  ],
  // `projectId` de EAS: lo consume `src/services/pushTokens.ts` para pedir el
  // Expo push token. Se llena solo al correr `eas init` (que escribe aquí el id)
  // o pegando el id en la variable EAS_PROJECT_ID del .env. Sin él, el push real
  // no se registra (la app sigue funcionando; el registro es silencioso).
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
