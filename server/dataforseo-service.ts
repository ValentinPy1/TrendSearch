/**
 * DataForSEO API Service
 * 
 * Handles API calls to DataForSEO for fetching keyword search volume metrics
 */

export interface DataForSEORequest {
    date_from: string;
    date_to: string;
    keywords: string[];
    sort_by?: string;
}

export interface DataForSEOMonthlySearch {
    year: number;
    month: number;
    search_volume: number;
}

export interface DataForSEOKeywordResult {
    keyword: string;
    spell: string | null;
    location_code: number;
    language_code: string;
    search_partners: boolean;
    competition: string;
    competition_index: number;
    search_volume: number;
    low_top_of_page_bid: number;
    high_top_of_page_bid: number;
    cpc: number;
    monthly_searches: DataForSEOMonthlySearch[];
}

export interface DataForSEOTask {
    id: string;
    status_code: number;
    status_message: string;
    time: string;
    cost: number;
    result_count: number;
    path: string[];
    data: {
        api: string;
        function: string;
        se: string;
        language_code: string;
        location_code: number;
        keywords: string[];
        date_from: string;
    };
    result: DataForSEOKeywordResult[];
}

export interface DataForSEOResponse {
    version: string;
    status_code: number;
    status_message: string;
    time: string;
    cost: number;
    tasks_count: number;
    tasks_error: number;
    tasks: DataForSEOTask[];
}

/**
 * Fetch keyword metrics from DataForSEO API
 * 
 * @param keywords - Array of keywords to fetch data for (max 1000)
 * @param dateFrom - Start date in YYYY-MM-DD format
 * @param dateTo - End date in YYYY-MM-DD format
 * @returns Promise with API response
 */
export async function fetchKeywordMetrics(
    keywords: string[],
    dateFrom: string,
    dateTo: string
): Promise<DataForSEOResponse> {
    const apiUrl = "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";
    const credB64 = process.env.DATA_FOR_SEO_CRED_B64;

    if (!credB64) {
        throw new Error("DATA_FOR_SEO_CRED_B64 environment variable is not set");
    }

    if (keywords.length > 1000) {
        throw new Error("Maximum 1000 keywords allowed per request");
    }

    const requestBody: DataForSEORequest[] = [{
        date_from: dateFrom,
        date_to: dateTo,
        keywords: keywords,
        sort_by: "relevance"
    }];

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Authorization": `Basic ${credB64}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DataForSEO API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data: DataForSEOResponse = await response.json();

    // Check for API-level errors
    if (data.status_code !== 20000) {
        throw new Error(`DataForSEO API error: ${data.status_message} (code: ${data.status_code})`);
    }

    // Check for task-level errors
    if (data.tasks_error > 0) {
        const errorMessages = data.tasks
            .filter(task => task.status_code !== 20000)
            .map(task => `${task.status_message} (code: ${task.status_code})`)
            .join(", ");
        throw new Error(`DataForSEO task errors: ${errorMessages}`);
    }

    return data;
}

