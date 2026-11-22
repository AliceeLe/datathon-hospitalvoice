import { useEffect, useState } from 'react';

export type Route =
  | { name: 'find' }
  | { name: 'chat'; id: string }
  | { name: 'tracker' }
  | { name: 'planner' };

export function parseHash(hash: string): Route {
  const h = decodeURIComponent(hash.replace(/^#\/?/, ''));
  if (h.startsWith('chat/')) return { name: 'chat', id: h.slice(5) };
  if (h === 'tracker') return { name: 'tracker' };
  if (h === 'planner') return { name: 'planner' };
  return { name: 'find' };
}

export const href = {
  find: '#/',
  chat: (id: string) => `#/chat/${encodeURIComponent(id)}`,
  tracker: '#/tracker',
  planner: '#/planner',
};

export function navigate(to: string) { window.location.hash = to.replace(/^#/, ''); }

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => { setRoute(parseHash(window.location.hash)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
