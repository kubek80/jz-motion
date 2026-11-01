import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

if (new URLSearchParams(location.search).has('render')) {
  void import('../render/page');
} else {
  void Promise.all([import('./Root'), import('@fontsource/caveat/700.css'), import('./styles.css')]).then(([{ Root }]) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Root />
      </StrictMode>,
    );
  });
}
