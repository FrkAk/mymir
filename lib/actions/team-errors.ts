import "server-only";

import { z } from "zod/v4";

/**
 * Closed set of failure codes the team wrappers can return. Mapped from
 * Better Auth's `ORGANIZATION_ERROR_CODES` (57 entries) — we never invent
 * a parallel taxonomy.
 */
export type TeamActionFailureCode =
  | "unauthorized"
  | "no_active_team"
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "already_member"
  | "already_invited"
  | "wrong_recipient"
  | "email_verification_required"
  | "membership_limit_reached"
  | "cannot_leave_only_owner"
  | "slug_taken"
  | "unknown";

/** Discriminated result. `T = void` shrinks to `{ ok: true }` (no `data`). */
export type TeamActionResult<T = void> = [T] extends [void]
  ? { ok: true } | TeamActionFailure
  : { ok: true; data: T } | TeamActionFailure;

export type TeamActionFailure = {
  ok: false;
  code: TeamActionFailureCode;
  message: string;
};

/** Human-readable copy keyed by failure code. Single source of truth. */
export const TEAM_ACTION_MESSAGES: Record<TeamActionFailureCode, string> = {
  unauthorized: "You must be signed in to perform this action.",
  no_active_team:
    "Pick a team before continuing — visit /onboarding/team to create or join one.",
  forbidden: "You don't have permission to do that.",
  invalid_input: "Invalid input.",
  not_found: "We couldn't find that.",
  already_member: "That user is already a member of this team.",
  already_invited: "That user has already been invited to this team.",
  wrong_recipient: "This invitation belongs to someone else.",
  email_verification_required:
    "Verify your email address before accepting invitations.",
  membership_limit_reached:
    "This team has reached its member limit. Contact the owner.",
  cannot_leave_only_owner:
    "You're the only owner — promote another member first, then leave.",
  slug_taken: "That URL slug is already in use. Try a different one.",
  unknown: "Something went wrong. Please try again.",
};

/** Build a failure result with the canonical message for `code`. */
export function teamFail(code: TeamActionFailureCode): TeamActionFailure {
  return { ok: false, code, message: TEAM_ACTION_MESSAGES[code] };
}

/**
 * Translate a Better Auth API error to a `TeamActionFailureCode`. Reads
 * the `body.code` constant key (e.g. `"USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION"`)
 * — never the human message, since that's not a stable identifier.
 *
 * @param err - Caught error from `auth.api.*`.
 * @returns Mapped code; `unknown` for anything we don't explicitly recognize.
 */
export function mapBetterAuthError(err: unknown): TeamActionFailureCode {
  const code = (err as { body?: { code?: string } } | null)?.body?.code;
  if (typeof code !== "string") return "unknown";
  switch (code) {
    case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
      return "already_member";
    case "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION":
      return "already_invited";
    case "INVITATION_NOT_FOUND":
    case "MEMBER_NOT_FOUND":
    case "ORGANIZATION_NOT_FOUND":
    case "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION":
      return "not_found";
    case "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION":
      return "wrong_recipient";
    case "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION":
      return "email_verification_required";
    case "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED":
    case "INVITATION_LIMIT_REACHED":
      return "membership_limit_reached";
    case "NO_ACTIVE_ORGANIZATION":
    case "YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM":
      return "no_active_team";
    case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER":
    case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER":
      return "cannot_leave_only_owner";
    case "ORGANIZATION_ALREADY_EXISTS":
    case "ORGANIZATION_SLUG_ALREADY_TAKEN":
      return "slug_taken";
    default:
      if (code.startsWith("YOU_ARE_NOT_ALLOWED_TO_")) return "forbidden";
      return "unknown";
  }
}

/**
 * Reject obviously bad input early. Returns the parsed value or a typed
 * `invalid_input` failure carrying the first Zod issue's message.
 */
export function parseOrFail<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; data: T } | TeamActionFailure {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    code: "invalid_input",
    message: parsed.error.issues[0]?.message ?? TEAM_ACTION_MESSAGES.invalid_input,
  };
}
