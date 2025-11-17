# Railway Quick Start Guide

## One-Time Setup

1. **Create Volume** (Railway Dashboard → Service → Variables → Volumes → New Volume)
   - Mount path: `/app/data`

2. **Set Environment Variables**
   - `DATABASE_URL` - Your Supabase connection string
   - `RAILWAY_VOLUME_MOUNT_PATH=/app/data` (optional, defaults to `/app/data`)

3. **Deploy**
   - First deployment will download keywords (~30-50MB egress)
   - Subsequent deployments load from volume (zero egress)

## How It Works

- **First startup**: Downloads keywords from Supabase → Saves to `/app/data/keywords.json`
- **Future startups**: Loads from `/app/data/keywords.json` (no Supabase query)

## File Size

- Keywords file: ~30-50MB (monthly_data excluded)
- Precomputed metrics: Optional, can be added to volume if needed

## Benefits

✅ Zero egress costs after first deployment  
✅ Faster startup (local file read vs network query)  
✅ Persistent across deployments  
✅ Works with Railway's ephemeral filesystem  

## Troubleshooting

**Volume not found?**
- Check volume is created and mounted
- Verify mount path matches `RAILWAY_VOLUME_MOUNT_PATH`

**Keywords not loading?**
- Check Railway logs for initialization messages
- Verify `DATABASE_URL` is set correctly
- Ensure volume has write permissions

