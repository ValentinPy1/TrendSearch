# Scripts Documentation

This directory contains utility scripts organized by category. All scripts are designed to be run from the project root.

## Directory Structure

```
scripts/
├── database/      # Database migration and analysis scripts
├── data/          # Data processing and embedding scripts
├── deployment/    # Deployment and build scripts
├── metrics/       # Metrics aggregation scripts
└── utils/         # Utility and helper scripts
```

## Database Scripts

Scripts for database operations, migrations, and analysis.

### `database/migrate-embeddings-to-supabase.ts`
Migrates keyword embeddings from local files to Supabase database.

**Usage:**
```bash
tsx scripts/database/migrate-embeddings-to-supabase.ts
```

### `database/migrate-keywords.ts`
Migrates keyword data to the database.

**Usage:**
```bash
tsx scripts/database/migrate-keywords.ts
```

### `database/run-project-indexes-migration.ts`
Creates database indexes for custom search projects to improve query performance.

**Usage:**
```bash
tsx scripts/database/run-project-indexes-migration.ts
```

### `database/analyze-tables.ts`
Analyzes database table structures and provides insights.

**Usage:**
```bash
tsx scripts/database/analyze-tables.ts
```

### `database/check-query-plan.ts`
Checks and analyzes SQL query execution plans for optimization.

**Usage:**
```bash
tsx scripts/database/check-query-plan.ts
```

## Data Processing Scripts

Scripts for processing keyword data, building embeddings, and preprocessing.

### `data/build-binary-embeddings.ts`
Builds binary embeddings from keyword data for efficient vector search.

**Usage:**
```bash
tsx scripts/data/build-binary-embeddings.ts
```

### `data/build-keyword-embeddings.ts`
Generates keyword embeddings using sentence transformers.

**Usage:**
```bash
tsx scripts/data/build-keyword-embeddings.ts
```

### `data/prebuild-embeddings.ts`
Pre-builds embeddings for faster application startup.

**Usage:**
```bash
tsx scripts/data/prebuild-embeddings.ts
```

### `data/preprocess-keywords.ts`
Preprocesses keyword data before embedding generation.

**Usage:**
```bash
tsx scripts/data/preprocess-keywords.ts
```

### `data/precompute-opportunity-metrics.ts`
Precomputes opportunity scores for all keywords to improve performance.

**Usage:**
```bash
tsx scripts/data/precompute-opportunity-metrics.ts
```

### `data/convert-pickle-to-binary.ts`
Converts Python pickle files to binary format for Node.js.

**Usage:**
```bash
tsx scripts/data/convert-pickle-to-binary.ts
```

### `data/convert-pickle-to-binary.py`
Python script to convert pickle files to binary format.

**Usage:**
```bash
python scripts/data/convert-pickle-to-binary.py
```

### `data/extract-pickle-temp.py`
Temporary script for extracting data from pickle files.

**Usage:**
```bash
python scripts/data/extract-pickle-temp.py
```

### `data/load-embeddings-temp.py`
Temporary script for loading embeddings from files.

**Usage:**
```bash
python scripts/data/load-embeddings-temp.py
```

## Deployment Scripts

Scripts for deployment and build processes.

### `deployment/copy-data-files.js`
Copies static data files to the dist directory during build. This ensures data files are available in production.

**Usage:**
```bash
node scripts/deployment/copy-data-files.js
```

**Note:** This script is automatically run during `npm run build`.

### `deployment/upload-to-railway.ts`
Uploads files to Railway deployment platform.

**Usage:**
```bash
npm run upload:railway
# or
tsx scripts/deployment/upload-to-railway.ts
```

### `deployment/run-migration.sh`
Shell script to run database migrations.

**Usage:**
```bash
bash scripts/deployment/run-migration.sh
```

## Metrics Scripts

Scripts for aggregating and processing metrics.

### `metrics/aggregate-sector-metrics.ts`
Aggregates metrics by sector for analysis.

**Usage:**
```bash
tsx scripts/metrics/aggregate-sector-metrics.ts
```

### `metrics/create-minimal-sectors-metrics.ts`
Creates a minimal version of sector metrics for faster loading.

**Usage:**
```bash
npm run create:minimal-sectors
# or
tsx scripts/metrics/create-minimal-sectors-metrics.ts
```

## Utility Scripts

General utility and helper scripts.

### `utils/audit-compute-metrics.ts`
Audits the compute metrics step using clinic.js for performance profiling.

**Usage:**
```bash
npm run audit:metrics <projectId>
npm run audit:metrics:bubbleprof <projectId>
npm run audit:metrics:flame <projectId>
```

**Options:**
- `audit:metrics` - Uses clinic doctor for general profiling
- `audit:metrics:bubbleprof` - Uses bubbleprof for async profiling
- `audit:metrics:flame` - Uses flame for CPU profiling

### `utils/list-projects.ts`
Lists all custom search projects in the database.

**Usage:**
```bash
npm run list:projects
# or
tsx scripts/utils/list-projects.ts
```

### `utils/check-month.ts`
Checks keyword data for a specific month.

**Usage:**
```bash
tsx scripts/utils/check-month.ts
```

### `utils/cleanup-old-keywords.ts`
Cleans up old or unused keywords from the database.

**Usage:**
```bash
tsx scripts/utils/cleanup-old-keywords.ts
```

## Running Scripts

### TypeScript Scripts
Most scripts are written in TypeScript and can be run using `tsx`:

```bash
tsx scripts/<category>/<script-name>.ts
```

### JavaScript Scripts
JavaScript scripts can be run directly with Node.js:

```bash
node scripts/<category>/<script-name>.js
```

### Python Scripts
Python scripts require Python 3:

```bash
python scripts/<category>/<script-name>.py
```

### NPM Scripts
Some commonly used scripts are available as npm commands (see `package.json`):

```bash
npm run <script-name>
```

## Environment Variables

Most scripts require environment variables to be set. Make sure you have a `.env` file in the project root with the necessary configuration. See [Environment Setup Guide](../docs/ENV_SETUP.md) for details.

## Common Use Cases

### Setting Up a New Environment

1. Run database migrations:
   ```bash
   npm run db:push
   ```

2. Migrate keyword data:
   ```bash
   tsx scripts/database/migrate-keywords.ts
   ```

3. Build embeddings:
   ```bash
   tsx scripts/data/build-binary-embeddings.ts
   ```

### Performance Optimization

1. Precompute opportunity metrics:
   ```bash
   tsx scripts/data/precompute-opportunity-metrics.ts
   ```

2. Create minimal sector metrics:
   ```bash
   npm run create:minimal-sectors
   ```

3. Analyze query performance:
   ```bash
   tsx scripts/database/check-query-plan.ts
   ```

### Deployment Preparation

1. Build the application:
   ```bash
   npm run build
   ```

2. Upload to Railway (if needed):
   ```bash
   npm run upload:railway
   ```

## Notes

- Always ensure your `.env` file is properly configured before running scripts
- Database scripts may require database connection permissions
- Some scripts may take a long time to run (e.g., embedding generation)
- Always backup your database before running migration scripts
- Python scripts may require additional dependencies (check script headers)

## Troubleshooting

### Script Fails with "Cannot find module"
Make sure you're running the script from the project root directory.

### Database Connection Errors
Verify your `DATABASE_URL` environment variable is set correctly in `.env`.

### Permission Errors
Some scripts may require write permissions. Ensure the script has access to the necessary directories.

### TypeScript Errors
Run `npm run check` to verify TypeScript compilation before running scripts.

