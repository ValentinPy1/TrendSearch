/**
 * Keyword Processing Service
 * 
 * Shared utility functions for processing DataForSEO results and saving keywords to projects.
 * Used by both "find keywords from website" and "find custom keywords" pipelines.
 */

import type { KeywordsForSiteKeywordResult, KeywordsForKeywordsKeywordResult } from "./dataforseo-service";

// Simple logger for debugging - use console methods
const logger = {
    debug: (message: string, data?: any) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[KeywordProcessingService] ${message}`, data || '');
        }
    }
};

// Union type for DataForSEO keyword results (both types have identical structure)
export type DataForSEOKeywordResult = KeywordsForSiteKeywordResult | KeywordsForKeywordsKeywordResult;

/**
 * Process DataForSEO results into keyword data objects ready for database insertion
 * 
 * @param results - Array of DataForSEO keyword results
 * @param allKeywords - Array of all keyword strings (for adding keywords without data)
 * @returns Object containing keywordsToInsert, keywordMap, and keywordsWithData count
 */
export function processDataForSEOResults(
    results: DataForSEOKeywordResult[],
    allKeywords: string[]
): {
    keywordsToInsert: Array<{
        keyword: string;
        volume: number | null;
        competition: number | null;
        cpc: number | null;
        topPageBid: number | null;
        monthlyData: Array<{ month: string; volume: number }>;
        source: string;
    }>;
    keywordMap: Map<string, DataForSEOKeywordResult>;
    keywordsWithData: number;
} {
    let keywordsWithData = 0;
    const keywordsToInsert: Array<{
        keyword: string;
        volume: number | null;
        competition: number | null;
        cpc: number | null;
        topPageBid: number | null;
        monthlyData: Array<{ month: string; volume: number }>;
        source: string;
    }> = [];
    const keywordMap = new Map<string, DataForSEOKeywordResult>();

    for (const result of results) {
        // Count keywords with any data metric
        if ((result.search_volume !== null && result.search_volume !== undefined) ||
            (result.competition !== null && result.competition !== undefined) ||
            (result.competition_index !== null && result.competition_index !== undefined) ||
            (result.cpc !== null && result.cpc !== undefined) ||
            (result.low_top_of_page_bid !== null && result.low_top_of_page_bid !== undefined) ||
            (result.high_top_of_page_bid !== null && result.high_top_of_page_bid !== undefined)) {
            keywordsWithData++;
        }

        // Format monthly data
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyData = result.monthly_searches?.map(ms => {
            const monthName = monthNames[ms.month - 1];
            return {
                month: `${monthName} ${ms.year}`,
                volume: ms.search_volume,
                sortKey: `${ms.year}-${String(ms.month).padStart(2, '0')}`
            };
        }).sort((a, b) => a.sortKey.localeCompare(b.sortKey)).map(({ sortKey, ...rest }) => rest) || [];

        // Normalize competition (prioritize competition_index from DataForSEO)
        let competitionIndex = null;
        // Use competition_index first if available (more granular than string values)
        if (result.competition_index !== null && result.competition_index !== undefined) {
            competitionIndex = result.competition_index;
        } else if (result.competition) {
            // Fall back to converting competition string if competition_index is not available
            if (result.competition === "HIGH") competitionIndex = 100;
            else if (result.competition === "MEDIUM") competitionIndex = 50;
            else if (result.competition === "LOW") competitionIndex = 0;
        }

        // Calculate average top page bid
        const avgTopPageBid = result.low_top_of_page_bid && result.high_top_of_page_bid
            ? (result.low_top_of_page_bid + result.high_top_of_page_bid) / 2
            : null;

        // Create keyword data object (prioritize DataForSEO data)
        const keywordData = {
            keyword: result.keyword,
            volume: result.search_volume || null,
            competition: competitionIndex || null,
            cpc: result.cpc || null,
            topPageBid: avgTopPageBid,
            monthlyData: monthlyData,
            source: "dataforseo"
        };

        keywordsToInsert.push(keywordData);
        keywordMap.set(result.keyword.toLowerCase(), result);
    }

    // Add keywords without data
    for (const keyword of allKeywords) {
        if (!keywordMap.has(keyword.toLowerCase())) {
            keywordsToInsert.push({
                keyword: keyword,
                volume: null,
                competition: null,
                cpc: null,
                topPageBid: null,
                monthlyData: [],
                source: "dataforseo"
            });
        }
    }

    return {
        keywordsToInsert,
        keywordMap,
        keywordsWithData
    };
}

/**
 * Normalize website URL for consistent storage and comparison
 */
function normalizeWebsite(website: string): string {
    if (!website) return '';
    try {
        // Add protocol if missing
        const urlWithProtocol = website.startsWith('http') ? website : `https://${website}`;
        const urlObj = new URL(urlWithProtocol);
        // Get hostname and remove www.
        return urlObj.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        // If URL parsing fails, just clean it up
        return website.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase().split('/')[0];
    }
}

