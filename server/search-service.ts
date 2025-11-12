/**
 * Search Service
 * 
 * Handles Google search operations for competitor discovery
 */

import OpenAI from "openai";
import { logger } from "./utils/logger";

const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface SearchResult {
    title: string;
    link: string;
    snippet: string;
}

export interface GoogleSearchResponse {
    items?: Array<{
        title: string;
        link: string;
        snippet: string;
    }>;
}

/**
 * Generate search queries from pitch using LLM
 */
export async function generateSearchQueries(
    pitch: string,
    additionalContext: string[] = []
): Promise<string[]> {
    const systemMessage = "You are a search query expert. Generate effective Google search queries to find competitors.";

    const contextText = additionalContext.length > 0
        ? `\n\nAdditional Context:\n${additionalContext.join("\n")}\n`
        : "";

    const prompt = `Based on this idea pitch, generate 4-5 Google search queries that would help find real competitors (existing products, services, or companies) in the market.

Idea Pitch:
${pitch}${contextText}

Generate search queries that:
- Are specific and targeted
- Use industry/product keywords
- Include variations (e.g., "alternatives to X", "X competitors", "best X tools")
- Would return actual competitor websites in search results

Return ONLY a JSON array of search query strings, no other text. Example format:
["search query 1", "search query 2", "search query 3"]`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: systemMessage,
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
            max_tokens: 300,
            temperature: 0.7,
        });

        let content = response.choices[0]?.message?.content?.trim();
        if (!content) {
            throw new Error("No content generated from OpenAI");
        }

        // Strip markdown code blocks
        content = content
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

        const queries = JSON.parse(content);
        if (!Array.isArray(queries) || queries.length === 0) {
            throw new Error("Invalid search queries format");
        }

        return queries.slice(0, 5); // Limit to 5 queries
    } catch (error) {
        logger.error("Error generating search queries", error);
        // Fallback to simple queries based on pitch
        const words = pitch.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 3);
        return [
            `${words.join(" ")} competitors`,
            `alternatives to ${words.join(" ")}`,
            `best ${words.join(" ")} tools`,
        ];
    }
}

/**
 * Execute Google Custom Search API query
 */
