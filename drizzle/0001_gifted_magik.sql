CREATE TABLE "team_invite_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"default_role" text DEFAULT 'member' NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invite_code_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "team_invite_code_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "team_invite_code" ADD CONSTRAINT "team_invite_code_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "neon_auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invite_code" ADD CONSTRAINT "team_invite_code_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "neon_auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_invite_code_code_idx" ON "team_invite_code" USING btree ("code");