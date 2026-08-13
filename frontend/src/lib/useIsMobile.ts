import { useEffect, useState } from 'react';

/** true cuando el viewport es de teléfono/tablet angosta (≤ breakpoint px). */
export function useIsMobile(breakpoint = 768): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);
  return mobile;
}
