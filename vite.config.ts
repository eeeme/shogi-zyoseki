import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// アプリ版（npm run build:app）は相対パス、Pages 版はリポジトリ名の下
export default defineConfig(({ mode }) => ({
  base: mode === 'app' ? './' : '/shogi-zyoseki/',
  plugins: [react()],
}))
