import { useCallback, useState } from 'react';

/**
 * Copy-to-clipboard state with auto-reset.
 * @param resetMs - How long "copied" stays true (default 1200ms).
 * @returns `{ copied, copy }` — call `copy(text)` per invocation.
 */
export function useCopyToClipboard(resetMs = 1200) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), resetMs);
  }, [resetMs]);
  return { copied, copy };
}
