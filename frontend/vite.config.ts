import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
 plugins: [react()],
 base: '/flowapp/',
 build: {
  outDir: 'dist',
  sourcemap: false,
  rollupOptions: {
   output: {
    manualChunks: {
     vendor: ['react', 'react-dom', 'react-router-dom'],
     msal:  ['@azure/msal-browser', '@azure/msal-react'],
    },
   },
  },
 },
 server: {
  port: 5173,
  proxy: {
   '/api': { target: 'http://localhost:8787', changeOrigin: true },
   '/approve': { target: 'http://localhost:8787', changeOrigin: true },
   '/reject': { target: 'http://localhost:8787', changeOrigin: true },
  },
 },
});
