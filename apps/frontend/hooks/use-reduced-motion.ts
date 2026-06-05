import { useEffect, useState } from 'react';

/**
 * Tracks the `prefers-reduced-motion` media query (Epic #424). Returns true when
 * the user has asked to minimize motion, so animated previews fall back to an
 * immediate static render. SSR-safe (defaults to false until mounted).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
