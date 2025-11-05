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

### Stripe Configuration
- `STRIPE_SECRET_KEY` - Your Stripe secret key (test mode: `sk_test_...`)
- `STRIPE_PUBLISHABLE_KEY` - Your Stripe publishable key (test mode: `pk_test_...`)
- `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook signing secret (from Stripe Dashboard)
- `STRIPE_PRICE_ID` - Your Stripe Price ID for the one-time payment product

These can be set in your `.env` file:

```env
# Stripe (for paywall)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

## Getting Your Stripe Credentials

1. Go to your Stripe Dashboard (https://dashboard.stripe.com)
2. Make sure you're in **Test mode** for development
3. Navigate to **Developers > API keys**
4. Copy the following:
   - **Secret key** → `STRIPE_SECRET_KEY` (starts with `sk_test_`)
   - **Publishable key** → `STRIPE_PUBLISHABLE_KEY` (starts with `pk_test_`)
5. Create a product and price:
   - Go to **Products** in Stripe Dashboard
   - Click **Add product**
   - Set it as a **One-time payment**
   - Set your price (e.g., $9.99)
   - Copy the **Price ID** → `STRIPE_PRICE_ID` (starts with `price_`)
6. Set up webhook:
   - Go to **Developers > Webhooks**
   - Click **Add endpoint**
   - Set endpoint URL to: `https://your-domain.com/api/stripe/webhook`
   - Select event: `checkout.session.completed`
   - Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET` (starts with `whsec_`)

### DataForSEO Configuration
- `DATA_FOR_SEO_LOGIN` - Your DataForSEO API login (username)
- `DATA_FOR_SEO_PASSWORD` - Your DataForSEO API password
- `DATA_FOR_SEO_CRED_B64` - Base64-encoded credentials (format: `bG9naW46cGFzc3dvcmQ=` where login:password is base64 encoded)

These can be set in your `.env` file:

```env
# DataForSEO (for keyword metrics)
DATA_FOR_SEO_LOGIN=your_login
DATA_FOR_SEO_PASSWORD=your_password
DATA_FOR_SEO_CRED_B64=your_base64_encoded_credentials
```

## Getting Your DataForSEO Credentials

1. Go to your DataForSEO account (https://dataforseo.com)
2. Navigate to your account settings or API credentials
3. Copy the following:
   - **Login** → `DATA_FOR_SEO_LOGIN`
   - **Password** → `DATA_FOR_SEO_PASSWORD`
4. Generate Base64-encoded credentials:
   - Combine login and password as `login:password`
   - Encode to Base64 (e.g., using `echo -n "login:password" | base64`)
   - Copy the result → `DATA_FOR_SEO_CRED_B64`

## Security Notes

- Never commit the `.env` file to version control
- The `SUPABASE_SERVICE_ROLE_KEY` should only be used on the server side
- The `SUPABASE_ANON_KEY` is safe to expose in client-side code
- The `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` should only be used on the server side
- The `STRIPE_PUBLISHABLE_KEY` can be used in client-side code (but not needed for this implementation)
- The `DATA_FOR_SEO_LOGIN`, `DATA_FOR_SEO_PASSWORD`, and `DATA_FOR_SEO_CRED_B64` should only be used on the server side

