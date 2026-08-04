// defineConfig comes from 'vitest/config', whose UserConfig extends Vite's
// with a typed `test` field — the 'vite' version would force an `as` cast on
// the whole export, silently disabling type checking for every config key.
import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { stripHtmlComments } from './scripts/htmlComments.ts'

/**
 * The distribution layer that only a real origin can complete.
 *
 * Social-card URLs must be absolute: WhatsApp/Facebook/Telegram crawlers (the
 * dominant share channels in the target market) silently drop site-relative
 * og:image/twitter:image. The canonical link has the same constraint, for a
 * different reason — every deploy-preview URL, trailing-slash variant and
 * ?utm= share otherwise competes with the real origin in search.
 *
 * Set VITE_SITE_URL to the canonical origin at build time (see README
 * "Deploying") and this plugin:
 *   · rewrites the /og.png references to absolute URLs
 *   · injects og:url and <link rel="canonical">
 *   · emits sitemap.xml (one URL — the app is a single page)
 * robots.txt is emitted either way; only its Sitemap: line needs the origin.
 */
function distribution(siteUrl: string): Plugin {
  return {
    name: 'ember-distribution',
    transformIndexHtml(html) {
      // The comments are repo documentation, not payload — see
      // scripts/htmlComments.ts. Stripped whether or not an origin is set,
      // because the reason has nothing to do with distribution metadata.
      const stripped = stripHtmlComments(html)
      if (!siteUrl) return stripped
      return {
        html: stripped.replaceAll('content="/og.png"', `content="${siteUrl}/og.png"`),
        tags: [
          {
            tag: 'meta',
            attrs: { property: 'og:url', content: `${siteUrl}/` },
            injectTo: 'head',
          },
          {
            tag: 'link',
            attrs: { rel: 'canonical', href: `${siteUrl}/` },
            injectTo: 'head',
          },
        ],
      }
    },
    generateBundle() {
      // Emitted rather than shipped in public/: the Sitemap line and the whole
      // sitemap need the absolute origin, which only exists at build time. A
      // static robots.txt would either omit the pointer or hard-code someone
      // else's domain.
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source:
          'User-agent: *\nAllow: /\n' +
          (siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml\n` : ''),
      })
      if (!siteUrl) return
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source:
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          `  <url><loc>${siteUrl}/</loc></url>\n` +
          '</urlset>\n',
      })
    },
  }
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = (env.VITE_SITE_URL ?? '').replace(/\/+$/, '')
  // The README's deploy checklist as a guardrail, not a hope: a production
  // build without VITE_SITE_URL would otherwise silently ship relative
  // og:image/twitter:image URLs that the dominant share channels drop, and no
  // canonical link at all.
  if (command === 'build' && !siteUrl) {
    console.warn(
      '\n[ember] WARNING: VITE_SITE_URL is unset — og:image/twitter:image stay ' +
        'site-relative, and WhatsApp/Facebook/Telegram crawlers silently drop ' +
        'relative social-card URLs. No canonical link or sitemap.xml is ' +
        'emitted either. Set VITE_SITE_URL to the canonical origin before ' +
        'deploying (see README "Deploying").\n',
    )
  }
  return {
    plugins: [react(), distribution(siteUrl)],
    test: {
      environment: 'node',
      // Component tests (*.test.tsx) need a DOM; engine/state tests stay on
      // the faster node environment.
      environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }
})
