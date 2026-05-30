import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.acousticdsp.musicplayer',
  appName: 'Acoustic DSP Studio',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
