import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/postal-mime/') || id.includes('/node_modules/dompurify/')) {
            return 'mime-parser'
          }
          if (id.includes('/node_modules/@firebase/database')) {
            return 'firebase-database'
          }
          if (id.includes('/node_modules/@firebase/auth')) {
            return 'firebase-auth'
          }
          if (id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) {
            return 'firebase-core'
          }
        },
      },
    },
  },
})
