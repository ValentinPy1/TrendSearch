-- Update default credits value to 5 for new account creation
ALTER TABLE users ALTER COLUMN credits SET DEFAULT 3;

-- Optional: Give 5 credits to existing users who have 0 credits and haven't paid
-- (Uncomment if you want to retroactively give credits to existing free users)
-- UPDATE users SET credits = 5 WHERE credits = 0 AND has_paid = false;

