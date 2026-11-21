import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/beaver-ui.css'
import App from './App.tsx'
import { installStaleChunkReloadHandler } from './lib/staleChunkReload.ts'
import { installEmptyDateMarker } from './lib/emptyDateMarker.ts'

installStaleChunkReloadHandler()
installEmptyDateMarker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
