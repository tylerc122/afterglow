import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// spotify only accepts loopback IPs as redirect URIs, so we pin the host
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
})
