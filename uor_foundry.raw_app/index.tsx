import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { WindmillPackagedApp } from './App';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <WindmillPackagedApp />
    </React.StrictMode>
  );
}
