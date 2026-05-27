import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/PROJECT-UMBAU/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['urdf-loader'],
  },
})
