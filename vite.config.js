import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Without this, Rollup merges @adyen/adyen-web into the main entry chunk
        // instead of giving the dynamic import("@adyen/adyen-web") in
        // AdyenPaymentPanel.jsx its own lazy chunk — at runtime that import then
        // resolves back to the already-loaded main bundle, whose default export
        // isn't AdyenCheckout, throwing "... is not a function" when called.
        manualChunks(id) {
          if (id.includes("@adyen/adyen-web")) return "adyen-web";
        },
      },
    },
  },
})
