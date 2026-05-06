import { defineConfig } from 'astro/config'
import node from '@astrojs/node'
import react from '@astrojs/react'
import tailwind from '@astrojs/tailwind'
import path from 'node:path'

export default defineConfig({
  adapter: node({
    mode: 'standalone',
  }),
  output: 'static',
  server: {
    host: true,
  },
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  vite: {
    resolve: {
      alias: {
        '@shared': path.resolve('./shared'),
      },
    },
    ssr: {
      noExternal: ['workflow-visualizer'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client'],
    },
  },
})
