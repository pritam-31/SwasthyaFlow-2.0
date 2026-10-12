import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import './mui/license'
import { MuiProvider } from './mui/MuiProvider'
import { ThemeProvider } from './context/ThemeContext'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <MuiProvider>
        <App />
      </MuiProvider>
    </ThemeProvider>
  </StrictMode>,
)
