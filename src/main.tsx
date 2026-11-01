import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter-tight/400.css';
import '@fontsource/inter-tight/500.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/400-italic.css';
import './styles.css';
import { App } from './App.tsx';
import { mark } from './lib/marks.ts';

mark('js-evaluated');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
