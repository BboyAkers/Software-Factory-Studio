import { Outlet } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useFactoryStream } from '../../api/stream';
import { useCurrentPage } from '../../app/nav';
import { Overlays } from '../../app/Overlays';
import { Banners } from './Banners';
import { Header } from './Header';
import { MobileNav, NavPane } from './NavPane';
import { useGlobalAlerts, useOfflineReplay, useShortcuts } from './useShellEffects';

/**
 * The frame every page of a project sits in: navigation, header, banners, and the page area. It also holds
 * the project's event stream open, so everything below it stays current without polling.
 */
export function AppShell() {
  useFactoryStream();
  useGlobalAlerts();
  useOfflineReplay();
  useShortcuts();

  const segment = useCurrentPage()?.segment;
  const main = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // Going to another page moves focus to the page area, as a full page load would. Opening a drawer
  // within a page does not change the segment, so it leaves focus alone.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    main.current?.focus({ preventScroll: true });
  }, [segment]);

  return (
    <div className="flex h-full w-full min-w-0 bg-surface text-on-surface">
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-fluent-blue focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <NavPane />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header />
        <Banners />
        <main id="main" ref={main} tabIndex={-1} className="min-h-0 flex-1 overflow-hidden focus:outline-none">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <Overlays />
    </div>
  );
}
