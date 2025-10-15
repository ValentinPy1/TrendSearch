CREATE TABLE "ideas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"original_idea" text,
	"generated_idea" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar NOT NULL,
	"keyword" text NOT NULL,
	"volume" integer,
	"competition" text,
	"cpc" numeric(10, 2),
	"top_page_bid" numeric(10, 2),
	"monthly_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"avg_volume" integer,
	"growth_3m" numeric(10, 2),
	"growth_yoy" numeric(10, 2),
	"competition" text,
	"avg_top_page_bid" numeric(10, 2),
	"avg_cpc" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;