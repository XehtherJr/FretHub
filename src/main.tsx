import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { prefetchGuitarSamples } from '@core/audio';
import { LibrarySyncProvider } from '@/hooks/LibrarySync';
import './styles/global.css';
import './styles/fretboard.css';
import './styles/workbench.css';
import './styles/pages.css';
import './styles/tools.css';
import './styles/lessons.css';

// Fetch the local recordings after the interface has had a chance to render.
window.setTimeout(prefetchGuitarSamples, 1500);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LibrarySyncProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LibrarySyncProvider>
  </React.StrictMode>,
);
