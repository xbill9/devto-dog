import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind every interface, so a phone on the same network can reach the
    // fixture portal at http://<laptop-ip>:5173/portal.html. That is the whole
    // point of the portal: the phone is what gets held up to the webcam.
    //
    // Only bind this on a network you trust -- it serves a dev build that
    // proxies to a backend holding a live API key.
    host: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true
      },
      // In production FastAPI serves the built SPA, so every path lands on the
      // backend and these two never came up. In dev, Vite is the origin and
      // anything not proxied is answered by Vite instead -- as a 404 for /api
      // and /fixtures.
      //
      // `/api/config` has been quietly 404ing in dev for as long as it has
      // existed. It fails soft (`r.ok ? r.json() : null`), so the only symptom
      // was the header reading AWAITING LINK -- which is exactly the bug that
      // endpoint was added to fix. A silent fallback hid its own cause.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/fixtures': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
