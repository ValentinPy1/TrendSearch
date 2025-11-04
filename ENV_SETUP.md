# Environment Variables Setup

This project requires the following environment variables to be set:

## Required Environment Variables

### Supabase Configuration
- `SUPABASE_URL` - Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
- `SUPABASE_ANON_KEY` - Your Supabase anonymous/public key (starts with `eyJ...`)
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (starts with `eyJ...`)

### Database Configuration
- `DATABASE_URL` - PostgreSQL connection string from Supabase (format: `postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres`)

## Frontend Environment Variables

For the client-side Supabase client, you need to set these in your Vite environment:

- `VITE_SUPABASE_URL` - Same as `SUPABASE_URL` above
- `VITE_SUPABASE_ANON_KEY` - Same as `SUPABASE_ANON_KEY` above

These can be set in a `.env` file in the root directory:

```env
# Backend
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres

# Frontend (Vite)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## Getting Your Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Copy the following:
   - **Project URL** → `SUPABASE_URL`
   - **anon/public key** → `SUPABASE_ANON_KEY` and `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)
4. Navigate to Settings > Database
5. Copy the **Connection string** → `DATABASE_URL`

## Security Notes

- Never commit the `.env` file to version control
- The `SUPABASE_SERVICE_ROLE_KEY` should only be used on the server side
- The `SUPABASE_ANON_KEY` is safe to expose in client-side code

