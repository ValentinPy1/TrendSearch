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
- `STRIPE_PREMIUM_20_PRICE_ID` - Your Stripe Price ID for Premium + 20 credits (€9.99)
- `STRIPE_PREMIUM_100_PRICE_ID` - Your Stripe Price ID for Premium + 100 credits (€14.99)
- `STRIPE_CREDITS_40_PRICE_ID` - Your Stripe Price ID for 40 credits (€9.99)
- `STRIPE_CREDITS_100_PRICE_ID` - Your Stripe Price ID for 100 credits (€14.99)

These can be set in your `.env` file:

```env
# Stripe (for paywall)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PREMIUM_20_PRICE_ID=price_...  # Premium + 20 credits (€9.99)
STRIPE_PREMIUM_100_PRICE_ID=price_...  # Premium + 100 credits (€14.99)
STRIPE_CREDITS_40_PRICE_ID=price_...  # 40 credits (€9.99)
STRIPE_CREDITS_100_PRICE_ID=price_...  # 100 credits (€14.99)
```

## Getting Your Stripe Credentials

1. Go to your Stripe Dashboard (https://dashboard.stripe.com)
2. Make sure you're in **Test mode** for development
3. Navigate to **Developers > API keys**
4. Copy the following:
   - **Secret key** → `STRIPE_SECRET_KEY` (starts with `sk_test_`)
   - **Publishable key** → `STRIPE_PUBLISHABLE_KEY` (starts with `pk_test_`)
5. Create products and prices:
   - **Premium + 20 Credits (€9.99)**:
     - Go to **Products** in Stripe Dashboard
     - Click **Add product**
     - Name: "Premium + 20 Credits" or similar
     - Set it as a **One-time payment**
     - Set price to €9.99
     - Make sure the price is **Active**
     - Copy the **Price ID** → `STRIPE_PREMIUM_20_PRICE_ID` (starts with `price_`)
   - **Premium + 100 Credits (€14.99)**:
     - Create another product or add another price
     - Name: "Premium + 100 Credits" or similar
     - Set it as a **One-time payment**
     - Set price to €14.99
     - Make sure the price is **Active**
     - Copy the **Price ID** → `STRIPE_PREMIUM_100_PRICE_ID` (starts with `price_`)
   - **40 Credits (€9.99)**:
     - Create another product or add another price
     - Name: "40 Credits" or similar
     - Set it as a **One-time payment**
     - Set price to €9.99
     - Make sure the price is **Active**
     - Copy the **Price ID** → `STRIPE_CREDITS_40_PRICE_ID` (starts with `price_`)
   - **100 Credits (€14.99)**:
     - Create another product or add another price
     - Name: "100 Credits" or similar
     - Set it as a **One-time payment**
     - Set price to €14.99
     - Make sure the price is **Active**
     - Copy the **Price ID** → `STRIPE_CREDITS_100_PRICE_ID` (starts with `price_`)
   
   **Important:** All prices must be **Active** in Stripe. Inactive prices will cause errors.
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

### Google Custom Search API Configuration (Optional)
- `GOOGLE_SEARCH_API_KEY` - Your Google API key for Custom Search
- `GOOGLE_SEARCH_ENGINE_ID` - Your Custom Search Engine ID (cx parameter)

These are optional. If not configured, the system will fall back to LLM-only competitor discovery.

These can be set in your `.env` file:

```env
# Google Custom Search API (optional, for agentic competitor discovery)
GOOGLE_SEARCH_API_KEY=your_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id
```

## Getting Your Google Custom Search API Credentials

1. Go to Google Cloud Console (https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Custom Search API:
   - Navigate to **APIs & Services > Library**
   - Search for "Custom Search API"
   - Click **Enable**
4. Create API credentials:
   - Navigate to **APIs & Services > Credentials**
   - Click **Create Credentials > API Key**
   - Copy the API key → `GOOGLE_SEARCH_API_KEY`
   - (Optional) Restrict the API key to Custom Search API only for security
5. Create a Custom Search Engine:
   - Go to https://programmablesearchengine.google.com
   - Click **Add** to create a new search engine
   - Set **Sites to search** to "Search the entire web" or specific sites
   - Click **Create**
   - Go to **Setup > Basics** and copy the **Search engine ID** → `GOOGLE_SEARCH_ENGINE_ID`

**Note:** Google Custom Search API has a free tier of 100 queries per day. Beyond that, it's a paid service.

### Supabase MCP Configuration (Optional)

For Cursor AI integration with Supabase, you can configure a Model Context Protocol (MCP) server:

- `SUPABASE_ACCESS_TOKEN` - Your Supabase Personal Access Token (PAT) for MCP authentication

This is optional and only needed if you want Cursor AI to interact directly with your Supabase database.

```env
# Supabase MCP (optional, for Cursor AI integration)
SUPABASE_ACCESS_TOKEN=your_personal_access_token
```

**Note:** See `MCP_SETUP.md` for detailed instructions on setting up the Supabase MCP server.

## Security Notes

- Never commit the `.env` file to version control
- The `SUPABASE_SERVICE_ROLE_KEY` should only be used on the server side
- The `SUPABASE_ANON_KEY` is safe to expose in client-side code
- The `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` should only be used on the server side
- The `STRIPE_PUBLISHABLE_KEY` can be used in client-side code (but not needed for this implementation)
- The `DATA_FOR_SEO_LOGIN`, `DATA_FOR_SEO_PASSWORD`, and `DATA_FOR_SEO_CRED_B64` should only be used on the server side
- The `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID` should only be used on the server side
- The `SUPABASE_ACCESS_TOKEN` is used for MCP authentication and should be kept secure (not committed to version control)

