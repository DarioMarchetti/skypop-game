import { defineConfig } from 'vite';
export default defineConfig({ build: { outDir: 'dist-qa', rollupOptions: { input: ['index.html', 'qa.html'] } } });
