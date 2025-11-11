/**
 * Keyword Deduplication Utility
 * 
 * Deduplicates keywords case-insensitively while preserving plurals.
 * Example: "tool" and "tools" are treated as different keywords.
 */

export function deduplicateKeywords(keywords: string[]): string[] {
    if (keywords.length === 0) return [];

    // Use Map to preserve original casing of first occurrence
    // Key: normalized (lowercase) keyword, Value: original keyword
    const seen = new Map<string, string>();
    const result: string[] = [];

    for (const keyword of keywords) {
        const normalized = keyword.trim().toLowerCase();
        if (normalized.length === 0) continue;

        // Check if we've seen this keyword (case-insensitive)
        if (!seen.has(normalized)) {
            seen.set(normalized, keyword.trim());
            result.push(keyword.trim());
        }
        // If seen, skip it (preserves plurals as separate entries since "tool" !== "tools")
    }

    return result;
}

