/**
 * URL validation utilities for checking competitor URLs
 */

import { logger } from "./logger";

export interface UrlValidationResult {
    isValid: boolean;
    isAccessible: boolean;
    error?: string;
    finalUrl?: string;
}

const URL_VALIDATION_TIMEOUT_MS = 5000; // 5 seconds
const MAX_REDIRECTS = 3;

/**
 * Validates URL format
 */
export function isValidUrlFormat(url: string): boolean {
    try {
        const urlObj = new URL(url);
        // Must have http or https protocol
        return urlObj.protocol === "http:" || urlObj.protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * Normalizes URL (adds https:// if no protocol, handles common issues)
 */
export function normalizeUrl(url: string): string | null {
    const trimmed = url.trim();
    if (!trimmed) {
        return null;
    }

    // If already has protocol, validate format
    if (trimmed.match(/^https?:\/\//i)) {
        return trimmed;
    }

    // Add https:// if no protocol
    return `https://${trimmed}`;
}

/**
 * Checks if a URL is accessible using HEAD request with timeout
 * Follows redirects up to MAX_REDIRECTS times
 */
export async function checkUrlAccessibility(
    url: string,
    timeoutMs: number = URL_VALIDATION_TIMEOUT_MS,
    maxRedirects: number = MAX_REDIRECTS
): Promise<UrlValidationResult> {
    // First validate URL format
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl || !isValidUrlFormat(normalizedUrl)) {
        return {
            isValid: false,
            isAccessible: false,
            error: "Invalid URL format",
        };
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        let currentUrl = normalizedUrl;
        let redirectCount = 0;

        while (redirectCount <= maxRedirects) {
            try {
                const response = await fetch(currentUrl, {
                    method: "HEAD",
                    signal: controller.signal,
                    redirect: "manual", // Handle redirects manually
                    headers: {
                        "User-Agent": "Mozilla/5.0 (compatible; TrendsSearch/1.0)",
                    },
                });

                // Check for redirect
                if (
                    response.status >= 300 &&
                    response.status < 400 &&
                    response.headers.has("location")
                ) {
                    if (redirectCount >= maxRedirects) {
                        clearTimeout(timeoutId);
                        return {
                            isValid: true,
                            isAccessible: false,
                            error: `Too many redirects (max ${maxRedirects})`,
                            finalUrl: currentUrl,
                        };
                    }

                    const location = response.headers.get("location");
                    if (!location) {
                        clearTimeout(timeoutId);
                        return {
                            isValid: true,
                            isAccessible: false,
                            error: "Redirect without location header",
                            finalUrl: currentUrl,
                        };
                    }

                    // Handle relative redirects
                    try {
                        currentUrl = new URL(location, currentUrl).href;
                    } catch {
                        clearTimeout(timeoutId);
                        return {
                            isValid: true,
                            isAccessible: false,
                            error: "Invalid redirect URL",
                            finalUrl: currentUrl,
                        };
                    }

                    redirectCount++;
                    continue;
                }

                // Check if status indicates success
                if (response.status >= 200 && response.status < 400) {
                    clearTimeout(timeoutId);
                    return {
                        isValid: true,
                        isAccessible: true,
                        finalUrl: currentUrl,
                    };
                }

                // If HEAD fails, try GET (some servers don't support HEAD)
                if (response.status === 405 || response.status === 501) {
                    const getResponse = await fetch(currentUrl, {
                        method: "GET",
                        signal: controller.signal,
                        redirect: "follow",
                        headers: {
                            "User-Agent": "Mozilla/5.0 (compatible; TrendsSearch/1.0)",
                        },
                    });

                    if (getResponse.status >= 200 && getResponse.status < 400) {
                        clearTimeout(timeoutId);
                        return {
                            isValid: true,
                            isAccessible: true,
                            finalUrl: getResponse.url,
                        };
                    }
                }

                clearTimeout(timeoutId);
                return {
                    isValid: true,
                    isAccessible: false,
                    error: `HTTP ${response.status}`,
                    finalUrl: currentUrl,
                };
            } catch (fetchError: unknown) {
                clearTimeout(timeoutId);

                // Handle abort (timeout)
                if (fetchError instanceof Error && fetchError.name === "AbortError") {
                    return {
                        isValid: true,
                        isAccessible: false,
                        error: "Request timeout",
                        finalUrl: currentUrl,
                    };
                }

                // Handle network errors
                if (fetchError instanceof TypeError) {
                    return {
                        isValid: true,
                        isAccessible: false,
                        error: "Network error (DNS/connection failed)",
                        finalUrl: currentUrl,
                    };
                }

                // Handle other errors
                return {
                    isValid: true,
                    isAccessible: false,
                    error:
                        fetchError instanceof Error
                            ? fetchError.message
                            : "Unknown error",
                    finalUrl: currentUrl,
                };
            }
        }

        clearTimeout(timeoutId);
        return {
            isValid: true,
            isAccessible: false,
            error: `Too many redirects (max ${maxRedirects})`,
            finalUrl: currentUrl,
        };
    } catch (error: unknown) {
        clearTimeout(timeoutId);
        return {
            isValid: true,
            isAccessible: false,
            error:
                error instanceof Error ? error.message : "Unknown error occurred",
        };
    }
}

/**
 * Validates a competitor URL and returns validation result
 * This is the main function to use for validating competitor URLs
 */
export async function validateCompetitorUrl(
    url: string | null | undefined
): Promise<UrlValidationResult> {
    // If no URL provided, consider it valid (competitor without URL is allowed)
    if (!url || !url.trim()) {
        return {
            isValid: true,
            isAccessible: true, // No URL means no validation needed
        };
    }

    const result = await checkUrlAccessibility(url);
    
    if (!result.isAccessible) {
        logger.debug("URL validation failed", {
            url,
            error: result.error,
            finalUrl: result.finalUrl,
        });
    }

    return result;
}

