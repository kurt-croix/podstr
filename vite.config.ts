import path from "node:path";
import { existsSync, readdirSync } from 'fs';

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Check if transcripts directory exists and has files
const transcriptsDir = 'transcripts';
const hasTranscripts = existsSync(transcriptsDir) && readdirSync(transcriptsDir).length > 0;

// Build plugins array conditionally
const plugins = [react()];

// Only add viteStaticCopy if there are transcripts to copy
if (hasTranscripts) {
  plugins.push(
    viteStaticCopy({
      targets: [
        {
          src: 'transcripts',
          dest: '.'
        }
      ]
    })
  );
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  base: '/podstr/',
  server: {
    host: "::",
    port: 8080,
  },
  plugins,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    onConsoleLog(log) {
      return !log.includes("React Router Future Flag Warning");
    },
    env: {
      DEBUG_PRINT_LIMIT: '0', // Suppress DOM output that exceeds AI context windows
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // For production build, we'll use the custom server
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
}));