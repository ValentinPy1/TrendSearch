-- Migration: Add password column to users table
-- Run this in your production database console

-- Add password column (required for authentication)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password text NOT NULL DEFAULT '';

-- Set NOT NULL constraints on required fields
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;
