import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './Root.tsx'

// Root, not App: the cold-start gate decides which of the two mutually
// exclusive surfaces mounts (see Root.tsx). App is still the whole product and
// still renders standalone — the gate only chooses when it first appears.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
