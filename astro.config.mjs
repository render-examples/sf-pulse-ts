import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import path from "node:path";

export default defineConfig({
  adapter: node({
    mode: "standalone",
  }),
  output: "static",
  server: {
    host: true,
  },
  vite: {
    resolve: {
      alias: {
        "@shared": path.resolve("./shared"),
      },
    },
  },
});
