import { useEffect } from 'react';

const APP_NAME = 'Software Factory Studio';

/** Set the browser tab title: `usePageTitle('Task Matrix')` → "Task Matrix · Software Factory Studio". */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
