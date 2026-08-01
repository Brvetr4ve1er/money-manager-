import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Social-card URLs must be absolute: WhatsApp/Facebook/Telegram crawlers (the
 * dominant share channels in the target market) silently drop site-relative
 * og:image/twitter:image. Set VITE_SITE_URL to the canonical origin at build
 * time (see README "Deploying") and this plugin rewrites the /og.png
 * references and injects og:url.
 */
function absoluteSocialCards(siteUrl: string): Plugin {
  return {
    name: 'ember-absolute-social-cards',
    transformIndexHtml(html) {
      if (!siteUrl) return html
      return {
        html: html.replaceAll('content="/og.png"', `content="${siteUrl}/og.png"`),
        tags: [
          {
            tag: 'meta',
            attrs: { property: 'og:url', content: `${siteUrl}/` },
            injectTo: 'head',
          },
        ],
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = (env.VITE_SITE_URL ?? '').replace(/\/+$/, '')
  return {
    plugins: [react(), absoluteSocialCards(siteUrl)],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
}) as ReturnType<typeof defineConfig>
