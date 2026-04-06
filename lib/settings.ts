/** Client-side settings reader for the AI provider configuration. */

const STORAGE_KEY = 'trellis-settings';

/** Saved AI settings shape. */
export type TrellisSettings = {
  provider: string;
  model: string;
  apiKey: string;
};

/**
 * Read AI settings from localStorage.
 * @returns Settings object, or undefined if not set.
 */
export function getSettings(): TrellisSettings | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TrellisSettings;
  } catch (err) { console.warn("[settings] Failed to parse stored settings:", err); }
  return undefined;
}
