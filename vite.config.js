import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        kid: resolve(import.meta.dirname, "kid.html"),
        parent: resolve(import.meta.dirname, "parent.html"),
      },
    },
  },
});
