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

// Keywords for Site API interfaces
export interface KeywordsForSiteRequest {
    target: string;
    location_code?: number;
    location_name?: string;
    language_code?: string;
    language_name?: string;
    tag?: string;
    pingback_url?: string;
    postback_url?: string;
}

export interface KeywordsForSiteKeywordResult {
    keyword: string;
    spell: string | null;
    location_code: number;
    language_code: string;
    search_partners: boolean;
    competition: string | null;
    competition_index: number | null;
    search_volume: number | null;
    low_top_of_page_bid: number | null;
    high_top_of_page_bid: number | null;
    cpc: number | null;
    monthly_searches: DataForSEOMonthlySearch[];
}

export interface KeywordsForSiteTask {
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
        location_code?: number;
        location_name?: string;
        language_code?: string;
        language_name?: string;
        target: string;
        tag?: string;
        pingback_url?: string;
        postback_url?: string;
    };
    result: KeywordsForSiteKeywordResult[] | null;
}

export interface KeywordsForSiteTaskPostResponse {
    version: string;
    status_code: number;
    status_message: string;
    time: string;
    cost: number;
    tasks_count: number;
    tasks_error: number;
    tasks: KeywordsForSiteTask[];
}

export interface KeywordsForSiteTaskGetResponse {
    version: string;
    status_code: number;
    status_message: string;
    time: string;
    cost: number;
    tasks_count: number;
    tasks_error: number;
    tasks: KeywordsForSiteTask[];
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

/**
 * Create a task to find keywords for a website using DataForSEO API
 * 
 * @param target - Website URL/domain (e.g., "dataforseo.com")
 * @param locationCode - Location code (default: 2840 for US)
 * @param locationName - Location name (optional, e.g., "United States")
 * @returns Promise with task ID
 */
export async function createKeywordsForSiteTask(
    target: string,
    locationCode: number = 2840,
    locationName?: string
): Promise<string> {
    const apiUrl = "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_site/task_post";
    const credB64 = process.env.DATA_FOR_SEO_CRED_B64;

    if (!credB64) {
        throw new Error("DATA_FOR_SEO_CRED_B64 environment variable is not set");
    }

    const requestBody: KeywordsForSiteRequest[] = [{
        target: target,
        location_code: locationCode,
        ...(locationName && { location_name: locationName })
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

    const data: KeywordsForSiteTaskPostResponse = await response.json();

    // Check for API-level errors
    if (data.status_code !== 20000) {
        throw new Error(`DataForSEO API error: ${data.status_message} (code: ${data.status_code})`);
    }

    // Check for task-level errors
    if (data.tasks_error > 0 || !data.tasks || data.tasks.length === 0) {
        const errorMessages = data.tasks
            ?.filter(task => task.status_code !== 20100 && task.status_code !== 20000)
            .map(task => `${task.status_message} (code: ${task.status_code})`)
            .join(", ") || "No tasks returned";
        throw new Error(`DataForSEO task errors: ${errorMessages}`);
    }

    const task = data.tasks[0];
    
    // Check if task was created successfully (20100 = Task Created)
    if (task.status_code !== 20100 && task.status_code !== 20000) {
        throw new Error(`Failed to create task: ${task.status_message} (code: ${task.status_code})`);
    }

    if (!task.id) {
        throw new Error("Task ID not found in response");
    }

    return task.id;
}

/**
 * Get keywords for site task results by polling until complete
 * 
 * @param taskId - Task ID from createKeywordsForSiteTask
 * @param maxPollAttempts - Maximum number of polling attempts (default: 60)
 * @param pollIntervalMs - Polling interval in milliseconds (default: 5000 = 5 seconds)
 * @returns Promise with array of keyword strings
 */
export async function getKeywordsForSiteTask(
    taskId: string,
    maxPollAttempts: number = 60,
    pollIntervalMs: number = 5000
): Promise<string[]> {
    const apiUrl = `https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_site/task_get/${taskId}`;
    const credB64 = process.env.DATA_FOR_SEO_CRED_B64;

    if (!credB64) {
        throw new Error("DATA_FOR_SEO_CRED_B64 environment variable is not set");
    }

    let attempts = 0;

    while (attempts < maxPollAttempts) {
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                "Authorization": `Basic ${credB64}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DataForSEO API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: KeywordsForSiteTaskGetResponse = await response.json();

        // Check for API-level errors
        if (data.status_code !== 20000) {
            throw new Error(`DataForSEO API error: ${data.status_message} (code: ${data.status_code})`);
        }

        if (!data.tasks || data.tasks.length === 0) {
            throw new Error("No tasks found in response");
        }

        const task = data.tasks[0];

        // Check task status
        // 20000 = Ok (task completed)
        // 20100 = Task Created (still processing)
        // 20200 = Task in progress
        if (task.status_code === 20000 && task.result && task.result.length > 0) {
            // Task completed successfully, extract keywords
            const keywords = task.result
                .map(result => result.keyword)
                .filter(keyword => keyword && keyword.trim().length > 0);
            
            return keywords;
        } else if (task.status_code === 20100 || task.status_code === 20200) {
            // Task still processing, wait and poll again
            attempts++;
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
            continue;
        } else {
            // Task failed or error
            throw new Error(`Task failed: ${task.status_message} (code: ${task.status_code})`);
        }
    }

    throw new Error(`Task did not complete within ${maxPollAttempts} attempts (${(maxPollAttempts * pollIntervalMs) / 1000} seconds)`);
}

// Keywords for Keywords API interfaces
export interface KeywordsForKeywordsRequest {
    keywords: string[];
    location_code?: number;
    location_name?: string;
    language_code?: string;
    language_name?: string;
    tag?: string;
    pingback_url?: string;
    postback_url?: string;
}

export interface KeywordsForKeywordsKeywordResult {
    keyword: string;
    spell: string | null;
    location_code: number;
    language_code: string;
    search_partners: boolean;
    competition: string | null;
    competition_index: number | null;
    search_volume: number | null;
    low_top_of_page_bid: number | null;
    high_top_of_page_bid: number | null;
    cpc: number | null;
    monthly_searches: DataForSEOMonthlySearch[];
}

export interface KeywordsForKeywordsTask {
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
    };
    result: KeywordsForKeywordsKeywordResult[];
}

export interface KeywordsForKeywordsTaskPostResponse {
    version: string;
    status_code: number;
    status_message: string;
    time: string;
    cost: number;
    tasks_count: number;
    tasks_error: number;
    tasks: KeywordsForKeywordsTask[];
}

export interface KeywordsForKeywordsTaskGetResponse {
    version: string;
    status_code: number;
    status_message: string;
    time: string;
    cost: number;
    tasks_count: number;
    tasks_error: number;
    tasks: KeywordsForKeywordsTask[];
}

/**
 * Create a task to find keywords for keywords using DataForSEO API
 * 
 * @param keywords - Array of 1-20 keywords to find related keywords for
 * @param locationCode - Location code (default: 2840 for US)
 * @param locationName - Location name (optional, e.g., "United States")
 * @returns Promise with task ID
 */
export async function createKeywordsForKeywordsTask(
    keywords: string[],
    locationCode: number = 2840,
    locationName?: string
): Promise<string> {
    if (!keywords || keywords.length === 0 || keywords.length > 20) {
        throw new Error("Keywords array must contain 1-20 keywords");
    }

    const apiUrl = "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/task_post";
    const credB64 = process.env.DATA_FOR_SEO_CRED_B64;

    if (!credB64) {
        throw new Error("DATA_FOR_SEO_CRED_B64 environment variable is not set");
    }

    const requestBody: KeywordsForKeywordsRequest[] = [{
        keywords: keywords,
        location_code: locationCode,
        ...(locationName && { location_name: locationName })
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

    const data: KeywordsForKeywordsTaskPostResponse = await response.json();

    // Check for API-level errors
    if (data.status_code !== 20000) {
        throw new Error(`DataForSEO API error: ${data.status_message} (code: ${data.status_code})`);
    }

    // Check for task-level errors
    if (data.tasks_error > 0 || !data.tasks || data.tasks.length === 0) {
        const errorMessages = data.tasks
            ?.filter(task => task.status_code !== 20100 && task.status_code !== 20000)
            .map(task => `${task.status_message} (code: ${task.status_code})`)
            .join(", ") || "No tasks returned";
        throw new Error(`DataForSEO task errors: ${errorMessages}`);
    }

    const task = data.tasks[0];
    
    // Check if task was created successfully (20100 = Task Created)
    if (task.status_code !== 20100 && task.status_code !== 20000) {
        throw new Error(`Failed to create task: ${task.status_message} (code: ${task.status_code})`);
    }

    if (!task.id) {
        throw new Error("Task ID not found in response");
    }

    return task.id;
}

/**
 * Get keywords for keywords task results by polling until complete
 * 
 * @param taskId - Task ID from createKeywordsForKeywordsTask
 * @param maxPollAttempts - Maximum number of polling attempts (default: 60)
 * @param pollIntervalMs - Polling interval in milliseconds (default: 5000 = 5 seconds)
 * @returns Promise with array of keyword results
 */
export async function getKeywordsForKeywordsTask(
    taskId: string,
    maxPollAttempts: number = 60,
    pollIntervalMs: number = 5000
): Promise<KeywordsForKeywordsKeywordResult[]> {
    const apiUrl = `https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/task_get/${taskId}`;
    const credB64 = process.env.DATA_FOR_SEO_CRED_B64;

    if (!credB64) {
        throw new Error("DATA_FOR_SEO_CRED_B64 environment variable is not set");
    }

    let attempts = 0;

    while (attempts < maxPollAttempts) {
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                "Authorization": `Basic ${credB64}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DataForSEO API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: KeywordsForKeywordsTaskGetResponse = await response.json();

        // Check for API-level errors
        if (data.status_code !== 20000) {
            throw new Error(`DataForSEO API error: ${data.status_message} (code: ${data.status_code})`);
        }

        if (!data.tasks || data.tasks.length === 0) {
            throw new Error("No tasks found in response");
        }

        const task = data.tasks[0];

        // Check task status
        // 20000 = Ok (task completed)
        // 20100 = Task Created (still processing)
        // 20200 = Task in progress
        if (task.status_code === 20000 && task.result && task.result.length > 0) {
            // Task completed successfully, return keyword results
            return task.result;
        } else if (task.status_code === 20100 || task.status_code === 20200) {
            // Task still processing, wait and poll again
            attempts++;
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
            continue;
        } else {
            // Task failed or error
            throw new Error(`Task failed: ${task.status_message} (code: ${task.status_code})`);
        }
    }

    throw new Error(`Task did not complete within ${maxPollAttempts} attempts (${(maxPollAttempts * pollIntervalMs) / 1000} seconds)`);
}

