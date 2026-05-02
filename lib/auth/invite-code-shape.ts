/**
 * Shape constants for the team invite code. Lives in its own module so
 * client components can import the regex/length without pulling the
 * server-only `crypto` dependency from `./invite-code.ts`.
 */

/** Length in characters. 21 chars × log2(64) = 126 bits of entropy. */
export const INVITE_CODE_LENGTH = 21;

/**
 * Character class shared by the anchored server regex and the unanchored
 * HTML `pattern` attribute. Single source of truth for the alphabet.
 */
export const INVITE_CODE_ALPHABET_PATTERN_SOURCE = "[A-Za-z0-9_-]";

/** Anchored shape check for join-by-code input. */
export const INVITE_CODE_PATTERN = new RegExp(
  `^${INVITE_CODE_ALPHABET_PATTERN_SOURCE}{${INVITE_CODE_LENGTH}}$`,
);
