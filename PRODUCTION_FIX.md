# Production Database Fix - CRITICAL SECURITY UPDATE

## Issue
Your production database is missing the `password` column, causing signup to fail with:
```
NeonDbError: column "password" does not exist
```

## ⚠️ IMPORTANT: Existing Users Will Need to Reset Passwords

The migration includes a **security fix** that affects existing users:
- Existing users will have their passwords set to a placeholder hash
- They will need to use a password reset flow to set a new password
- New signups will work normally

## Solution

### Option 1: Run Migration in Replit Database Console (RECOMMENDED)

1. **Go to your Replit workspace**
2. **Click on the Database icon** in the sidebar
3. **Switch to the Production database** (use the dropdown if you have separate dev/prod)
4. **Open the SQL console**
5. **Copy and paste** the contents of `migrations/add_password_column.sql`
6. **Execute the SQL commands** step by step (or all at once)
7. **Verify** the output shows all columns correctly created

### Option 2: Use Replit's Database GUI

If you prefer a visual approach:

1. Go to **Database** panel in Replit
2. Select **Production** database
3. Click on the **users** table
4. Add the missing columns manually:
   - `password` (text, NOT NULL, no default)
5. Update existing users with the placeholder password hash
6. Remove unused columns (`profile_image_url`, `updated_at`)

### Option 3: Reset Production Database (ONLY if no important data exists)

⚠️ **This will DELETE all existing data!**

1. In Replit, delete the production database
2. Re-publish your application
3. Replit will create a fresh database with the correct schema

## What This Migration Does

### Security Fixes:
1. ✅ Adds `password` column safely (nullable first, then NOT NULL)
2. ✅ Sets existing users to a secure placeholder hash (not blank)
3. ✅ Removes the dangerous empty-string default
4. ✅ Enforces NOT NULL on all required fields

### Schema Cleanup:
5. ✅ Removes legacy columns (`profile_image_url`, `updated_at`)
6. ✅ Sets proper defaults on `created_at`
7. ✅ Brings database schema in sync with application code

## After Running Migration

### Test Signup:
1. Go to your published app
2. Try creating a new account
3. Verify you can sign up successfully
4. Verify you can log in with the new account

### Handle Existing Users:
If you had users before this migration, they will need to:
1. Request a password reset (you'll need to implement this)
2. OR manually set their passwords in the database
3. OR you can notify them to re-register

## Troubleshooting

**If signup still fails:**
- Check the production logs in Replit Console
- Verify all migration steps completed successfully
- Ensure the `password` column exists and is NOT NULL

**If existing users can't log in:**
- This is expected - their passwords were reset
- Implement a password reset flow
- Or manually update their passwords using bcrypt hashes

## Technical Details

### Why was this needed?
1. The `password` column was added to the schema recently
2. Production database had an old schema without it
3. Empty-string defaults would break bcrypt password verification
4. Legacy columns needed cleanup

### Password Placeholder:
- Hash: `$2b$10$dfP7hRujxHyCINVZYTE9kOoA0Ro1ncd6XKIynRalk8JfQv46Qvv8G`
- Represents: `RESET_REQUIRED_123`
- Existing users can log in with this password temporarily
- You should force them to change it immediately

## Schema After Migration

```sql
id              | varchar | NOT NULL | gen_random_uuid()
first_name      | text    | NOT NULL |
last_name       | text    | NOT NULL |
email           | text    | NOT NULL |
created_at      | timestamp | NOT NULL | CURRENT_TIMESTAMP
password        | text    | NOT NULL |
```

This matches the application schema defined in `shared/schema.ts`.
