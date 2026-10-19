import { defineConfig } from 'vite';

// GitHub Pages serves the project at /civilwarstrategy/
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/civilwarstrategy/' : '/',
});
