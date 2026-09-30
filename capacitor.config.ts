import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.meisme.jousekichou',
  appName: '定跡帳',
  webDir: 'dist',
  backgroundColor: '#101114',
  android: {
    backgroundColor: '#101114',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
  },
}

export default config
