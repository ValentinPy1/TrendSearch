# Architecture Documentation

This document provides an overview of the TrendSearch project structure, architecture, and key components.

## Project Structure

```
TrendSearch/
├── client/                    # React frontend application
│   ├── src/
│   │   ├── components/       # React UI components
│   │   │   ├── ui/           # Shadcn UI components
│   │   │   ├── idea-generator.tsx
│   │   │   ├── idea-history.tsx
│   │   │   ├── keywords-table.tsx
│   │   │   ├── metrics-cards.tsx
│   │   │   ├── trend-chart.tsx
│   │   │   └── ...
│   │   ├── pages/            # Page components
│   │   │   ├── auth.tsx      # Authentication page
│   │   │   ├── dashboard.tsx # Main dashboard
│   │   │   ├── landing.tsx   # Landing page
│   │   │   └── ...
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # Utilities and configurations
│   │   │   ├── queryClient.ts
│   │   │   ├── supabase.ts
│   │   │   └── ...
│   │   ├── App.tsx           # Root component
│   │   └── main.tsx          # Entry point
│   ├── public/               # Static assets
│   └── index.html            # HTML template
│
├── server/                   # Express backend
│   ├── index.ts              # Server entry point
│   ├── routes.ts             # API route definitions
│   ├── keyword-vector-service.ts  # Vector search service
│   ├── microsaas-idea-generator.ts  # AI idea generation
│   ├── opportunity-score.ts  # Opportunity score calculation
│   ├── search-service.ts     # Google search integration
│   ├── stripe.ts             # Stripe payment integration
│   ├── supabase.ts           # Supabase client
│   ├── db.ts                 # Database connection
│   ├── config/               # Configuration files
│   ├── types/                # TypeScript type definitions
│   ├── utils/                # Utility functions
│   └── ...
│
├── shared/                   # Shared code between client and server
│   └── schema.ts             # Drizzle ORM database schemas
│
├── scripts/                  # Utility scripts
│   ├── database/             # Database migration scripts
│   │   ├── migrate-embeddings-to-supabase.ts
│   │   ├── migrate-keywords.ts
│   │   ├── run-project-indexes-migration.ts
│   │   ├── analyze-tables.ts
│   │   └── check-query-plan.ts
│   ├── data/                 # Data processing scripts
│   │   ├── build-binary-embeddings.ts
│   │   ├── build-keyword-embeddings.ts
│   │   ├── prebuild-embeddings.ts
│   │   ├── preprocess-keywords.ts
│   │   └── ...
│   ├── deployment/           # Deployment scripts
│   │   ├── upload-to-railway.ts
│   │   ├── copy-data-files.js
│   │   └── run-migration.sh
│   ├── utils/                # Utility scripts
│   │   ├── audit-compute-metrics.ts
│   │   ├── list-projects.ts
│   │   └── ...
│   └── metrics/              # Metrics aggregation
│       ├── aggregate-sector-metrics.ts
│       └── create-minimal-sectors-metrics.ts
│
├── migrations/               # Database migration files (SQL)
│   ├── *.sql                 # Migration SQL files
│   └── meta/                 # Migration metadata
│
├── data/                     # Static data files
│   ├── keywords.json         # Keyword data
│   ├── sectors.json          # Sector definitions
│   ├── paramV4.json          # Idea generation parameters
│   └── ...
│
├── docs/                     # Documentation
│   ├── images/               # Screenshots
│   ├── ARCHITECTURE.md       # This file
│   ├── ENV_SETUP.md          # Environment setup guide
│   ├── RAILWAY_DEPLOYMENT.md # Deployment guide
│   └── ...
│
└── notebooks/                # Jupyter notebooks for analysis
    ├── analytics.ipynb
    ├── dataforseo.ipynb
    └── idea_review.ipynb
```

## System Architecture

### Client-Server Architecture

The application follows a traditional client-server architecture:

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Browser   │ ◄────► │   Express   │ ◄────► │  Supabase   │
│   (React)   │  HTTP   │   Server    │  SQL    │  PostgreSQL  │
└─────────────┘         └─────────────┘         └─────────────┘
                              │
                              │ API Calls
                              ▼
                        ┌─────────────┐
                        │   OpenAI    │
                        │   Stripe    │
                        │ DataForSEO  │
                        └─────────────┘
