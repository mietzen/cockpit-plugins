import { useEffect, useState } from "react";

export function useCockpitTheme(): boolean {
  const detectTheme = (): boolean => {
    // 1. Try reading from parent Cockpit host shell
    try {
      if (
        window.parent &&
        window.parent !== window &&
        window.parent.document &&
        window.parent.document.documentElement
      ) {
        const pClasses = window.parent.document.documentElement.classList;
        return (
          pClasses.contains("pf-v6-theme-dark") ||
          pClasses.contains("pf-v5-theme-dark") ||
          pClasses.contains("theme-dark")
        );
      }
    } catch {
      // Cross-origin iframe boundary
    }

    // 2. Read from current document element (updated by index.html script or cockpit events)
    if (typeof document !== "undefined" && document.documentElement) {
      const dClasses = document.documentElement.classList;
      if (
        dClasses.contains("pf-v6-theme-dark") ||
        dClasses.contains("pf-v5-theme-dark") ||
        dClasses.contains("theme-dark")
      ) {
        return true;
      }
      if (dClasses.contains("theme-light") || dClasses.contains("pf-m-light")) {
        return false;
      }
    }

    // 3. Check localStorage shell:style
    try {
      const shellStyle = localStorage.getItem("shell:style");
      if (shellStyle === "dark") return true;
      if (shellStyle === "light") return false;
    } catch {}

    // 4. Standalone window fallback (when not in an iframe)
    if (typeof window !== "undefined" && window.parent === window) {
      return !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    }

    return false;
  };

  const [isDark, setIsDark] = useState<boolean>(detectTheme);

  useEffect(() => {
    const applyTheme = (forcedTheme?: any) => {
      let dark = false;
      if (typeof forcedTheme === "string") {
        dark = forcedTheme === "dark";
      } else {
        dark = detectTheme();
      }

      setIsDark(dark);
      const docEl = document.documentElement;
      if (dark) {
        docEl.classList.add("pf-v5-theme-dark", "pf-v6-theme-dark", "theme-dark");
        docEl.classList.remove("theme-light", "pf-m-light");
      } else {
        docEl.classList.remove("pf-v5-theme-dark", "pf-v6-theme-dark", "theme-dark");
        docEl.classList.add("theme-light", "pf-m-light");
      }
    };

    applyTheme();

    let observer: MutationObserver | null = null;
    try {
      if (
        window.parent &&
        window.parent !== window &&
        window.parent.document &&
        window.parent.document.documentElement
      ) {
        observer = new MutationObserver(() => applyTheme());
        observer.observe(window.parent.document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }
    } catch {}

    const handleCockpitStyle = (e: any) => {
      applyTheme(e.detail?.style || e.detail?.theme);
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "shell:style") {
        applyTheme();
      }
    };

    window.addEventListener("cockpit-style", handleCockpitStyle);
    window.addEventListener("storage", handleStorage);
    const interval = setInterval(() => applyTheme(), 500);

    return () => {
      if (observer) {
        observer.disconnect();
      }
      window.removeEventListener("cockpit-style", handleCockpitStyle);
      window.removeEventListener("storage", handleStorage);
      clearInterval(interval);
    };
  }, []);

  return isDark;
}
