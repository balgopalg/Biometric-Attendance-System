import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Toaster
      position="top-right"
      reverseOrder={false}
      gutter={10}
      containerStyle={{ zIndex: 2147483000, top: 16, right: 16 }}
      toastOptions={{
        duration: 3200,
        removeDelay: 220,
        style: {
          background: 'rgba(15, 23, 42, 0.96)',
          color: '#f8fafc',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
        },
        success: {
          iconTheme: { primary: '#10b981', secondary: '#ecfdf5' },
        },
        error: {
          iconTheme: { primary: '#ef4444', secondary: '#fef2f2' },
        },
      }}
    />
    <App />
  </StrictMode>,
)
