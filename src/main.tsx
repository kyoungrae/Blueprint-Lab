import { createRoot } from 'react-dom/client'
import './index.css'
import { DevErrorBoundary } from './components/DevErrorBoundary'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <DevErrorBoundary>
    <App />
  </DevErrorBoundary>
)
