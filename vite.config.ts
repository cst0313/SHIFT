/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { handleShiftApiRequest } from './server/index';

function shiftAgentApiPlugin(): Plugin {
  return {
    name: 'shift-agent-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/agent/')) {
          const handled = await handleShiftApiRequest(req, res);
          if (handled) return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/agent/')) {
          const handled = await handleShiftApiRequest(req, res);
          if (handled) return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), shiftAgentApiPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // three.js + drei + postprocessing make up most of the bundle; one chunk is fine for a 3D app
  build: { chunkSizeWarningLimit: 2200 },
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 20000,
  },
});
