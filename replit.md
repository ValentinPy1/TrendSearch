# Pioneer Idea Watcher

A dark-themed startup idea validation platform with AI-powered idea generation using GPT-4o-mini, market research insights with real keyword data, and interactive trend visualization.

## Overview

Pioneer Idea Watcher helps entrepreneurs Find and validate their startup ideas using:
- AI-powered idea generation with GPT-4o-mini using paramV4.json data and microSaaS principles
- Market research data with exactly 10 semantically-related keywords (vector similarity search)
- Interactive trend analysis and visualization with gradient-styled metrics
- Real keyword data from Google Ads CSV (80,157 keywords with prebuilt embeddings)

## Architecture

### Frontend (React + Vite)
- **Pages:**
  - `auth.tsx` - Email/password authentication (signup/login)
  - `dashboard.tsx` - Main application interface
  
- **Components:**
  - `idea-generator.tsx` - Idea input and generation interface with gradient blue-purple-white title
  - `idea-history.tsx` - View previously generated ideas
  - `metrics-cards.tsx` - 6 metric cards displaying weighted averages (based on keyword match %) positioned above table
  - `keyword-metrics-cards.tsx` - Individual keyword metrics (displayed below trend chart)
  - `keywords-table.tsx` - Sortable table of 10 keywords with gradient styling
  - `trend-chart.tsx` - Interactive 12-month trend chart with Recharts
  - `glassmorphic-card.tsx` - Reusable card component with glassmorphic design
  - `gradient-orbs.tsx` - Floating gradient background orbs
  - `theme-provider.tsx` - Dark mode theme management

### Backend (Express)
- **Authentication:** Session-based with bcrypt password hashing
- **API Endpoints:**
  - `POST /api/auth/signup` - Create new account
  - `POST /api/auth/login` - User login
  - `GET /api/auth/me` - Get current user session
  - `POST /api/auth/logout` - Logout user
  - `POST /api/generate-idea` - Generate new idea using GPT-4o-mini with paramV4.json
  - `GET /api/ideas` - Get user's idea history
  - `POST /api/generate-report` - Generate market research report

### Database Schema (Supabase PostgreSQL)
- **users:** id, firstName, lastName, email, password, createdAt
- **ideas:** id, userId, originalIdea, generatedIdea, createdAt
- **reports:** id, ideaId, userId, avgVolume, growth3m, growthYoy, competition, avgTopPageBid, avgCpc, createdAt
- **keywords:** id, reportId, keyword, volume, competition, cpc, topPageBid, growth3m, growthYoy, similarityScore, growthSlope, growthR2, growthConsistency, growthStability, sustainedGrowthScore, monthlyData

## Design System

### Color Palette
- **Background:** #0a0a0f (deep space black)
- **Primary:** Purple (hsl(250, 70%, 60%)) - CTAs and active states
- **Secondary:** Blue (hsl(210, 70%, 55%)) - Charts and highlights
- **Gradient Orbs:** Purple, blue, and indigo with low opacity

### Typography
- **Font:** Inter (400, 500, 600, 700)
- **Sizes:** 6xl for hero title, 3xl for metrics, responsive scaling

### Components
- **Glassmorphic Cards:** bg-white/5, backdrop-blur-xl, border-white/10
- **Inputs:** Dark variant with white/5 background
- **Buttons:** Primary (purple), Secondary (blue)

## Features

### 1. Idea Generation
**AI-Powered Generation with GPT-4o-mini:**
- Randomly selects one `user_type` from paramV4.json (48 options: students, freelancers, creators, etc.)
- Randomly selects one `problem_nature` from paramV4.json (47 options: repetitive_tasks, information_overload, etc.)
- Sends ultra-concise prompt to GPT-4o-mini with:
  - Selected user type and problem descriptions
  - Complete microSaaS principles guide (focus, niche, immediate value, etc.)
  - Instruction to generate EXTREMELY CONCISE idea (5-8 words maximum)
  - Format examples: "AI expense tracker for freelancers", "Automated scheduling for trainers"
