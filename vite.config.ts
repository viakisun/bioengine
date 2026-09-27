import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { camStreamPlugin } from './tooling/vite/plugins/camStream';

export default defineConfig({
  plugins: [react(), camStreamPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@farmsim/tomato-engine': resolve(__dirname, 'packages/tomato-engine/src'),
      '@farmsim/tomato-geometry': resolve(__dirname, 'packages/tomato-geometry/src'),
    },
  },
  server: {
    port: 8090,
    strictPort: true,  // fail loudly if 8090 is taken instead of silently bumping to 8091+
    open: false,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
});
