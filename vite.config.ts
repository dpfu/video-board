import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

export default defineConfig({ plugins: [react(), {
  name: 'scdet-source',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'licenses/ffmpeg/scdet.ts', source: readFileSync(new URL('./src/scdet.ts', import.meta.url), 'utf8') });
  },
}], base: './', worker: { format: 'es' } });
