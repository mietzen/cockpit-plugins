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

export interface CockpitLocationState {
  path: string[];
  options: Record<string, string>;
}

/**
 * Extracts current route options and path from cockpit.location or window.location.hash.
 *
 * Examples:
 *   URL '#/?tab=smb' -> { path: [], options: { tab: 'smb' } }
 *   URL '#/pools'    -> { path: ['pools'], options: {} }
 */
export function getCockpitLocation(ignoredPrefixes: string[] = []): CockpitLocationState {
  if (typeof window === "undefined") {
    return { path: [], options: {} };
  }

  // 1. Prefer cockpit.location when embedded in Cockpit shell
  if (typeof cockpit !== "undefined" && cockpit.location) {
    const options: Record<string, string> = { ...(cockpit.location.options || {}) };
    let pathSegments: string[] = [];

    if (Array.isArray(cockpit.location.path)) {
      const raw = cockpit.location.path;
      const lowerPrefixes = ignoredPrefixes.map((p) => p.toLowerCase());
      let startIndex = 0;
      while (startIndex < raw.length && lowerPrefixes.includes(raw[startIndex].toLowerCase())) {
        startIndex++;
      }
      pathSegments = raw.slice(startIndex);
    }

    return { path: pathSegments, options };
  }

  // 2. Fallback to window.location.hash for standalone execution
  const rawHash = window.location.hash.replace(/^#\/?/, "");
  if (!rawHash) {
    return { path: [], options: {} };
  }

  const [pathPart, queryPart] = rawHash.split("?");
  const path = pathPart ? pathPart.split("/").filter(Boolean) : [];
  const options: Record<string, string> = {};

  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    params.forEach((val, key) => {
      options[key] = val;
    });
  }

  let startIndex = 0;
  const lowerPrefixes = ignoredPrefixes.map((p) => p.toLowerCase());
  while (startIndex < path.length && lowerPrefixes.includes(path[startIndex].toLowerCase())) {
    startIndex++;
  }
  const filteredPath = path.slice(startIndex);

  return { path: filteredPath, options };
}

/**
 * Synchronizes route options with Cockpit host shell or standalone window hash.
 */
export function syncCockpitLocation(
  options: Record<string, string> = {},
  path: string[] = [],
  mode: NavMode = NavMode.Replace
): void {
  // Update Cockpit host shell location via options query params
  if (typeof cockpit !== "undefined" && cockpit.location) {
    if (mode === NavMode.Replace && typeof cockpit.location.replace === "function") {
      cockpit.location.replace(path, options);
      return;
    }

    if (typeof cockpit.location.go === "function") {
      cockpit.location.go(path, options);
      return;
    }
  }

  // Fallback to standalone window history
  if (typeof window !== "undefined") {
    const searchParams = new URLSearchParams();
    Object.entries(options).forEach(([k, v]) => {
      if (v) {
        searchParams.set(k, v);
      }
    });

    const queryString = searchParams.toString();
    const pathStr = path.length > 0 ? path.join("/") : "";
    const targetHash = queryString ? `#/${pathStr}?${queryString}` : pathStr ? `#/${pathStr}` : "#/";

    if (window.location.hash !== targetHash) {
      if (mode === NavMode.Replace) {
        window.history.replaceState(null, "", targetHash);
      } else {
        window.history.pushState(null, "", targetHash);
      }
    }
  }
}

/**
 * Hook for zero-flicker SPA routing matching Cockpit services.html pattern.
 */
export function useCockpitRoute<T>(
  parseLocation: (state: CockpitLocationState) => T,
  formatLocation: (route: T) => { options: Record<string, string>; path?: string[] },
  ignoredPrefixes: string[] = []
): [T, (nextRoute: T, mode?: NavMode) => void] {
  const [route, setRoute] = useState<T>(() => {
    return parseLocation(getCockpitLocation(ignoredPrefixes));
  });

  const lastKeyRef = useRef<string>("");

  const navigateTo = useCallback(
    (nextRoute: T, mode: NavMode = NavMode.Replace) => {
      setRoute(nextRoute);

      const formatted = formatLocation(nextRoute);
      const options = formatted.options || {};
      const path = formatted.path || [];
      const keyStr = JSON.stringify({ path, options });
      lastKeyRef.current = keyStr;

      syncCockpitLocation(options, path, mode);
    },
    [formatLocation]
  );

  const syncFromEnv = useCallback(() => {
    const loc = getCockpitLocation(ignoredPrefixes);
    const keyStr = JSON.stringify(loc);

    if (keyStr === lastKeyRef.current) {
      return;
    }

    lastKeyRef.current = keyStr;
    setRoute(parseLocation(loc));
  }, [parseLocation, ignoredPrefixes]);

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
