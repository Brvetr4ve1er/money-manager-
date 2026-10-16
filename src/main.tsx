import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Outfit, bundled locally (no Google Fonts request at runtime; see index.html).
import '@fontsource/outfit/300.css'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import App from './App.tsx'
import { isProtoHash, ProtoShell } from './proto/ProtoShell.tsx'

// `#/proto…` renders the UI prototype shell INSTEAD of the app, so the app's
// global stylesheets (imported by App) never load and each prototype owns
// the viewport. A hash change between the two needs a reload; that is fine
// for a design-review surface.
const Root = isProtoHash() ? ProtoShell : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
