import fs from 'fs';
import path from 'path';

/**
 * Get the data directory path, checking for Railway volume mount first,
 * then falling back to local data directory.
 * 
 * This ensures consistent path resolution across the application.
 */
export function getDataPath(): string {
    const volumeMountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/app/data';
    return fs.existsSync(volumeMountPath) 
        ? volumeMountPath 
        : path.join(process.cwd(), 'data');
}

