import { useState, useEffect, useCallback, useRef } from "react";

declare const cockpit: {
  location?: {
    path?: string[];
    options?: Record<string, string>;
    href?: string;
    go?: (path: string | string[], options?: Record<string, string>) => void;
    replace?: (path: string | string[], options?: Record<string, string>) => void;
  };
  addEventListener?: (event: string, callback: () => void) => void;
  removeEventListener?: (event: string, callback: () => void) => void;
};

export enum NavMode {
  Replace = "replace",
  Push = "push",
}

/**
 * Extracts current route segments from cockpit.location or window.location.hash.
 *
 * Example:
 *   URL '#/pools/tank/snapshots' -> ['pools', 'tank', 'snapshots']
 */
export function getCockpitSegments(ignoredPrefixes: string[] = []): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  // Prefer cockpit shell path when embedded
  if (
    typeof cockpit !== "undefined" &&
    cockpit.location &&
    Array.isArray(cockpit.location.path) &&
    cockpit.location.path.length > 0
  ) {
    const raw = cockpit.location.path;
    const lowerPrefixes = ignoredPrefixes.map((p) => {
      return p.toLowerCase();
    });

    if (raw.length > 0 && lowerPrefixes.includes(raw[0].toLowerCase())) {
      return raw.slice(1);
    }

    return raw;
  }

  // Fallback to window hash for direct or standalone execution
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash) {
    return hash.split("/").filter(Boolean);
  }

  return [];
}

/**
 * Synchronizes route with Cockpit host shell or standalone window history.
 */
export function syncCockpitLocation(segments: string[], mode: NavMode = NavMode.Replace): void {
  const targetPath = segments.length > 0 ? `/${segments.join("/")}` : "/";
  const targetHash = segments.length > 0 ? `#/${segments.join("/")}` : "#/";

  // Update Cockpit host shell location if available
  if (typeof cockpit !== "undefined" && cockpit.location) {
    if (mode === NavMode.Replace && typeof cockpit.location.replace === "function") {
      cockpit.location.replace(targetPath);
      return;
    }

    if (typeof cockpit.location.go === "function") {
      cockpit.location.go(targetPath);
      return;
    }
  }

  // Fallback to standalone iframe window history when not running inside Cockpit
  if (typeof window !== "undefined" && window.location.hash !== targetHash) {
    if (mode === NavMode.Replace) {
      window.history.replaceState(null, "", targetHash);
    } else {
      window.history.pushState(null, "", targetHash);
    }
  }
}

/**
 * Hook for bidirectional zero-flicker routing in Cockpit plugins.
 */
export function useCockpitRoute<T>(
  parseRoute: (segments: string[]) => T,
  formatSegments: (route: T) => string[],
  ignoredPrefixes: string[] = []
): [T, (nextRoute: T, mode?: NavMode) => void] {
  const [route, setRoute] = useState<T>(() => {
    return parseRoute(getCockpitSegments(ignoredPrefixes));
  });

  const lastPathRef = useRef<string>("");

  const navigateTo = useCallback(
    (nextRoute: T, mode: NavMode = NavMode.Replace) => {
      setRoute(nextRoute);

      const segments = formatSegments(nextRoute);
      const pathStr = segments.join("/");
      lastPathRef.current = pathStr;

      syncCockpitLocation(segments, mode);
    },
    [formatSegments]
  );

  const syncFromEnv = useCallback(() => {
    const segments = getCockpitSegments(ignoredPrefixes);
    const pathStr = segments.join("/");

    if (pathStr === lastPathRef.current) {
      return;
    }

    lastPathRef.current = pathStr;
    setRoute(parseRoute(segments));
  }, [parseRoute, ignoredPrefixes]);

  useEffect(() => {
    if (typeof cockpit !== "undefined" && cockpit.addEventListener) {
      cockpit.addEventListener("locationchanged", syncFromEnv);

      return () => {
        cockpit.removeEventListener?.("locationchanged", syncFromEnv);
      };
    }
  }, [syncFromEnv]);

  useEffect(() => {
    window.addEventListener("hashchange", syncFromEnv);
    window.addEventListener("popstate", syncFromEnv);

    return () => {
      window.removeEventListener("hashchange", syncFromEnv);
      window.removeEventListener("popstate", syncFromEnv);
    };
  }, [syncFromEnv]);

  return [route, navigateTo];
}
