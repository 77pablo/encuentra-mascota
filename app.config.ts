import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Encuentra tu Mascota',
  slug: 'encuentra-mascota',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'encuentramascota',
  android: {
    package: 'com.pabloespinoza.encuentramascota',
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
  },
  ios: {
    bundleIdentifier: 'com.pabloespinoza.encuentramascota',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Usamos tu ubicación para mostrar y publicar mascotas cerca de ti.',
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
  ],
};

export default config;
