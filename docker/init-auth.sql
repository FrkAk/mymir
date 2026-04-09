-- Neon Auth schema for self-hosted Postgres.
-- Mirrors the tables Neon Auth provisions on hosted Neon projects.
-- Runs on first `docker compose up` (empty volume only).

CREATE SCHEMA IF NOT EXISTS neon_auth;
SET search_path TO neon_auth;

CREATE TABLE "user" (
    "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name"           text NOT NULL,
    "email"          text NOT NULL UNIQUE,
    "emailVerified"  boolean NOT NULL DEFAULT false,
    "image"          text,
    "createdAt"      timestamptz NOT NULL DEFAULT now(),
    "updatedAt"      timestamptz NOT NULL DEFAULT now(),
    "role"           text,
    "banned"         boolean,
    "banReason"      text,
    "banExpires"     timestamptz
);

CREATE TABLE "session" (
    "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "expiresAt"              timestamptz NOT NULL,
    "token"                  text NOT NULL UNIQUE,
    "createdAt"              timestamptz NOT NULL DEFAULT now(),
    "updatedAt"              timestamptz NOT NULL,
    "ipAddress"              text,
    "userAgent"              text,
    "userId"                 uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "activeOrganizationId"   text,
    "impersonatedBy"         text
);

CREATE TABLE "account" (
    "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "accountId"               text NOT NULL,
    "providerId"              text NOT NULL,
    "userId"                  uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "accessToken"             text,
    "refreshToken"            text,
    "idToken"                 text,
    "accessTokenExpiresAt"    timestamptz,
    "refreshTokenExpiresAt"   timestamptz,
    "scope"                   text,
    "password"                text,
    "createdAt"               timestamptz NOT NULL DEFAULT now(),
    "updatedAt"               timestamptz NOT NULL
);

CREATE TABLE "verification" (
    "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "identifier"   text NOT NULL,
    "value"        text NOT NULL,
    "expiresAt"    timestamptz NOT NULL,
    "createdAt"    timestamptz NOT NULL DEFAULT now(),
    "updatedAt"    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "organization" (
    "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name"        text NOT NULL,
    "slug"        text NOT NULL UNIQUE,
    "logo"        text,
    "createdAt"   timestamptz NOT NULL,
    "metadata"    text
);

CREATE TABLE "member" (
    "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organizationId"  uuid NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "userId"          uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "role"            text NOT NULL DEFAULT 'member',
    "createdAt"       timestamptz NOT NULL
);

CREATE TABLE "invitation" (
    "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organizationId"  uuid NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "email"           text NOT NULL,
    "role"            text,
    "status"          text NOT NULL DEFAULT 'pending',
    "expiresAt"       timestamptz NOT NULL,
    "createdAt"       timestamptz NOT NULL DEFAULT now(),
    "inviterId"       uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE "jwks" (
    "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "publicKey"    text NOT NULL,
    "privateKey"   text NOT NULL,
    "createdAt"    timestamptz NOT NULL,
    "expiresAt"    timestamptz
);

-- Indexes
CREATE INDEX "session_userId_idx" ON "session"("userId");
CREATE INDEX "account_userId_idx" ON "account"("userId");
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
CREATE INDEX "member_organizationId_idx" ON "member"("organizationId");
CREATE INDEX "member_userId_idx" ON "member"("userId");
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");
CREATE INDEX "invitation_email_idx" ON "invitation"("email");
