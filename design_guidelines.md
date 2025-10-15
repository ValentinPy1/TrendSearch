# Design Guidelines: Pioneer Idea Finder

## Design Approach
**Hybrid Approach**: Material Design principles for data visualization and form patterns, combined with modern glassmorphic aesthetics inspired by Linear and Notion for a sophisticated startup tool experience.

**Key Design Principles:**
- Data clarity over decoration
- Progressive disclosure of complexity
- Trust-building through professional polish
- Efficient task completion

---

## Core Design Elements

### A. Color Palette

**Dark Mode Foundation:**
- Background: `#0a0a0f` (deep space black)
- Surface: `220 13% 15%` (elevated dark surfaces)
- Border: `220 13% 25%` (subtle separation)

**Brand Colors:**
- Primary: `250 70% 60%` (vibrant purple - CTAs, active states)
- Primary Hover: `250 70% 55%`
- Secondary: `210 70% 55%` (accent blue - charts, highlights)

**Gradient Orbs** (floating background elements):
- Purple orb: `radial-gradient(circle, hsl(270 80% 50% / 0.15), transparent 70%)`
- Blue orb: `radial-gradient(circle, hsl(220 80% 55% / 0.12), transparent 70%)`
- Indigo orb: `radial-gradient(circle, hsl(240 75% 55% / 0.1), transparent 70%)`
- Position: Absolute, large (500-800px), strategic placement (top-right, bottom-left, center)

**Semantic Colors:**
- Success: `142 70% 50%` (green - growth metrics)
- Warning: `38 92% 50%` (amber - medium competition)
- Danger: `0 84% 60%` (red - high competition)
- Neutral Text: `220 15% 85%` (primary text)
- Muted Text: `220 10% 60%` (secondary text)

### B. Typography

**Font Family:** Inter (Google Fonts CDN)
- Weights: 400 (Regular), 500 (Medium), 600 (Semi-bold), 700 (Bold)

**Type Scale:**
- Hero Title: `text-6xl font-bold` (Idea Finder branding)
- Page Heading: `text-4xl font-bold`
- Section Heading: `text-2xl font-semibold`
- Card Title: `text-xl font-semibold`
- Body: `text-base font-normal`
- Caption: `text-sm font-medium`
- Metric Value: `text-3xl font-bold` (dashboard numbers)

**Line Height:** Tight for headings (1.1), relaxed for body (1.6)

### C. Layout System

**Spacing Primitives:** Tailwind units of `2, 4, 6, 8, 12, 16, 20, 24, 32`
- Common pattern: `p-6` for card padding, `gap-4` for grids, `space-y-8` for vertical sections

**Container Strategy:**
- Max width: `max-w-7xl mx-auto` for main content
- Dashboard grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Metric cards: 6 cards in `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` layout

**Responsive Breakpoints:**
- Mobile: Full-width stacked (default)
- Tablet: `md:` 2-column layouts
- Desktop: `lg:` 3+ column grids for metrics

### D. Component Library

**Glassmorphic Cards:**
- Background: `bg-white/5` with `backdrop-blur-xl`
- Border: `border border-white/10`
- Rounded: `rounded-2xl`
- Shadow: `shadow-2xl shadow-black/20`
- Padding: `p-6` or `p-8` for larger cards

**Input Fields:**
- Dark variant: `bg-white/5 border-white/10 text-white placeholder:text-white/40`
- Focus state: `focus:border-primary focus:ring-2 focus:ring-primary/20`
- Rounded: `rounded-lg`
- Height: `h-12` for standard inputs

**Buttons:**
- Primary: `bg-primary hover:bg-primary-hover text-white font-medium px-6 py-3 rounded-lg`
- Secondary: `bg-white/10 hover:bg-white/15 text-white border border-white/20`
- Icon buttons: `w-10 h-10 rounded-full` with icon centered

**Chart Components:**
- Line chart: Recharts library with purple/blue gradient fill
- Grid lines: `stroke-white/10`
- Tooltip: Dark glassmorphic with `backdrop-blur-lg`
- Legend: Bottom placement, horizontal layout

**Data Display:**
- Metric cards: Large number on top, label below, growth indicator (arrow + percentage)
- Keyword table: Zebra striping with `even:bg-white/5`, sticky header
- Dropdown selector: Dark variant matching input style

### E. Animations

**Subtle Motion Only:**
- Card hover: `transition-all duration-200 hover:scale-[1.02]`
- Button interactions: `transition-colors duration-150`
- Chart entry: Fade in with `300ms` delay
- Loading states: Spinning indicator with `animate-spin`

**Avoid:** Page transitions, scroll-triggered animations, complex sequences

---

## Images

**Hero Section:**
- Large hero image: YES - Abstract data visualization or startup workspace scene
- Style: Dark, moody, with purple/blue color grading
- Placement: Full-width behind hero text with gradient overlay (`bg-gradient-to-b from-transparent to-[#0a0a0f]`)
- Dimensions: `h-[60vh] object-cover`

**Dashboard Icons:**
- Use Heroicons (outline style) for metric cards and navigation
- Size: `w-6 h-6` for inline icons, `w-8 h-8` for featured icons
- Color: `text-primary` or `text-white/60`

---

## Layout Specifications

**Authentication Pages:**
- Centered card: `max-w-md mx-auto mt-20`
- Form fields stacked with `space-y-4`
- Logo/title at top, social proof subtitle

**Main Dashboard:**
- Top navigation: Logo left, user menu right, `h-16` height
- Idea input: Full-width with inline buttons, `max-w-4xl mx-auto`
- Metrics grid: 6 cards across (responsive), below input
- Chart section: Full-width card, `h-96` chart height
- History sidebar: `w-80` fixed width on desktop, drawer on mobile

**Report View:**
- Two-column layout: Chart left (60%), metrics right (40%) on `lg:`
- Keyword table: Full-width below charts
- Export button: Fixed bottom-right, floating with shadow

**PDF Export Styling:**
- White background with brand purple header
- Clean sans-serif typography
- Chart as embedded image
- Metric table with bordered cells

---

## Critical Implementation Notes

- All backgrounds must maintain dark mode consistency (`#0a0a0f` base)
- Glassmorphic effects require `backdrop-blur` browser support
- Gradient orbs positioned with `fixed` or `absolute`, low z-index
- Chart colors should use primary/secondary palette for consistency
- Form validation: Red border + error text below field
- Loading states: Skeleton screens matching card structure
- Empty states: Centered icon + message + CTA button