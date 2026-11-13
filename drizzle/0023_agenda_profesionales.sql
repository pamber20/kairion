CREATE TABLE "professional" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"specialty" text,
	"email" text,
	"phone" text,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"weekly_hours" jsonb,
	"slot_minutes" integer,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "booking_org_active_slot_uq";--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "professional_id" text;--> statement-breakpoint
ALTER TABLE "offered_slot" ADD COLUMN "professional_id" text;--> statement-breakpoint
ALTER TABLE "professional" ADD CONSTRAINT "professional_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional" ADD CONSTRAINT "professional_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professional_org_idx" ON "professional" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "professional_org_active_idx" ON "professional" USING btree ("organization_id","is_active");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_professional_id_professional_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professional"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_org_prof_idx" ON "booking" USING btree ("organization_id","professional_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_org_general_active_slot_uq" ON "booking" USING btree ("organization_id","scheduled_at") WHERE "booking"."status" in ('agendada','realizada') and "booking"."is_test" = false and "booking"."professional_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_org_active_slot_uq" ON "booking" USING btree ("organization_id","professional_id","scheduled_at") WHERE "booking"."status" in ('agendada','realizada') and "booking"."is_test" = false and "booking"."professional_id" is not null;