import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { createQueryClient } from './api/queries';
import { App } from './app/App';
import { createAppRouter } from './app/routes';

async function boot(): Promise<void> {
  // Mock mode is on unless VITE_USE_MOCKS=false. The condition is static, so a build without mocks
  // drops the whole branch, including MSW.
  if (import.meta.env.VITE_USE_MOCKS !== 'false') {
    const { bootMocks } = await import('./mocks/boot');
    await bootMocks();
  }

  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App queryClient={queryClient} router={router} />
    </StrictMode>,
  );
}

void boot();
