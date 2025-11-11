/**
 * Configuration constants for keyword generation pipeline
 */

// Batch processing configuration
export const CONCURRENT_BATCH_SIZE = parseInt(process.env.CONCURRENT_BATCH_SIZE || '30', 10);
export const SEED_TIMEOUT_MS = parseInt(process.env.SEED_TIMEOUT_MS || '60000', 10);
export const TARGET_KEYWORD_COUNT = parseInt(process.env.TARGET_KEYWORD_COUNT || '1000', 10);
export const KEYWORDS_PER_SEED = parseInt(process.env.KEYWORDS_PER_SEED || '50', 10);

// Progress saving configuration
export const SAVE_INTERVAL_MS = parseInt(process.env.SAVE_INTERVAL_MS || '10000', 10);
export const SAVE_KEYWORD_INTERVAL = parseInt(process.env.SAVE_KEYWORD_INTERVAL || '50', 10);
export const PROGRESS_CHECKPOINT_INTERVAL_MS = parseInt(process.env.PROGRESS_CHECKPOINT_INTERVAL_MS || '30000', 10);
export const PROGRESS_CHECKPOINT_KEYWORD_INTERVAL = parseInt(process.env.PROGRESS_CHECKPOINT_KEYWORD_INTERVAL || '100', 10);

// Memory management configuration
export const MAX_KEYWORDS_IN_MEMORY = parseInt(process.env.MAX_KEYWORDS_IN_MEMORY || '1200', 10);
export const PROGRESS_UPDATE_BATCH_SIZE = parseInt(process.env.PROGRESS_UPDATE_BATCH_SIZE || '200', 10);
export const MEMORY_FLUSH_THRESHOLD = parseInt(process.env.MEMORY_FLUSH_THRESHOLD || '2000', 10);

// Progress callback throttling
export const PROGRESS_CALLBACK_THROTTLE_MS = parseInt(process.env.PROGRESS_CALLBACK_THROTTLE_MS || '1000', 10);

// Similarity calculation configuration
export const SIMILARITY_BATCH_SIZE = parseInt(process.env.SIMILARITY_BATCH_SIZE || '100', 10);
// Lowered from 1.05 to 1.02 to 1.01 to allow similarity calculation when slightly over target
export const SIMILARITY_THRESHOLD_MULTIPLIER = parseFloat(process.env.SIMILARITY_THRESHOLD_MULTIPLIER || '1.01', 10);

// Retry configuration
export const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10);
export const RETRY_INITIAL_DELAY_MS = parseInt(process.env.RETRY_INITIAL_DELAY_MS || '1000', 10);
export const RETRY_MAX_DELAY_MS = parseInt(process.env.RETRY_MAX_DELAY_MS || '10000', 10);

// DataForSEO polling configuration
export const DATAFORSEO_MAX_POLL_ATTEMPTS = parseInt(process.env.DATAFORSEO_MAX_POLL_ATTEMPTS || '60', 10);
export const DATAFORSEO_POLL_INTERVAL_MS = parseInt(process.env.DATAFORSEO_POLL_INTERVAL_MS || '5000', 10);

