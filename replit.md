# Trends Search

## Overview

Trends Search is a dark-themed platform designed to help entrepreneurs validate startup ideas. It leverages AI-powered generation for microSaaS ideas, provides market research insights using real keyword data, and offers interactive trend visualization. The platform aims to assist in identifying high-potential startup opportunities.

## User Preferences

The user prefers to work with iterative development, focusing on one feature or task at a time. The user prefers clear and concise communication. When making significant changes or architectural decisions, please ask for confirmation first. The user values detailed explanations for complex technical implementations but prefers brevity for routine updates.

## System Architecture

The application follows a client-server architecture with a React-based frontend and an Express-based backend, utilizing a Supabase PostgreSQL database.

### UI/UX Decisions
- **Theme:** Dark mode with "deep space black" background (`#0a0a0f`).
- **Color Palette:** Primary purple (hsl(250, 70%, 60%)) for CTAs, secondary blue (hsl(210, 70%, 55%)) for charts and highlights. Gradient orbs in purple, blue, and indigo for background aesthetics.
- **Typography:** Inter font family (400, 500, 600, 700 weights) with responsive sizing (6xl for hero titles, 3xl for metrics).
- **Components:** Glassmorphic cards (`bg-white/5`, `backdrop-blur-xl`, `border-white/10`), dark input fields, and distinct primary/secondary buttons.
- **Visualizations:** Interactive 12-month trend charts using Recharts with gradient styling. Color-coded gradients for metrics (e.g., Opportunity Score: Red → Yellow → Green; Match percentage: Blue gradient).

### Technical Implementations
- **Frontend:** Built with React and Vite, featuring pages for authentication (`auth.tsx`) and the main dashboard (`dashboard.tsx`). Key components include `IdeaGenerator`, `IdeaHistory`, `MetricsCards`, `KeywordsTable`, and `TrendChart`.
- **Backend:** Express.js handles API requests and authentication.
- **Authentication:** Session-based authentication using `express-session` with bcrypt for password hashing.
- **Idea Generation:** AI-powered using GPT-4o-mini, selecting `user_type` and `problem_nature` from `paramV4.json` and guided by `microsaas-principles.txt` to generate ultra-concise microSaaS ideas (5-8 words).
- **Market Validation:** Semantic keyword search using precomputed binary embeddings (sentence-transformers) of 80,157 Google Ads keywords.
- **Opportunity Score:** Calculated per keyword as `log(SAC) × Trend Strength × Bid Efficiency`, where SAC (Seller Advertiser Cost), Trend Strength ((1 + YoY Growth/100) / (1 + Volatility)), and Bid Efficiency (Top Page Bid / CPC) are derived metrics.
- **Data Display:**
    - **Metrics Cards:** 5 cards display weighted averages (by similarityScore) of Opportunity, Trend Strength, Bid Efficiency, TAC, and SAC.
    - **Keywords Table:** Sortable table showing 7 columns: Keyword, Match, Volume, Competition, CPC, YoY Trend, and Opportunity. Includes hover actions (hide, copy, search).
    - **Keyword Metrics:** 5 cards next to trend chart displaying: Opportunity, Trend Strength, Top Page Bid, Bid Efficiency, and TAC.
- **Security:** Passwords hashed with bcrypt, session-based authentication with httpOnly cookies, and server-side user ID derivation. Protected routes use `requireAuth` middleware.

### Database Schema (Supabase PostgreSQL)
- **users:** Stores user authentication details.
- **ideas:** Stores generated and user-provided startup ideas.
- **reports:** Stores market research report summaries linked to ideas.
- **keywords:** Stores detailed keyword metrics and monthly data associated with reports.

## External Dependencies

- **Supabase:** Used for PostgreSQL database hosting and potentially authentication services.
- **Replit AI Integrations:** Provides access to GPT-4o-mini for AI-powered idea generation.
- **Google Ads Dataset:** A pre-existing dataset of 80,157 keywords with metrics, used for market research and trend analysis.
- **Recharts:** Frontend library for interactive data visualization (trend charts).
- **Drizzle ORM:** Used for database interaction with PostgreSQL.
- **bcryptjs:** For password hashing.
- **express-session:** For server-side session management.
- **TailwindCSS, Shadcn UI:** Frontend styling and UI components.
- **jsPDF:** For PDF generation (though not explicitly detailed in functionality, listed in tech stack).