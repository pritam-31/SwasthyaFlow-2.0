import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import './mui/license'
import { MuiProvider } from './mui/MuiProvider'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MuiProvider>
      <App />
    </MuiProvider>
  </StrictMode>,
)
