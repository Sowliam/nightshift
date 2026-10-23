import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@nightshift/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  base: process.env.BUILD_FOR_ELECTRON ? './' : '/',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: 'esbuild',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-livekit': ['livekit-client', '@livekit/components-react'],
          'vendor-icons': ['lucide-react'],
          'vendor-utils': ['zustand', 'clsx', 'tailwind-merge'],
        },
      },
    },
  },
});
