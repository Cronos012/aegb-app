import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Le service worker (sw/sw.js) : à chaque construction, il reçoit un numéro
 * de version et la liste des fichiers à garder pour ouvrir l'appli sans
 * réseau. Un numéro qui change fait apparaître le bandeau « Nouvelle version ».
 * Les écrans du bureau et les gros fichiers (PDF) se gardent seulement une
 * fois ouverts.
 */
function serviceWorker(): Plugin {
  return {
    name: 'aegb-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const entry = Object.values(bundle).find((f) => f.type === 'chunk' && f.isEntry)
      const files = new Set<string>()
      const visit = (name: string) => {
        const file = bundle[name]
        if (!file || files.has(name)) return
        files.add(name)
        if (file.type === 'chunk') {
          file.imports.forEach(visit)
          file.viteMetadata?.importedCss.forEach((css) => files.add(css))
        }
      }
      if (entry) visit(entry.fileName)
      const precache = ['index.html', 'manifest.webmanifest', 'logo-rond.webp', 'favicon.png', 'icons/icon-192.png', 'icons/badge-96.png', ...[...files].sort()]
      const version = createHash('sha256').update(Object.keys(bundle).sort().join('\n')).digest('hex').slice(0, 12)
      const source = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('= __PRECACHE__', '= ' + JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// BASE_PATH permet de publier l'appli dans un sous-dossier (GitHub Pages : /aegb-app/).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString()) },
  plugins: [react(), tailwindcss(), serviceWorker()],
})
