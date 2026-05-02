import { randomBytes } from "node:crypto";

import {
  INVITE_CODE_ALPHABET_PATTERN_SOURCE,
  INVITE_CODE_LENGTH,
  INVITE_CODE_PATTERN,
} from "./invite-code-shape";

export {
  INVITE_CODE_ALPHABET_PATTERN_SOURCE,
  INVITE_CODE_LENGTH,
  INVITE_CODE_PATTERN,
};

/**
 * 64-char URL-safe alphabet. Matches `nanoid`'s default. Mask `0x3F`
 * gives an unbiased uniform draw because 256 mod 64 === 0, so every
 * byte produces exactly one symbol with probability 1/64.
 */
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Generate a 21-char URL-safe invite code (~126 bits entropy).
 * Uses `crypto.randomBytes` (CSPRNG) — never `Math.random`.
 * @returns Newly minted code string.
 */
export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] & 0x3f];
  }
  return out;
}
