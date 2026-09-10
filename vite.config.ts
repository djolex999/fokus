import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri expects a fixed port and no terminal clearing.
// Two HTML entries: one per window.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'safari15',
    rollupOptions: {
      input: {
        main: 'index.html',
        widget: 'widget.html',
      },
    },
  },
})