- GPT-4o-mini generates ultra-concise microSaaS idea (typically 4-8 words)
- User-provided ideas are preserved exactly; blank input triggers AI generation

### 2. Market Validation
**Metrics Cards** (positioned above table):
- 6 cards displaying weighted averages of all 10 keywords
- Each metric weighted by keyword's match percentage (similarityScore)
- Metrics: Avg Volume, Avg Competition, Avg CPC, Avg Top Page Bid, Avg 3M Growth, Avg YoY Growth
- Order matches table column order for consistency

**Keywords Table** displays 8 columns:
1. Keyword - the search term
2. Match - similarity score to the idea (percentage with blue gradient 0-100)
3. Volume - monthly search volume
4. Competition - competition level (0-100 with red gradient)
5. CPC - cost per click (purple gradient based on max value)
6. Top Page Bid - average top-of-page bid (purple gradient based on max value)
7. 3Mo Trend - 3-month growth percentage
8. YoY Trend - year-over-year growth percentage

### 3. Trend Analysis
- Interactive line chart showing 12 months of search volume
- Dropdown to select from the 10 keywords
- Recharts library with gradient styling


## Current Implementation Status

- ✅ Authentication (email/password with bcrypt)
- ✅ Database persistence (Supabase PostgreSQL via Drizzle ORM)
- ✅ Session management (express-session with userId tracking)
- ✅ AI-powered idea generation with GPT-4o-mini using paramV4.json + microSaaS principles
- ✅ Vector database with prebuilt embeddings (instant keyword matching)
- ✅ Semantic keyword search using sentence-transformers
- ✅ Interactive dashboard with metrics
- ✅ Keywords table with 8 columns with gradient styling
- ✅ Sortable table columns (click headers to sort)
- ✅ Blue gradient for Match percentage (0-100)
- ✅ Red gradient for Competition (0-100)
- ✅ Purple gradient for CPC and Top Page Bid (scaled to max value)
- ✅ Fixed keyword count (always 10 keywords)
- ✅ Trend chart visualization
- ✅ Dark theme with gradient orbs
- ✅ Glassmorphic UI design
- ✅ Real LLM integration (GPT-4o-mini via Replit AI Integrations)
- ✅ Real keyword data (80,157 keywords from Google Ads dataset with binary embeddings)

## Environment Variables

Required:
- `DATABASE_URL` - Supabase PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key
- `AI_INTEGRATIONS_OPENAI_API_KEY` - Replit AI Integrations API key (auto-configured)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - Replit AI Integrations base URL (auto-configured)

## Tech Stack

- **Frontend:** React, Vite, TailwindCSS, Shadcn UI, Recharts, jsPDF
- **Backend:** Express, bcryptjs, express-session
- **Database:** Supabase (PostgreSQL via Drizzle ORM)
- **Deployment:** Replit

## User Journey

1. User signs up with first name, last name, email, and password (or logs in with email/password)
2. User enters an existing idea or leaves blank for AI generation
3. Click "Generate Idea" - GPT-4o-mini generates focused microSaaS idea
4. Click "Generate Report" - Vector database returns 10 semantically-related keywords with real data
5. View 6 metric cards and interactive 12-month trend chart
6. Select keywords from table to view their trends
7. Click "History" to view all previous ideas and reports

## Development Notes

### Vector Database (Binary Chunk Embeddings)
The app uses binary chunk embeddings for efficient keyword search with the complete 80k keyword dataset:

**Architecture:**
- **80,157 keywords:** Complete Google Ads dataset with precomputed binary embeddings loaded at startup (~118MB)
- All keywords from the original dataset are available for semantic search
- Binary chunk format enables fast loading and efficient memory usage

