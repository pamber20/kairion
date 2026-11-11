CREATE TABLE "clinical_procedure_guide" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"procedure_name" text NOT NULL,
	"description" text,
	"pre_op_tips" text,
	"post_op_tips" text,
	"recall_months" integer DEFAULT 6 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_reactivation_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"last_procedure_name" text,
	"days_inactive" integer NOT NULL,
	"message_sent" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "procedure_name" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "specialist_name" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "dental_chair" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "patient_confirmation" text DEFAULT 'unconfirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "pre_op_tips_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "location_tips_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "post_op_tips_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "review_score" integer;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "review_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "identification_number" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "medical_alerts" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "last_procedure_type" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "last_procedure_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "preferred_specialist" text;--> statement-breakpoint
ALTER TABLE "clinical_procedure_guide" ADD CONSTRAINT "clinical_procedure_guide_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_reactivation_log" ADD CONSTRAINT "patient_reactivation_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_reactivation_log" ADD CONSTRAINT "patient_reactivation_log_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clinical_procedure_org_idx" ON "clinical_procedure_guide" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_procedure_org_name_uq" ON "clinical_procedure_guide" USING btree ("organization_id","procedure_name");--> statement-breakpoint
CREATE INDEX "reactivation_log_org_contact_idx" ON "patient_reactivation_log" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "reactivation_log_sent_at_idx" ON "patient_reactivation_log" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "contact_org_last_procedure_idx" ON "contact" USING btree ("organization_id","last_procedure_at");