/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { isIP } from 'node:net';

// Remote previews must opt in to specific DNS names. Never use `true` or a
// suffix wildcard here: Vite's host check protects against DNS rebinding.
const allowedHosts = (process.env.FRETHUB_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
const hostname = /^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*$/i;
if (allowedHosts.some((host) => !hostname.test(host) || isIP(host) !== 0 || host === 'true')) {
  throw new Error('FRETHUB_ALLOWED_HOSTS must contain exact DNS hostnames without IPs, ports, URLs or wildcards.');
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    allowedHosts,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    allowedHosts,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
    },
  },
});
