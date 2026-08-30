import { useEffect, useState } from "react";

export function useCockpitTheme(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      if (window.parent && window.parent !== window && window.parent.document) {
        const pClasses = window.parent.document.documentElement.classList;
        return (
          pClasses.contains("pf-v6-theme-dark") ||
          pClasses.contains("pf-v5-theme-dark") ||
          pClasses.contains("theme-dark")
        );
      }
      return !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    } catch {
      return !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    }
  });

  useEffect(() => {
    const applyTheme = () => {
      let dark = false;
      try {
        if (window.parent && window.parent !== window && window.parent.document) {
          const pClasses = window.parent.document.documentElement.classList;
          dark =
            pClasses.contains("pf-v6-theme-dark") ||
            pClasses.contains("pf-v5-theme-dark") ||
            pClasses.contains("theme-dark");
        } else {
          dark = !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
        }
      } catch {
        dark = !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      }

      setIsDark(dark);
      if (dark) {
        document.documentElement.classList.add("pf-v5-theme-dark", "pf-v6-theme-dark", "theme-dark");
        document.documentElement.classList.remove("theme-light", "pf-m-light");
      } else {
        document.documentElement.classList.remove("pf-v5-theme-dark", "pf-v6-theme-dark", "theme-dark");
        document.documentElement.classList.add("theme-light", "pf-m-light");
      }
    };

    applyTheme();

    let observer: MutationObserver | null = null;
    try {
      if (window.parent && window.parent.document) {
        observer = new MutationObserver(applyTheme);
        observer.observe(window.parent.document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }
    } catch {
      // Cross-origin fallback
    }

    const interval = setInterval(applyTheme, 500);

    return () => {
      if (observer) {
        observer.disconnect();
      }
      clearInterval(interval);
    };
  }, []);

  return isDark;
}
