# Row Level Security (RLS) Setup Guide

This guide explains how to enable Row Level Security (RLS) for your Supabase database before deploying to production.

## Overview

The migration file `enable_rls_policies.sql` enables RLS on all tables and creates policies that ensure:
- Users can only access their own data
- Public/shared tables (`global_keywords`, `keyword_embeddings`) are read-only for authenticated users
- Backend service role operations continue to work (bypasses RLS)

## How to Apply

### Option 1: Using Supabase Dashboard (Recommended)

**Important**: If you have large tables (>10k rows), consider running in steps to avoid timeouts.

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the entire contents of `enable_rls_policies.sql`
5. Click **Run** (or press `Ctrl+Enter`)
6. Verify there are no errors

**If you encounter timeouts**, run the migration in steps:
- **Step 1**: Run only the index creation section (lines with `CREATE INDEX`)
- **Step 2**: Run the helper function creation
- **Step 3**: Run RLS enablement and policies table-by-table
- **Step 4**: If `keyword_embeddings` times out (large table ~76k rows), run `enable_rls_keyword_embeddings.sql` separately

### Option 2: Using Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push
# Or apply the migration directly
psql $DATABASE_URL -f migrations/enable_rls_policies.sql
```

## What This Migration Does

### 1. Creates Supporting Indexes (Prevents Timeouts)
- Indexes on all columns used in RLS policy predicates
- Critical for performance with large tables
- Prevents sequential scans during policy evaluation

### 2. Creates Improved Helper Function
- `public.get_user_id()` - Maps Supabase's `auth.uid()` to your local `users.id`
- Uses `SECURITY DEFINER` with safe `search_path` for security
- Uses `(SELECT auth.uid())` wrapper for better query plan stability
- Returns `text` type for consistency
- Grants execute permission only to authenticated users

### 3. Enables RLS on User-Owned Tables
The following tables get RLS enabled with policies for SELECT, INSERT, UPDATE, DELETE:
- All policies include `TO authenticated` clause to limit evaluation scope
- Uses `DROP POLICY IF EXISTS` before creating to allow re-running safely
- Optimized EXISTS queries with table aliases for better performance
- `users` - Users can only view/update their own profile
- `ideas` - Users can only access their own ideas
- `reports` - Users can only access their own reports
- `keywords` - Users can only access keywords from their own reports
- `custom_search_projects` - Users can only access their own projects
- `custom_search_project_keywords` - Users can only access keywords from their own projects
- `pipeline_executions` - Users can only access executions from their own projects
- `feedback` - Users can only access their own feedback

### 4. Enables RLS on Public/Shared Tables
These tables are read-only for authenticated users:
- `global_keywords` - Read-only for authenticated users
- `keyword_embeddings` - Read-only for authenticated users

Only the backend service role can modify these tables.

## Testing After Migration

### 1. Test User Isolation
- Log in as User A and verify you can only see your own data
- Log in as User B and verify you can only see your own data
- Verify User A cannot see User B's data

### 2. Test Backend Operations
- Verify your backend API still works correctly
- The backend uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS
- All existing API endpoints should continue to work

### 3. Test Public Tables
- Verify authenticated users can read `global_keywords`
- Verify authenticated users can read `keyword_embeddings`
- Verify users cannot insert/update/delete these tables

### 4. Test Edge Cases
- Test creating new ideas/reports/projects
- Test updating existing data
- Test deleting data
- Test cascading deletes (e.g., deleting an idea should delete related reports)

## Important Notes

1. **Service Role Key**: Your backend uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS. This is intentional and allows your backend to perform admin operations.

2. **Client-Side Queries**: If you have any client-side Supabase queries (using the anon key), they will now be subject to RLS policies. Make sure all client queries are authenticated.

3. **Migration Order**: Apply this migration after all your table migrations but before deploying to production.

4. **Rollback**: If you need to disable RLS temporarily, you can run:
   ```sql
   ALTER TABLE <table_name> DISABLE ROW LEVEL SECURITY;
   ```
   However, this is NOT recommended for production.

## Troubleshooting

### Issue: "Query read timeout"
This is the most common issue with large tables. The migration is optimized to prevent this, but if you still encounter it:

1. **Run indexes first**: Execute only the `CREATE INDEX` statements first
2. **Wait for indexes to complete**: Large tables may take time to index
3. **Run in smaller batches**: Enable RLS and create policies table-by-table
4. **Check table sizes**: Tables with >100k rows may need more time
5. **keyword_embeddings table**: If this specific table times out (~76k rows), it's been separated into `enable_rls_keyword_embeddings.sql` - run that file separately after the main migration completes

### Issue: "Function get_user_id() does not exist"
- Make sure you ran the entire migration file, including the function creation
- The function is created in Step 2 of the migration

### Issue: "Permission denied for function get_user_id"
- The function should have `GRANT EXECUTE` permission. Re-run the GRANT statement:
  ```sql
  GRANT EXECUTE ON FUNCTION public.get_user_id() TO authenticated;
  ```

### Issue: Users can't see their own data
- Check that the user is authenticated (has a valid JWT token)
- Verify the `users` table has a matching `supabase_user_id` for the authenticated user
- Check Supabase logs for RLS policy violations
- Verify indexes were created successfully (check with `\d+ table_name` in psql)

### Issue: Backend operations fail
- Backend should use `SUPABASE_SERVICE_ROLE_KEY`, not the anon key
- Service role key bypasses RLS, so backend operations should work normally

### Issue: Slow queries after enabling RLS
- Verify all indexes were created: `SELECT indexname FROM pg_indexes WHERE tablename = 'your_table';`
- Check query plans: Use `EXPLAIN ANALYZE` on slow queries
- Ensure policies use indexed columns (they should, based on the migration)

## Security Best Practices

1. **Never expose service role key** in client-side code
2. **Always use authenticated requests** for client-side queries
3. **Test RLS policies** thoroughly before production deployment
4. **Monitor Supabase logs** for RLS policy violations
5. **Review policies periodically** as your app evolves

## Next Steps

After enabling RLS:
1. Test thoroughly in a staging environment
2. Monitor application logs for any RLS-related errors
3. Update your deployment documentation
4. Consider adding RLS policy tests to your test suite

