-- Create feedback table
CREATE TABLE IF NOT EXISTS "feedback" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "feedback_id" varchar,
    "question" text NOT NULL,
    "answer" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" 
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS "feedback_user_id_idx" ON "feedback"("user_id");

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS "feedback_created_at_idx" ON "feedback"("created_at");

