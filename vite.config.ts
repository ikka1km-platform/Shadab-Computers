import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    target: ['chrome65', 'es2018'],
  },
  server: {
    watch: {
      ignored: ['**/android/**', '**/dist/**', '**/*.apk'],
    },
  },
})

