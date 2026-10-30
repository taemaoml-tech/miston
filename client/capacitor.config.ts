import type { CapacitorConfig } from '@capacitor/cli';

const SITE_URL = 'https://taemaoml-tech.github.io/miston/';

const config: CapacitorConfig = {
  appId: 'com.miston.app',
  appName: 'Miston',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Завантажувати сайт з його власного origin, а не локальний бандл із
    // https://localhost: сервер пускає в CORS лише taemaoml-tech.github.io,
    // тож локальна копія в WebView билась би об 403 без зміни на проді.
    url: SITE_URL,
    allowNavigation: ['taemaoml-tech.github.io'],
  },
};

export default config;