```

### Frontend Architecture

**Technology Stack:**
- **React 18.3** - UI framework with hooks
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Wouter** - Lightweight routing
- **TanStack Query** - Server state management
- **TailwindCSS** - Utility-first CSS
- **Shadcn UI** - Component library
- **Recharts** - Data visualization

**Key Components:**
- `App.tsx` - Root component with routing and providers
- `pages/dashboard.tsx` - Main application dashboard
- `pages/auth.tsx` - Authentication interface
- `pages/landing.tsx` - Public landing page
- `components/idea-generator.tsx` - AI idea generation UI
- `components/keywords-table.tsx` - Keyword data table
- `components/trend-chart.tsx` - Trend visualization

**State Management:**
- React hooks for local state
- TanStack Query for server state and caching
- Session storage for authentication

### Backend Architecture

**Technology Stack:**
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **Drizzle ORM** - Database abstraction
- **Passport.js** - Authentication middleware
- **bcryptjs** - Password hashing
- **express-session** - Session management

**Key Services:**
- `keyword-vector-service.ts` - Vector search for semantic keyword matching
- `microsaas-idea-generator.ts` - AI-powered idea generation using OpenAI
- `opportunity-score.ts` - Calculates opportunity scores for keywords
- `search-service.ts` - Google Custom Search integration
- `stripe.ts` - Payment processing

**API Routes:**
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User authentication
- `POST /api/auth/logout` - User logout
- `POST /api/generate-idea` - Generate AI ideas
- `POST /api/generate-report` - Generate market research reports
- `GET /api/ideas` - Get user's ideas
- `GET /api/reports/:id` - Get report details
- `POST /api/stripe/webhook` - Stripe webhook handler
- `GET /api/health` - Health check endpoint

### Database Schema

**Main Tables:**
- `users` - User accounts and authentication
- `ideas` - Generated and user-provided startup ideas
- `reports` - Market research report summaries
- `keywords` - Keyword metrics and monthly data
- `custom_search_projects` - Custom search project definitions
- `custom_search_project_keywords` - Keywords associated with projects
- `keyword_embeddings` - Vector embeddings for semantic search
- `feedback` - User feedback submissions

**Relationships:**
- Users → Ideas (one-to-many)
- Ideas → Reports (one-to-many)
- Reports → Keywords (one-to-many)
- CustomSearchProjects → CustomSearchProjectKeywords (one-to-many)

See `shared/schema.ts` for complete schema definitions.

## Data Flow

### Idea Generation Flow

```
User Input → Frontend → POST /api/generate-idea
                          ↓
                    OpenAI API (GPT-4o-mini)
                          ↓
                    Save to Database
                          ↓
                    Return to Frontend
                          ↓
                    Display in UI
```

### Report Generation Flow

```
User Selects Idea → POST /api/generate-report
                          ↓
                    Keyword Vector Search
                    (Semantic Matching)
                          ↓
                    Fetch Keyword Metrics
                    (DataForSEO API)
                          ↓
                    Calculate Opportunity Scores
                          ↓
                    Aggregate Metrics
                          ↓
                    Save to Database
                          ↓
                    Return Report Data
                          ↓
                    Display Charts & Tables
```

### Authentication Flow

```
User Credentials → POST /api/auth/login
                          ↓
                    Verify with Database
                          ↓
                    Hash Password (bcrypt)
                          ↓
                    Create Session
                          ↓
                    Set HttpOnly Cookie
                          ↓
                    Return User Data
```

## Key Technologies

### Vector Search
- Uses `@xenova/transformers` for sentence embeddings
- Precomputed binary embeddings for 80,157 keywords
- Cosine similarity for semantic matching
- Efficient in-memory search with binary format

### AI Integration
- **OpenAI GPT-4o-mini** for idea generation
- Guided by microSaaS principles and parameter files
- Generates concise 5-8 word ideas

### Payment Processing
- **Stripe** integration for premium features
- Webhook handling for payment events
- Credit-based system for report generation

### Data Sources
- **Google Ads Keyword Data** - 80,157 keywords with metrics
- **DataForSEO API** - Real-time keyword metrics
- **Google Custom Search** - Competitor discovery

## Security

- **Password Hashing**: bcrypt with salt rounds
- **Session Management**: HttpOnly cookies, server-side sessions
- **Authentication**: Passport.js with local strategy
- **Protected Routes**: Middleware-based route protection
- **Environment Variables**: Sensitive data in `.env` (not committed)

## Performance Optimizations

- **Vector Search**: Binary embeddings for fast in-memory search
- **Database Indexing**: Indexes on frequently queried columns
- **Caching**: TanStack Query for API response caching
- **Lazy Loading**: Components loaded on demand
- **Code Splitting**: Vite automatic code splitting
- **Background Initialization**: KeywordVectorService loads in background

## Deployment

### Development
- Vite dev server with HMR (Hot Module Replacement)
- Express server on port 5000
- Direct database connection to Supabase

### Production
- Built with `npm run build`
- Static files served by Express
- Railway deployment with persistent volumes
- Environment variables from Railway dashboard

See [Railway Deployment Guide](RAILWAY_DEPLOYMENT.md) for details.

## Development Workflow

1. **Local Development**
   ```bash
   npm run dev  # Starts both frontend and backend
   ```

2. **Database Changes**
   ```bash
   npm run db:push  # Push schema changes to database
   ```

3. **Type Checking**
   ```bash
   npm run check  # TypeScript type checking
   ```

4. **Production Build**
   ```bash
   npm run build  # Build for production
   npm start      # Start production server
   ```

## Future Improvements

- [ ] Add unit and integration tests
- [ ] Implement Redis caching for frequently accessed data
- [ ] Add rate limiting for API endpoints
- [ ] Implement WebSocket for real-time updates
- [ ] Add comprehensive error tracking (Sentry)
- [ ] Optimize vector search with approximate nearest neighbor algorithms
- [ ] Add support for multiple languages
- [ ] Implement advanced filtering and search capabilities

