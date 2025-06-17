import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/TCG-Deck-Builder/',
  plugins: [react()],
  build: {
    outDir: "dist"
  }
})