/**
 * Strip HTML comments from the shipped document.
 *
 * WHY THIS EXISTS. index.html is 8.7 KB and 4.7 KB of it is comment — the
 * manifest's deliberately absent `orientation` key, why the social-card URLs
 * have to be absolute, why the noscript plate uses literal hexes. That
 * rationale belongs in the repo, next to the tags it explains; it does not
 * belong on the wire. Every first paint, on the phone this product is built
 * for, was paying ~2.1 KB gzipped for documentation the visitor cannot read
 * without View Source and would not want if they could. Vite minifies JS and
 * CSS and leaves HTML comments alone, so nothing else was going to remove them.
 *
 * NOT A NEW BUILD PLUGIN — see vite.config.ts, where the distribution plugin
 * already owns transformIndexHtml and already rewrites this document. This is
 * one more line inside a hook that was rewriting the file anyway.
 *
 * SOURCE IS UNTOUCHED. index.html keeps every comment, and src/shareCard.test.ts
 * still reads them from disk. This runs on the emitted copy only.
 *
 * CONDITIONAL COMMENTS ARE NOT A CASE HERE: `<!--[if IE]>` needs a browser that
 * stopped shipping in 2016, this document contains none, and the test asserts
 * the transform is a no-op on a document that has none of ours either.
 */
export function stripHtmlComments(html: string): string {
  // Non-greedy to the first `-->`, which is exactly HTML's own comment
  // terminator — a comment cannot contain `-->` in the first place.
  return html.replace(/<!--[\s\S]*?-->/g, '')
}
