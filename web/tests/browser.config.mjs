/** Serves the regression fixture without a backend or React fast refresh. */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const root = fileURLToPath(new URL('../', import.meta.url));
export default defineConfig({
  root,
  plugins: [tailwindcss()],
  resolve: { alias: { '@': `${root}src` } },
  cacheDir: `${root}node_modules/.vite-user-input-browser`,
  server: { host: '127.0.0.1', port: 5179, strictPort: true },
});
