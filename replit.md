# Pioneer Idea Finder

A dark-themed startup idea validation platform with AI-powered idea generation, market research insights, and PDF report export capabilities.

## Overview

Pioneer Idea Finder helps entrepreneurs validate their startup ideas using:
- AI-powered idea generation with the "Stupidity Mixer" + LLM Formulator pipeline
- Market research data with 10 related keywords (fixed count)
- Interactive trend analysis and visualization
- PDF export for comprehensive reports

## Architecture

### Frontend (React + Vite)
- **Pages:**
  - `auth.tsx` - Email/password authentication (signup/login)
  - `dashboard.tsx` - Main application interface
  
- **Components:**
  - `idea-generator.tsx` - Idea input and generation interface
  - `idea-history.tsx` - View previously generated ideas
  - `metrics-cards.tsx` - 6 metric cards displaying market data
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
  - `POST /api/generate-idea` - Generate new idea using Stupidity Mixer
  - `GET /api/ideas` - Get user's idea history
  - `POST /api/generate-report` - Generate market research report

### Database Schema (Supabase PostgreSQL)
- **users:** id, email, password, createdAt
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
The Stupidity Mixer randomly combines:
- Persona (e.g., "Busy professionals")
- Problem (e.g., "who can't track expenses")
- Delivery Type (e.g., "AI-powered")
- App Inspiration (e.g., "marketplace")

Generates 5 candidate ideas, then LLM Formulator selects the best one.

### 2. Market Validation
Generates report with:
- Volume (monthly searches)
- 3-Month Growth (%)
- Year-over-Year Growth (%)
- Competition (0-100 scale)
- Average Top-of-Page Bid ($)
- CPC - Cost Per Click ($)
- Growth Score (sustained growth quality metric)

**Keywords Table** displays 9 columns:
1. Keyword - the search term
2. Match - similarity score to the idea (percentage)
3. Volume - monthly search volume
4. Competition - competition level (0-100)
5. CPC - cost per click
6. Top Page Bid - average top-of-page bid
7. 3Mo Trend - 3-month growth percentage
8. YoY Trend - year-over-year growth percentage
9. **Growth Score** - sustained growth quality (composite metric from slope, R², consistency, stability)

### 3. Trend Analysis
- Interactive line chart showing 12 months of search volume
- Dropdown to select from the 10 keywords
- Recharts library with gradient styling

### 4. PDF Export
- jsPDF generates downloadable reports
- Includes gradient header, metrics, and keyword table

## Current Implementation Status

- ✅ Authentication (email/password with bcrypt)
- ✅ Database persistence (Supabase PostgreSQL via Drizzle ORM)
- ✅ Session management (express-session with userId tracking)
- ✅ Idea generation with Stupidity Mixer algorithm
- ✅ Vector database with prebuilt embeddings (instant keyword matching)
- ✅ Semantic keyword search using sentence-transformers
- ✅ Interactive dashboard with metrics
- ✅ Keywords table with 9 columns including Growth Score
- ✅ Sortable table columns (click headers to sort)
- ✅ Fixed keyword count (always 10 keywords)
- ✅ Trend chart visualization  
- ✅ PDF export functionality
- ✅ Dark theme with gradient orbs
- ✅ Glassmorphic UI design
- ⏳ Real LLM integration (currently mocked)
- ⏳ Real Google Ads API integration (using real keyword data from CSV)

## Environment Variables

Required:
- `DATABASE_URL` - Supabase PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key

## Tech Stack

- **Frontend:** React, Vite, TailwindCSS, Shadcn UI, Recharts, jsPDF
- **Backend:** Express, bcryptjs, express-session
- **Database:** Supabase (PostgreSQL via Drizzle ORM)
- **Deployment:** Replit

## User Journey

1. User signs up/logs in with email/password
2. User enters an existing idea or leaves blank for AI generation
3. Click "Generate Idea" - Stupidity Mixer creates 5 candidates, LLM picks best
4. Click "Generate Report" - Mock Google Ads API returns market data
5. View 6 metric cards and interactive 12-month trend chart
6. Select keywords from dropdown to analyze different terms
7. Click "Export PDF" to download full report
8. Click "History" to view all previous ideas and reports

## Development Notes

### Vector Database (Prebuilt Embeddings)
The app uses a prebuilt vector database for instant keyword matching:

**Files:**
- `data/keywords_data.csv` - 6,443 real Google Ads keywords with metrics
- `data/embeddings.json` - Prebuilt vector embeddings (54 MB, generated once)
- `scripts/prebuild-embeddings.ts` - Script to regenerate embeddings
- `server/keyword-vector-service.ts` - Loads prebuilt embeddings for semantic search

**How It Works:**
1. **Build Time:** Run `npx tsx scripts/prebuild-embeddings.ts` to generate embeddings
   - Loads 6,443 keywords from CSV
   - Generates 384-dimensional embeddings using sentence-transformers/all-MiniLM-L6-v2
   - Saves to `data/embeddings.json` (takes 30-60 seconds)
2. **Runtime:** KeywordVectorService loads prebuilt embeddings (~2 seconds)
   - No cold-start delay for first report generation
   - Only initializes model for query encoding
   - Finds top 10 semantically similar keywords using cosine similarity

**Performance:**
- Cold-start: ~2 seconds (down from 30-60s with runtime generation)
- Subsequent reports: Instant (embeddings cached in memory)

**Updating Keywords:**
If `keywords_data.csv` is updated, regenerate embeddings:
```bash
npx tsx scripts/prebuild-embeddings.ts
```

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

## Next Steps

1. Integrate real LLM API (OpenAI/Anthropic) for idea formulation
2. Connect Google Ads API for real market data
3. Add idea refinement and comparison features
4. Implement advanced filtering in history view
5. Add batch idea generation and A/B comparison
