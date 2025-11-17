# Railway Deployment Guide

This guide explains how to deploy the application to Railway with persistent keyword data storage.

## Overview

The application uses Railway Persistent Volumes to store keyword data locally, avoiding expensive egress costs on every deployment. Keywords are downloaded from Supabase once and cached in the volume for subsequent startups.

## Setup Steps

### 1. Create Railway Volume

**Important:** Railway volumes are configured in the dashboard, not in `railway.json`.

In your Railway project dashboard:

1. Go to your project → Select your service
2. Click on the **Variables** tab
3. Scroll down to the **Volumes** section
4. Click **New Volume**
5. Set mount path: `/app/data` (this is where the volume will be mounted)
6. Click **Create**

The volume will persist across deployments and restarts. Railway volumes are available on:
- **Hobby plan**: 5GB included
- **Pro plan**: 50GB included

**Note:** The volume mount path `/app/data` is the default. You can change it, but make sure to set the `RAILWAY_VOLUME_MOUNT_PATH` environment variable to match.

### 2. Set Environment Variables

In Railway project settings, set these environment variables:

- `DATABASE_URL` - Your Supabase PostgreSQL connection string
- `PORT` - Port number (default: 5000, Railway sets this automatically)
- `NODE_ENV` - Set to `production`
- `RAILWAY_VOLUME_MOUNT_PATH` - Set to `/app/data` (matches volume mount path)

### 3. Deploy

Railway will automatically:
1. Build the application using `npm run build`
2. Start the application using `npm start`
3. On first startup, download keywords from Supabase and save to volume
4. On subsequent startups, load keywords from volume (no egress cost)

## How It Works

### First Deployment

1. Application starts
2. Checks for `/app/data/keywords.json` in volume
3. File doesn't exist → downloads from Supabase (one-time egress cost ~30-50MB)
4. Saves keywords to volume
5. Loads keywords into memory
6. Application ready

### Subsequent Deployments

1. Application starts
2. Checks for `/app/data/keywords.json` in volume
3. File exists → loads from volume (zero egress cost)
4. Loads keywords into memory
5. Application ready

## File Structure in Volume

```
/app/data/
├── keywords.json              # Main keywords data (excludes monthly_data)
├── keywords-metadata.json    # Metadata about the keywords file
└── precomputed_opportunity_metrics.json  # Optional precomputed metrics
```

## Optimizations

### Excluded Data

The `keywords.json` file excludes `monthly_data` to reduce file size:
- **With monthly_data**: ~150-200MB
- **Without monthly_data**: ~30-50MB

Monthly data is still available via Supabase queries when needed (e.g., `findSimilarKeywords()`).

### Updating Keywords

To update keywords in the volume:

1. Delete the volume file (via Railway dashboard or CLI)
2. Redeploy - keywords will be re-downloaded from Supabase

Or manually update via Railway CLI:

```bash
railway run rm /app/data/keywords.json
railway up
```

## Monitoring

Check Railway logs to see:

- `[KeywordVectorService] Data path: /app/data` - Confirms volume path
- `[KeywordVectorService] Loading keywords from local storage...` - Loading from volume
- `[KeywordVectorService] Local keywords file not found, downloading from Supabase...` - First-time download

## Troubleshooting

### Volume Not Mounted

If you see errors about missing files:
1. Verify volume is created and mounted at `/app/data`
2. Check `RAILWAY_VOLUME_MOUNT_PATH` environment variable matches mount path
3. Verify volume is attached to your service

### Keywords Not Loading

1. Check Railway logs for initialization errors
2. Verify `DATABASE_URL` is set correctly
3. Check volume has write permissions
4. Verify Supabase connection is working

### Large File Size

If volume size is a concern:
- Keywords file is ~30-50MB (without monthly_data)
- Precomputed metrics are optional
- Consider compressing files if needed

## Cost Savings

- **Before**: ~150MB egress on every deployment = ~65GB/month with frequent deploys
- **After**: ~30-50MB egress once per volume = minimal ongoing costs
- **Savings**: ~99% reduction in egress costs