**Files:**
- `data/keywords_all.csv` - 80,157 real Google Ads keywords with metrics (20MB)
- `data/embeddings_chunks/` - 11 binary chunk files (~12MB each for first 10, 241KB for last, Float32 format)
- `data/embeddings_metadata.json` - Keyword index and chunk metadata
- `server/keyword-vector-service.ts` - Loads binary chunks for semantic search

**How It Works:**
1. **Embeddings Generation:** Precomputed using Python with sentence-transformers
   - Uses 'all-MiniLM-L6-v2' model (same as runtime query encoder)
   - Generates 384-dimensional embeddings for each keyword
   - Splits into 8k-keyword chunks (11 chunks total)
   - Saves as Float32Array binary files (much faster to load than JSON)

2. **Runtime:** KeywordVectorService loads binary chunks (~3-4 seconds)
   - Loads all 80k keyword embeddings into memory (118MB)
   - Initializes sentence transformer for query encoding
   - Finds top 10 semantically similar keywords using cosine similarity
   - Includes sanity checks for CSV/metadata consistency

**Performance:**
- Cold-start: ~3-4 seconds (loads 118MB binary chunks)
- Subsequent reports: Instant (embeddings cached in memory)
- Memory usage: ~130MB (efficient binary format)
- Coverage: 100% of Google Ads keywords (complete dataset)

**Dataset:**
The embeddings were pre-generated externally using Python. If you need to regenerate them:
1. Use Python with sentence-transformers library
2. Generate embeddings for all keywords using 'all-MiniLM-L6-v2'
3. Split into 8k-keyword chunks and save as Float32Array binary files
4. Update metadata.json with chunk information

### Database Connection
- Uses Neon serverless PostgreSQL with WebSocket connection
- In development, `NODE_TLS_REJECT_UNAUTHORIZED=0` is set in `server/index.ts` to accept self-signed certificates
- This allows the WebSocket connection to work with Replit's SSL proxy
- Production uses strict TLS certificate validation

### Security
- User passwords are hashed with bcrypt (10 salt rounds)
- Session-based authentication with httpOnly cookies
- UserId is derived from server-side session (never from client payload)
- All protected routes use `requireAuth` middleware

### AI Idea Generation (GPT-4o-mini)
The app uses GPT-4o-mini via Replit AI Integrations to generate microSaaS ideas:

**Files:**
- `data/paramV4.json` - 48 user types and 47 problem natures
- `data/microsaas-principles.txt` - MicroSaaS best practices guide
- `server/microsaas-idea-generator.ts` - AI idea generation service

**How It Works:**
1. User leaves input blank and clicks "Generate Idea"
2. System randomly selects one `user_type` and one `problem_nature` from paramV4.json
3. Constructs ultra-concise prompt with:
   - User type description (e.g., "freelancers: designers, developers, writers...")
   - Problem description (e.g., "Repetitive tasks")
   - Complete microSaaS principles (focus, niche, immediate value, etc.)
   - Explicit instruction to generate 5-8 word ideas with examples
4. Calls GPT-4o-mini via Replit AI Integrations (no API key needed, billed to credits)
5. Receives ultra-concise microSaaS idea (typically 4-8 words)
6. Saves to database and returns to frontend

**Model Choice:**
- Initially attempted `gpt-5-nano` but it's a reasoning model that returns empty content
- Switched to `gpt-4o-mini` which is a standard completion model
- Uses standard OpenAI parameters: `max_tokens: 50`, `temperature: 0.9`
- Prompt heavily optimized for extreme conciseness

**Example Generated Ideas:**
- "Storytelling coach for international students" (5 words)
- "AI expense tracker for freelancers" (5 words)
- "Automated scheduling for trainers" (4 words)
- "Content calendar for creators" (4 words)

## Next Steps

1. ~~Integrate real LLM API (OpenAI/Anthropic) for idea formulation~~ ✅ Complete
2. ~~Connect Google Ads API for real market data~~ ✅ Using real keyword CSV data
3. Add idea refinement and comparison features
4. Implement advanced filtering in history view
5. Add batch idea generation and A/B comparison
