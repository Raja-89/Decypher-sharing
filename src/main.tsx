import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { LocaleProvider } from './context/LocaleContext'
import { CaseProvider } from './context/CaseContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LocaleProvider>
        <CaseProvider><App /></CaseProvider>
      </LocaleProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
