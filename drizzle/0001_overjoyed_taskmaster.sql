CREATE TABLE "task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"number" integer NOT NULL,
	"state" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"pr_id" integer NOT NULL,
	"repo_full_name" text NOT NULL,
	"previous_task_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_links_pr_task_unique" UNIQUE("pr_id","task_id")
);
--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_links_task_id_idx" ON "task_links" USING btree ("task_id");
