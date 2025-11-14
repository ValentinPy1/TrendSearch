-- Add credits column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;

-- Set initial credits: 20 for users with has_paid = true, 0 for others
UPDATE users SET credits = 20 WHERE has_paid = true;
UPDATE users SET credits = 0 WHERE has_paid = false OR credits IS NULL;

