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
};

export default config;