/**
 * Save keywords to database and link them to a project with similarity scores
 * 
 * @param keywordsToInsert - Array of keyword data objects from processDataForSEOResults
 * @param allKeywords - Array of all keyword strings
 * @param projectId - Project ID to link keywords to
 * @param projectPitch - Project pitch for similarity calculation
 * @param storage - Storage service instance
 * @param keywordVectorService - Keyword vector service for similarity calculation
 * @param sourceWebsite - Source website URL (will be normalized)
 * @returns Promise resolving to count of keywords with data
 */
export async function saveKeywordsToProject(
    keywordsToInsert: Array<{
        keyword: string;
        volume: number | null;
        competition: number | null;
        cpc: number | null;
        topPageBid: number | null;
        monthlyData: Array<{ month: string; volume: number }>;
        source: string;
    }>,
    allKeywords: string[],
    projectId: string,
    projectPitch: string,
    storage: any,
    keywordVectorService: any,
    sourceWebsite?: string
): Promise<number> {
    // Normalize source website
    const normalizedSourceWebsite = sourceWebsite ? normalizeWebsite(sourceWebsite) : '';

    // Save all keywords to globalKeywords table
    const savedKeywords = await storage.createGlobalKeywords(keywordsToInsert);

    // Link keywords to project
    const allKeywordsToLink: string[] = [];
    const keywordTextToIdMap = new Map<string, string>();

    savedKeywords.forEach((kw: any) => {
        keywordTextToIdMap.set(kw.keyword.toLowerCase(), kw.id);
        allKeywordsToLink.push(kw.keyword);
    });

    // Get all existing keywords that weren't in savedKeywords (already in DB)
    const allExistingKeywords = await storage.getGlobalKeywordsByTexts(allKeywords);
    allExistingKeywords.forEach((kw: any) => {
        if (!keywordTextToIdMap.has(kw.keyword.toLowerCase())) {
            keywordTextToIdMap.set(kw.keyword.toLowerCase(), kw.id);
            allKeywordsToLink.push(kw.keyword);
        }
    });

    const existingLinks = await storage.getProjectKeywords(projectId);
    const existingLinkMap = new Map<string, { id: string; sourceWebsites: string[] }>();
    existingLinks.forEach((kw: any) => {
        existingLinkMap.set(kw.id, {
            id: kw.id,
            sourceWebsites: kw.sourceWebsites || [],
        });
    });

    const pitch = projectPitch || "";
    const keywordIdsToLink: string[] = [];
    const similarityScoresToLink: number[] = [];
    const keywordsToUpdate: Array<{ keywordId: string; sourceWebsites: string[] }> = [];

    for (const keywordText of allKeywordsToLink) {
        const keywordId = keywordTextToIdMap.get(keywordText.toLowerCase());
        if (!keywordId) continue;

        const existingLink = existingLinkMap.get(keywordId);
        
        if (existingLink) {
            // Keyword already linked - update sourceWebsites if needed
            if (normalizedSourceWebsite) {
                const currentSourceWebsites = existingLink.sourceWebsites || [];
                if (!currentSourceWebsites.includes(normalizedSourceWebsite)) {
                    const updatedSourceWebsites = [...currentSourceWebsites, normalizedSourceWebsite];
                    keywordsToUpdate.push({ keywordId, sourceWebsites: updatedSourceWebsites });
                    logger.debug("Updating sourceWebsites for existing keyword link", {
                        keywordId,
                        keyword: keywordText,
                        currentSourceWebsites,
                        newSourceWebsite: normalizedSourceWebsite,
                        updatedSourceWebsites
                    });
                }
            }
        } else {
            // New keyword link
            keywordIdsToLink.push(keywordId);
            let similarity = 0.5;
            if (pitch.trim()) {
                try {
                    similarity = await keywordVectorService.calculateTextSimilarity(pitch, keywordText);
                } catch (error) {
                    console.warn(`Failed to calculate similarity for keyword "${keywordText}":`, error);
                }
            }
            similarityScoresToLink.push(similarity);
        }
    }

    // Create new links with sourceWebsite
    if (keywordIdsToLink.length > 0) {
        logger.debug("Linking new keywords to project", {
            projectId,
            keywordsCount: keywordIdsToLink.length,
            sourceWebsite: normalizedSourceWebsite
        });
        await storage.linkKeywordsToProject(
            projectId, 
            keywordIdsToLink, 
            similarityScoresToLink,
            normalizedSourceWebsite ? [normalizedSourceWebsite] : []
        );
    }

    // Update existing links with new sourceWebsite
    if (keywordsToUpdate.length > 0) {
        logger.debug("Updating sourceWebsites for existing keyword links", {
            projectId,
            updatesCount: keywordsToUpdate.length
        });
        for (const update of keywordsToUpdate) {
            await storage.updateKeywordLinkSourceWebsites(projectId, update.keywordId, update.sourceWebsites);
        }
    }

    // Calculate and return keywords with data count
    let keywordsWithData = 0;
    for (const kw of keywordsToInsert) {
        if ((kw.volume !== null && kw.volume !== undefined) ||
            (kw.competition !== null && kw.competition !== undefined) ||
            (kw.cpc !== null && kw.cpc !== undefined) ||
            (kw.topPageBid !== null && kw.topPageBid !== undefined)) {
            keywordsWithData++;
        }
    }

    return keywordsWithData;
}

