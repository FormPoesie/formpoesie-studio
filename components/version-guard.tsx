'use client';

import { useEffect } from 'react';

type BuildVersion = { version?: string };

export function VersionGuard() {
  useEffect(() => {
    let active = true;
    let loadedVersion = '';

    async function checkVersion() {
      try {
        const response = await fetch(`/build-version.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!response.ok || !active) return;
        const result = (await response.json()) as BuildVersion;
        const currentVersion = result.version || '';
        if (!currentVersion) return;
        if (!loadedVersion) {
          loadedVersion = currentVersion;
          return;
        }
        if (loadedVersion !== currentVersion) window.location.reload();
      } catch {
        // An unavailable version file must never interrupt the working surface.
      }
    }

    void checkVersion();
    const interval = window.setInterval(() => void checkVersion(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkVersion();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
