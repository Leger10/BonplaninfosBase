import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/.netlify/functions': 'http://localhost:8888',
      '/api': 'http://localhost:8888',
      '/storage': 'http://localhost:8888',
      '/media': 'http://localhost:8888',
    },
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 3000,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    // Supprimer les commentaires du build final (améliore la sécurité)
    terserOptions: {
      compress: {
        drop_console: true,   // Supprime les console.log en production
        drop_debugger: true,  // Supprime les debugger
      },
      output: {
        comments: false,      // Supprime tous les commentaires
      },
    },
    rollupOptions: {
      external: ['@babel/parser', '@babel/traverse', '@babel/generator', '@babel/types'],
      output: {
        // Générer des fichiers avec des noms uniques (hash)
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg'],
  },
});