export async function searchGoogle(
    query: string,
    apiKey?: string,
    searchEngineId?: string
): Promise<SearchResult[]> {
    const googleApiKey = apiKey || process.env.GOOGLE_SEARCH_API_KEY;
    const cx = searchEngineId || process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!googleApiKey || !cx) {
        throw new Error("Google Search API credentials not configured");
    }

    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", googleApiKey);
    url.searchParams.set("cx", cx);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "10"); // Get top 10 results

    try {
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "User-Agent": "TrendsSearch/1.0",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();

            // Handle rate limits specifically
            if (response.status === 429) {
                const rateLimitError: any = new Error("Google Search API rate limit exceeded");
                rateLimitError.isRateLimit = true;
                throw rateLimitError;
            }

            // Handle quota exceeded
            if (response.status === 403) {
                const quotaError: any = new Error("Google Search API quota exceeded");
                quotaError.isQuotaExceeded = true;
                throw quotaError;
            }

            throw new Error(`Google Search API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: GoogleSearchResponse = await response.json();

        if (!data.items || data.items.length === 0) {
            logger.debug("No search results found", { query });
            return [];
        }

        return data.items.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet || "",
        }));
    } catch (error) {
        logger.error("Error executing Google search", error, { query });
        throw error;
    }
}

/**
 * Execute multiple Google searches in parallel
 */
export async function searchGoogleMultiple(
    queries: string[],
    apiKey?: string,
    searchEngineId?: string
): Promise<SearchResult[]> {
    const results = await Promise.allSettled(
        queries.map(query => searchGoogle(query, apiKey, searchEngineId))
    );

    const allResults: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const result of results) {
        if (result.status === "fulfilled") {
            for (const item of result.value) {
                // Deduplicate by URL
                if (!seenUrls.has(item.link)) {
                    seenUrls.add(item.link);
                    allResults.push(item);
                }
            }
        } else {
            logger.warn("Search query failed", {
                error: result.reason,
            });
        }
    }

    return allResults;
}

/**
 * Check if a URL appears to be a blog post, article, or news page
 */
function isBlogOrArticleUrl(url: string): boolean {
    const urlLower = url.toLowerCase();
    const blogPatterns = [
        '/blog/',
        '/article/',
        '/articles/',
        '/news/',
        '/post/',
        '/posts/',
        '/story/',
        '/stories/',
        '/review/',
        '/reviews/',
        '/comparison/',
        '/vs/',
        '/alternatives/',
        '/best-',
        '/top-',
        'medium.com',
        'blogspot.com',
        'wordpress.com',
        'tumblr.com',
    ];
    
    return blogPatterns.some(pattern => urlLower.includes(pattern));
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string | null {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

/**
 * Try to find the landing page URL for a competitor mentioned in a blog/article
 */
async function findLandingPageForCompetitor(
    competitorName: string,
    blogUrl: string,
    apiKey?: string,
    searchEngineId?: string
): Promise<string | null> {
    try {
        // Search for the competitor's official website
        const searchQuery = `"${competitorName}" official website`;
        const results = await searchGoogle(searchQuery, apiKey, searchEngineId);
        
        if (results.length > 0) {
            // Look for results that are likely the official landing page
            for (const result of results.slice(0, 5)) {
                const resultUrl = result.link.toLowerCase();
                const resultDomain = extractDomain(result.link);
                const blogDomain = extractDomain(blogUrl);
                
                // Skip if it's the same domain as the blog
                if (resultDomain === blogDomain) {
                    continue;
                }
                
                // Prefer URLs that look like landing pages (not blog posts)
                if (!isBlogOrArticleUrl(result.link)) {
                    // Check if the title/snippet suggests it's the official site
                    const titleLower = result.title.toLowerCase();
                    const snippetLower = result.snippet.toLowerCase();
                    const nameLower = competitorName.toLowerCase();
                    
                    if (
                        titleLower.includes(nameLower) ||
                        snippetLower.includes('official') ||
                        snippetLower.includes('website') ||
                        snippetLower.includes('homepage')
                    ) {
                        return result.link;
                    }
                }
            }
            
            // If no clear landing page found, return the first non-blog result
            for (const result of results) {
                if (!isBlogOrArticleUrl(result.link)) {
                    const resultDomain = extractDomain(result.link);
                    const blogDomain = extractDomain(blogUrl);
                    if (resultDomain !== blogDomain) {
                        return result.link;
                    }
                }
            }
        }
    } catch (error) {
        logger.debug("Failed to find landing page for competitor", {
            competitorName,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    
    return null;
}

/**
 * Extract competitor information from search results using LLM
 */
export async function extractCompetitorsFromSearchResults(
    searchResults: SearchResult[],
    pitch: string,
    additionalContext: string[] = []
): Promise<Array<{ name: string; description: string; url: string }>> {
    if (searchResults.length === 0) {
        return [];
    }

    // Process more results to ensure we get enough competitors (top 30-40)
    const topResults = searchResults.slice(0, Math.min(40, searchResults.length));

    const systemMessage = "You are a competitive intelligence analyst. Analyze search results and extract competitor information.";

    const contextText = additionalContext.length > 0
        ? `\n\nAdditional Context:\n${additionalContext.join("\n")}\n`
        : "";

    const searchResultsText = topResults
        .map((result, index) => {
            return `${index + 1}. Title: ${result.title}\n   URL: ${result.link}\n   Snippet: ${result.snippet}`;
        })
        .join("\n\n");

    const prompt = `Based on this idea pitch and the Google search results below, identify real competitors (existing products, services, or companies) that address similar problems or target similar audiences.

Idea Pitch:
${pitch}${contextText}

Google Search Results:
${searchResultsText}

IMPORTANT: Extract AT LEAST 6 competitors, and up to 12 competitors. Be thorough and include all relevant competitors from the search results.

For each relevant competitor found in the search results, extract:
- name: The company or product name (from title or URL)
- description: Brief description of what they do (10-20 words, based on snippet and title)
- url: PREFER the competitor's official landing page/homepage URL. If the search result is a blog post, article, or review mentioning the competitor, try to identify and use the competitor's actual website URL instead. Only use the blog/article URL if you cannot determine the competitor's official website.

CRITICAL: When a search result is a blog post, article, review, or comparison site:
1. Identify the competitor name mentioned
2. Look for the competitor's official website URL in the snippet or try to infer it from the domain
3. If you can identify the official website, use that URL instead of the blog/article URL
4. Only fall back to the blog/article URL if the official website cannot be determined

Include competitors that:
- Are products, services, or companies addressing similar problems
- Target similar audiences
- Are in the same market space
- Even if they're mentioned in directories or comparison sites, extract the actual competitor name and their official website URL

Skip only results that are:
- Completely unrelated to the product/service
- Pure news articles or blog posts that don't mention any specific competitor product

Return ONLY a JSON array of competitor objects with AT LEAST 6 competitors. Example format:
[
  {"name": "Competitor A", "description": "Brief description here", "url": "https://competitor-a.com"},
  {"name": "Competitor B", "description": "Brief description here", "url": "https://competitor-b.com"}
]`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: systemMessage,
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
            max_tokens: 2000,
            temperature: 0.7,
        });

        let content = response.choices[0]?.message?.content?.trim();
        if (!content) {
            throw new Error("No content generated from OpenAI");
        }

        // Strip markdown code blocks
        content = content
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

        const competitors = JSON.parse(content);
        if (!Array.isArray(competitors)) {
            throw new Error("Invalid competitors format");
        }

        // Validate and clean competitors
        let extractedCompetitors = competitors
            .map((comp: any) => ({
                name: comp.name || comp.title || "Unknown",
                description: comp.description || comp.desc || "",
                url: comp.url || comp.link || null,
            }))
            .filter((comp: any) =>
                comp.name !== "Unknown" &&
                comp.description.length > 0 &&
                comp.url
            );

        // Resolve landing pages for competitors found in blog/articles
        // Only do this if Google Search API is configured (to avoid unnecessary API calls)
        const shouldResolveLandingPages = isGoogleSearchConfigured();
        
        logger.info("Resolving landing pages for competitors", {
            total: extractedCompetitors.length,
            willResolve: shouldResolveLandingPages,
        });

        const resolvedCompetitors = shouldResolveLandingPages
            ? await Promise.all(
                  extractedCompetitors.map(async (comp) => {
                      if (!comp.url) {
                          return comp;
                      }

                      // Check if the URL is a blog/article
                      if (isBlogOrArticleUrl(comp.url)) {
                          logger.debug("Found competitor in blog/article, attempting to find landing page", {
                              competitor: comp.name,
                              blogUrl: comp.url,
                          });

                          try {
                              // Try to find the landing page
                              const landingPage = await findLandingPageForCompetitor(
                                  comp.name,
                                  comp.url,
                                  process.env.GOOGLE_SEARCH_API_KEY,
                                  process.env.GOOGLE_SEARCH_ENGINE_ID
                              );

                              if (landingPage) {
                                  logger.debug("Found landing page for competitor", {
                                      competitor: comp.name,
                                      blogUrl: comp.url,
                                      landingPage,
                                  });
                                  return {
                                      ...comp,
                                      url: landingPage,
                                  };
                              } else {
                                  logger.debug("Could not find landing page, using blog URL as fallback", {
                                      competitor: comp.name,
                                      blogUrl: comp.url,
                                  });
                                  // Fall back to blog URL
                                  return comp;
                              }
                          } catch (error) {
                              logger.warn("Error finding landing page, using blog URL as fallback", {
                                  competitor: comp.name,
                                  error: error instanceof Error ? error.message : String(error),
                              });
                              // Fall back to blog URL on error
                              return comp;
                          }
                      }

                      // Already a landing page (or at least not a blog/article)
                      return comp;
                  })
              )
            : extractedCompetitors; // Skip resolution if API not configured

        extractedCompetitors = resolvedCompetitors;

        // If we got fewer than 6 competitors, try to extract more from remaining search results
        if (extractedCompetitors.length < 6 && searchResults.length > topResults.length) {
            logger.info("Extracted fewer than 6 competitors, attempting to extract more from remaining results", {
                extracted: extractedCompetitors.length,
                remainingResults: searchResults.length - topResults.length,
            });

            // Try extracting from the next batch of results
            const remainingResults = searchResults.slice(topResults.length, Math.min(topResults.length + 20, searchResults.length));
            const additionalResultsText = remainingResults
                .map((result, index) => {
                    return `${index + 1}. Title: ${result.title}\n   URL: ${result.link}\n   Snippet: ${result.snippet}`;
                })
                .join("\n\n");

            try {
                const additionalPrompt = `Based on this idea pitch, extract additional competitors from these search results. You already have ${extractedCompetitors.length} competitors, but we need at least 6 total.

Idea Pitch:
${pitch}${contextText}

Additional Search Results:
${additionalResultsText}

Extract competitors that are different from the ones already found. Return ONLY a JSON array of competitor objects.`;

                const additionalResponse = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: systemMessage,
                        },
                        {
                            role: "user",
                            content: additionalPrompt,
                        },
                    ],
                    max_tokens: 1500,
                    temperature: 0.7,
                });

                let additionalContent = additionalResponse.choices[0]?.message?.content?.trim();
                if (additionalContent) {
                    additionalContent = additionalContent
                        .replace(/^```json\s*/i, "")
                        .replace(/^```\s*/i, "")
                        .replace(/\s*```$/i, "")
                        .replace(/```json/gi, "")
                        .replace(/```/g, "")
                        .trim();

                    const additionalCompetitors = JSON.parse(additionalContent);
                    if (Array.isArray(additionalCompetitors)) {
                        const newCompetitors = additionalCompetitors
                            .map((comp: any) => ({
                                name: comp.name || comp.title || "Unknown",
                                description: comp.description || comp.desc || "",
                                url: comp.url || comp.link || null,
                            }))
                            .filter((comp: any) =>
                                comp.name !== "Unknown" &&
                                comp.description.length > 0 &&
                                comp.url &&
                                !extractedCompetitors.some(existing => existing.url === comp.url)
                            );

                        extractedCompetitors = [...extractedCompetitors, ...newCompetitors];
                        logger.info("Extracted additional competitors", {
                            additional: newCompetitors.length,
                            total: extractedCompetitors.length,
                        });
                    }
                }
            } catch (additionalError) {
                logger.warn("Failed to extract additional competitors", {
                    error: additionalError instanceof Error ? additionalError.message : String(additionalError),
                });
            }
        }

        // Limit to 12 competitors max
        return extractedCompetitors.slice(0, 12);
    } catch (error) {
        logger.error("Error extracting competitors from search results", error);
        throw error;
    }
}

/**
 * Check if Google Search API is configured
 */
export function isGoogleSearchConfigured(): boolean {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    return !!(apiKey && searchEngineId);
}

