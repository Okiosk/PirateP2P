import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  // Using relative base path makes the build work out-of-the-box on GitHub Pages
  // (e.g. https://<user>.github.io/<repo>/) as well as any subfolder or custom domain.
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1200
  }
});
