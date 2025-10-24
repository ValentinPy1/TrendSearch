# Production Database Fix

## Issue
Your production database is missing the `password` column that was recently added to the schema. This causes signup to fail with:
```
NeonDbError: column "password" does not exist
```

## Solution

You need to run the migration SQL in your **production database**. Here's how:

### Option 1: Run Migration in Replit Database Console

1. Go to your Replit workspace
2. Click on the **Database** icon in the sidebar
3. Switch to the **Production** database (if you have separate dev/prod databases)
4. Open the SQL console
5. Copy and paste the contents of `migrations/add_password_column.sql`
6. Execute the SQL commands

### Option 2: Automatic Schema Sync

If your development and production databases are the same (single database setup):

1. The development database has already been fixed
2. Simply **re-publish your application**
3. The published app will use the updated database schema

### Option 3: Reset Production Database (if all else fails)

If you don't have important data in production:

1. Delete the production database in Replit
2. Re-publish your application
3. Replit will create a new production database with the correct schema

## Verification

After applying the fix, try signing up in your published app. It should work correctly now!

## What Was Fixed

- Added `password` column (required for authentication)
- Set NOT NULL constraints on `first_name`, `last_name`, and `email`
- Ensured schema matches the application code
