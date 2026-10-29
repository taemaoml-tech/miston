import { useEffect, useState } from 'react';

export const INFO_ROUTES = ['about', 'rules', 'privacy', 'support', 'contact'] as const;
export type InfoRoute = (typeof INFO_ROUTES)[number];

const HASH_CHANGE = 'miston:hash-change';

function readRoute(): InfoRoute | null {
  const path = window.location.hash.replace(/^#\/?/, '').split(/[?#]/)[0];
  return INFO_ROUTES.includes(path as InfoRoute) ? (path as InfoRoute) : null;
}

/** Оновлення хеша без історії браузера; власний подію ловить той самий слухач. */
function emitChange(): void {
  window.dispatchEvent(new Event(HASH_CHANGE));
}

export function useInfoRoute(): InfoRoute | null {
  const [route, setRoute] = useState<InfoRoute | null>(() => readRoute());
  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener(HASH_CHANGE, sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener(HASH_CHANGE, sync);
    };
  }, []);
  return route;
}

export function openInfo(route: InfoRoute): void {
  window.location.hash = `#/${route}`;
}

export function goHome(): void {
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  emitChange();
}

export function infoHref(route: InfoRoute): string {
  return `#/${route}`;
}
