import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Certificados locais gerados via mkcert (apenas dev).
// Veja: certs/embed.crt e certs/embed.key
// Controle via env: VITE_HTTPS=true habilita; qualquer outro valor (ou ausência) deixa HTTP.
const certPath = path.resolve(__dirname, 'certs/embed.crt')
const keyPath = path.resolve(__dirname, 'certs/embed.key')
const enableHttps = process.env.VITE_HTTPS === 'true'
const hasLocalCerts = enableHttps && fs.existsSync(certPath) && fs.existsSync(keyPath)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['embed.coraxy.com.br', 'cobranca.coraxy.com.br', 'localhost', '127.0.0.1'],
    ...(hasLocalCerts && {
      https: {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      },
    }),
  },
})
