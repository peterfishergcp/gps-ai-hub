import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_PROJECT_ID': JSON.stringify(env.VITE_PROJECT_ID || ''),
      'import.meta.env.VITE_BIGQUERY_DATASET': JSON.stringify(env.VITE_BIGQUERY_DATASET || ''),
      'import.meta.env.VITE_GCS_BUCKET': JSON.stringify(env.VITE_GCS_BUCKET || ''),
      'import.meta.env.VITE_ALLOWED_DOMAINS': JSON.stringify(env.VITE_ALLOWED_DOMAINS || ''),
    },
    build: {
      target: 'esnext',
      minify: 'esbuild',
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
      },
    },
  };
});
