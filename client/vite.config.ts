import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SITE_ROOT = '/miston/';

export default defineConfig(({ mode }) => ({
  // GitHub Pages віддає застосунок із підпадки /miston/, тому базовий шлях
  // потрібен і для asset-ів, і для публічних файлів із client/public.
  base: process.env.VITE_BASE_PATH || (mode === 'production' ? SITE_ROOT : '/'),
  plugins: [react()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 700,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          realtime: ['socket.io-client'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: { port: 4173 },
}));
