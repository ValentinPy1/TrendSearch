/**
 * Location Service
 * 
 * Parses location data from CSV and provides hierarchical location structure
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Location {
    code: number;
    name: string;
    parentCode: number | null;
    countryCode: string;
    type: string;
    children?: Location[];
    path?: string[]; // Full path from root (e.g., ["United States", "California", "Los Angeles"])
}

let locationCache: Map<number, Location> | null = null;
let locationTree: Location[] | null = null;
let locationSearchIndex: Location[] | null = null;

/**
 * Parse CSV file and build location structure
 */
function parseLocations(): { locations: Map<number, Location>, tree: Location[], searchIndex: Location[] } {
    if (locationCache && locationTree && locationSearchIndex) {
        return { locations: locationCache, tree: locationTree, searchIndex: locationSearchIndex };
    }

    const csvPath = path.join(process.cwd(), 'data', 'locations_kwrd_2025_08_05.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());

    // Skip header
    const dataLines = lines.slice(1);

    const locations = new Map<number, Location>();
    const locationsByParent = new Map<number | null, Location[]>();

    // First pass: create all location objects
    for (const line of dataLines) {
        // Handle CSV parsing (accounting for quoted fields)
        const parts: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                parts.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        parts.push(current.trim());

        if (parts.length < 5) continue;

        const code = parseInt(parts[0], 10);
        const name = parts[1].replace(/^"|"$/g, ''); // Remove quotes
        const parentCodeStr = parts[2].trim();
        const parentCode = parentCodeStr ? parseInt(parentCodeStr, 10) : null;
        const countryCode = parts[3].trim();
        const type = parts[4].trim();

        if (isNaN(code)) continue;

        const location: Location = {
            code,
            name,
            parentCode,
            countryCode,
            type,
            children: [],
        };

        locations.set(code, location);

        // Group by parent
        if (!locationsByParent.has(parentCode)) {
            locationsByParent.set(parentCode, []);
        }
        locationsByParent.get(parentCode)!.push(location);
    }

    // Second pass: build tree structure and paths
    const buildPath = (loc: Location): string[] => {
        if (loc.path) return loc.path;
        if (loc.parentCode === null) {
            loc.path = [loc.name];
            return loc.path;
        }
        const parent = locations.get(loc.parentCode);
        if (!parent) {
            loc.path = [loc.name];
            return loc.path;
        }
        const parentPath = buildPath(parent);
        loc.path = [...parentPath, loc.name];
        return loc.path;
    };

    // Build children relationships
    for (const location of locations.values()) {
        const children = locationsByParent.get(location.code) || [];
        location.children = children.sort((a, b) => a.name.localeCompare(b.name));
        buildPath(location);
    }

    // Build root tree (locations with no parent)
    const rootLocations = locationsByParent.get(null) || [];
    const tree = rootLocations.sort((a, b) => a.name.localeCompare(b.name));

    // Build search index (all locations)
    const searchIndex = Array.from(locations.values()).sort((a, b) => a.name.localeCompare(b.name));

    locationCache = locations;
    locationTree = tree;
    locationSearchIndex = searchIndex;

    return { locations, tree, searchIndex };
}

/**
 * Get all locations (for search)
 */
export function getAllLocations(): Location[] {
    const { searchIndex } = parseLocations();
    return searchIndex;
}

/**
 * Get location tree (hierarchical structure)
 */
export function getLocationTree(): Location[] {
    const { tree } = parseLocations();
    // Return tree without children property to reduce payload size
    return tree.map(loc => ({
        code: loc.code,
        name: loc.name,
        parentCode: loc.parentCode,
        countryCode: loc.countryCode,
        type: loc.type,
        path: loc.path,
    }));
}

/**
 * Get location by code
 */
export function getLocationByCode(code: number): Location | undefined {
    const { locations } = parseLocations();
    return locations.get(code);
}

/**
 * Get children of a location
 */
export function getLocationChildren(parentCode: number | null): Location[] {
    const { locations } = parseLocations();
    if (parentCode === null) {
        return getLocationTree();
    }
    const parent = locations.get(parentCode);
    const children = parent?.children || [];
    // Return children without the children property to reduce payload size
    return children.map(child => ({
        code: child.code,
        name: child.name,
        parentCode: child.parentCode,
        countryCode: child.countryCode,
        type: child.type,
        path: child.path,
    }));
}

/**
 * Search locations by name
 */
export function searchLocations(query: string, limit: number = 50): Location[] {
    const { searchIndex } = parseLocations();
    const lowerQuery = query.toLowerCase().trim();
    
    if (!lowerQuery) {
        return searchIndex.slice(0, limit).map(loc => ({
            code: loc.code,
            name: loc.name,
            parentCode: loc.parentCode,
            countryCode: loc.countryCode,
            type: loc.type,
            path: loc.path,
        }));
    }

    // Score locations: exact match > starts with > contains
    const scored = searchIndex.map(loc => {
        const lowerName = loc.name.toLowerCase();
        let score = 0;
        
        if (lowerName === lowerQuery) {
            score = 1000;
        } else if (lowerName.startsWith(lowerQuery)) {
            score = 500;
        } else if (lowerName.includes(lowerQuery)) {
            score = 100;
        } else {
            // Check path
            const pathStr = loc.path?.join(' > ').toLowerCase() || '';
            if (pathStr.includes(lowerQuery)) {
                score = 50;
            }
        }

        return { location: loc, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => ({
        code: item.location.code,
        name: item.location.name,
        parentCode: item.location.parentCode,
        countryCode: item.location.countryCode,
        type: item.location.type,
        path: item.location.path,
    }));

    return scored;
}

/**
 * Get location path as string
 */
export function getLocationPath(location: Location): string {
    return location.path?.join(' > ') || location.name;
}

