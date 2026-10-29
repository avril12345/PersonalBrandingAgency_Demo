import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

const REPO = path.resolve(import.meta.dirname, '..')

// The operator dashboard reads the CRM and chief-of-staff files at request
// time, so internal data never ends up in the public client-facing bundle.
// Local only: there is no login, so don't deploy this endpoint as-is.
function opsData(): Plugin {
  const read = (rel: string) =>
    JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'))
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url !== '/api/ops') return next()
    try {
      const body = {
        meta: read('chief-of-staff/out/meta.json')[0],
        scorecard: read('chief-of-staff/out/scorecard.json'),
        actions: read('chief-of-staff/out/actions.json'),
        week: read('chief-of-staff/out/week.json'),
        health: read('chief-of-staff/out/health.json'),
        team: read('data/team.json').team,
        clients: read('data/clients.json').clients,
        posts: read('data/posts.json'),
        invoices: read('data/invoices.json'),
      }
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(body))
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: (e as Error).message }))
    }
  }
  return {
    name: 'loud-ops-data',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), opsData()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
