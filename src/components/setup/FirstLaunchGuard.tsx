'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function FirstLaunchGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === '/setup' || pathname.startsWith('/_next/')) return;

    let cancelled = false;

    const checkSetup = async () => {
      try {
        const response = await fetch('/api/setup/status', { cache: 'no-store' });
        if (!response.ok) return;

        const data = await response.json();
        if (!cancelled && data.configured === false) {
          router.replace('/setup');
        }
      } catch {
        // Do not redirect on an inconclusive status check. Authentication and
        // the normal application error handling remain responsible for failures.
      }
    };

    checkSetup();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
