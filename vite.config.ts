import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Относительные пути к ассетам: GitHub Pages отдаёт проект с подпути
  // (/qr-drop/), а те же файлы должны работать и с корня любого хостинга.
  base: './',
  build: {
    target: 'es2022',
    // Приложение работает офлайн, поэтому мелочь встроена в бандл.
    assetsInlineLimit: 4096,
  },
  server: {
    host: true,
    port: 5173,
  },
});
