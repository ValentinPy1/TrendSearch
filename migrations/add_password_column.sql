-- Migration: Add password column to users table (SAFE VERSION)
-- This migration safely adds the password column and handles existing users
-- Run this in your production database console

-- Step 1: Add password column as NULLABLE first (no default)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password text;

-- Step 2: Generate a valid bcrypt placeholder hash for existing users
-- This hash represents 'RESET_REQUIRED_123' - existing users will need to reset their password
UPDATE users 
SET password = '$2b$10$dfP7hRujxHyCINVZYTE9kOoA0Ro1ncd6XKIynRalk8JfQv46Qvv8G'
WHERE password IS NULL OR password = '';

-- Step 3: Now make password NOT NULL (safe since all rows have a value)
ALTER TABLE users ALTER COLUMN password SET NOT NULL;

-- Step 4: Ensure no default exists (forces explicit password in application)
ALTER TABLE users ALTER COLUMN password DROP DEFAULT;

-- Step 5: Set other required columns to NOT NULL
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

-- Step 6: Remove legacy columns that are no longer in the schema
ALTER TABLE users DROP COLUMN IF EXISTS profile_image_url;
ALTER TABLE users DROP COLUMN IF EXISTS updated_at;

-- Step 7: Verify the final schema
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- Expected output:
-- id              | character varying | NO  | gen_random_uuid()
-- first_name      | text             | NO  | 
-- last_name       | text             | NO  | 
-- email           | text             | NO  | 
-- created_at      | timestamp        | NO  | CURRENT_TIMESTAMP
-- password        | text             | NO  | 
