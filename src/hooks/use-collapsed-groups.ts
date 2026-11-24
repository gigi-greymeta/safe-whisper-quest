import { useCallback, useEffect, useState } from "react";

/**
 * Which groups in a grouped list are open. A group follows `defaultOpen` until someone toggles it;
 * that choice is remembered per `scope` (e.g. "customers") in this browser.
 */
export function useCollapsedGroups(scope: string, { defaultOpen = true }: { defaultOpen?: boolean } = {}) {
  const storageKey = `collapsed-groups:${scope}`;
  const [choices, setChoices] = useState<Record<string, boolean>>(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
      // Earlier versions stored only the collapsed groups, as an array.
      return Array.isArray(stored) ? Object.fromEntries(stored.map((group: string) => [group, false])) : stored;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(choices));
    } catch {
      // Storage blocked or full: groups still collapse, they just won't be remembered.
    }
  }, [choices, storageKey]);

  const isOpen = useCallback((group: string) => choices[group] ?? defaultOpen, [choices, defaultOpen]);
  const toggle = useCallback(
    (group: string) => setChoices((current) => ({ ...current, [group]: !(current[group] ?? defaultOpen) })),
    [defaultOpen],
  );

  return { isOpen, toggle };
}
