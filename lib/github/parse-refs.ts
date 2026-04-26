/**
 * Mymir ticket reference parser for GitHub PR titles + bodies.
 *
 * Two distinct match modes:
 * - `[MYMR-XXX]` (brackets) → primary task. At most one per PR. Drives task-state automation.
 * - `MYMR-XXX` (no brackets) → plain reference. Any number per PR. Listed only.
 */

const BRACKETED = /\[([A-Z0-9]{2,12})-(\d+)\]/g;
const PLAIN = /(?<!\[)([A-Z0-9]{2,12})-(\d+)(?!\])/g;

export type ParsedRef = {
  identifier: string;
  sequence: number;
  isPrimary: boolean;
};

export type ParseResult = {
  refs: ParsedRef[];
  error?: string;
};

/**
 * Extract bracketed (primary) and plain (referenced) ticket refs from text.
 *
 * Deduplicates by `identifier-sequence` keeping primary precedence. Returns
 * an error when more than one bracketed ref is present, since the PR template
 * convention enforces a single primary.
 */
export function parseRefs(text: string): ParseResult {
  if (!text) return { refs: [] };

  const primaryMatches = [...text.matchAll(BRACKETED)];
  if (primaryMatches.length > 1) {
    const found = primaryMatches.map((m) => `[${m[1]}-${m[2]}]`).join(", ");
    return {
      refs: [],
      error: `Multiple bracketed primary refs found (${found}); PR must declare a single primary task.`,
    };
  }

  const seen = new Map<string, ParsedRef>();

  for (const match of primaryMatches) {
    const identifier = match[1];
    const sequence = Number(match[2]);
    const key = `${identifier}-${sequence}`;
    seen.set(key, { identifier, sequence, isPrimary: true });
  }

  for (const match of text.matchAll(PLAIN)) {
    const identifier = match[1];
    const sequence = Number(match[2]);
    const key = `${identifier}-${sequence}`;
    if (seen.has(key)) continue;
    seen.set(key, { identifier, sequence, isPrimary: false });
  }

  return { refs: [...seen.values()] };
}
