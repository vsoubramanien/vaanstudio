import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vaan.musicplayer',
  appName: 'VaanMusicPlayer',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
