import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const apiProxyTarget = env.VITE_API_PROXY_URL
  if (!apiProxyTarget) {
    throw new Error('VITE_API_PROXY_URL must be set in your environment. Refusing to fall back to localhost:5000.');
  }

  return {
  plugins: [react(), tailwindcss(), basicSsl()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('react-router-dom')) return 'vendor-router';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('react-icons')) return 'vendor-icons';
          if (id.includes('react-hot-toast')) return 'vendor-toast';
          if (id.includes('axios')) return 'vendor-axios';
          if (id.includes('/react/') || id.includes('react-dom')) return 'vendor-react';

          return 'vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': apiProxyTarget,
    },
  },
  }
})
