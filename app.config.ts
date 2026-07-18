import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Encuentra tu Mascota',
  slug: 'encuentra-mascota',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'encuentramascota',
  android: {
    package: 'com.pabloespinoza.encuentramascota',
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'android.permission.CAMERA'],
    config: {
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY },
    },
  },
  ios: {
    bundleIdentifier: 'com.pabloespinoza.encuentramascota',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Usamos tu ubicación para mostrar y publicar mascotas cerca de ti.',
      NSCameraUsageDescription: 'Usamos la cámara para tomar fotos de la mascota.',
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
