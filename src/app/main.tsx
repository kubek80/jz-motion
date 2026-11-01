import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

if (new URLSearchParams(location.search).has('render')) {
  void import('../render/page');
} else {
  void Promise.all([import('./App'), import('@fontsource/caveat/700.css'), import('./styles.css')]).then(([{ App }]) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
