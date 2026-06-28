import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (
            id.includes('/monaco-editor/') ||
            id.includes('/@monaco-editor/')
          ) {
            return 'monaco';
          }

          if (id.includes('/vis-timeline/') || id.includes('/vis-data/')) {
            return 'timeline';
          }

          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'react';
          }

          if (id.includes('/lucide-react/')) {
            return 'icons';
          }

          return 'vendor';
        },
      },
    },
  },
  publicDir: 'assets',
  plugins: [react()],
});
