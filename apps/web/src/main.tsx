import '@fwa/ui/tokens.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { captureBootstrap } from './lib/bootstrap';
import App from './App';

// SECURITY: read + strip the one-time #b= bootstrap code BEFORE anything else
// (router, stores, render) can observe or persist the URL.
captureBootstrap();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
