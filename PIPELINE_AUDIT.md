# Keyword Generation Pipeline Audit - Multiple Websites

## Overview
The keyword generation pipeline supports accumulating keywords from multiple source websites within a single project. Each keyword tracks which website(s) it originated from, allowing users to filter and analyze keywords by source.

## Entry Point

**Endpoint:** `POST /api/custom-search/find-keywords-from-website`

**Parameters:**
- `projectId` (required): The project to add keywords to
- `target` (required for new pipelines): Website URL to extract keywords from
- `location_code` (optional): Geographic location code (defaults to 2840 = US)
- `location_name` (optional): Geographic location name
- `resume` (optional): Whether to resume an existing pipeline

## Pipeline Flow

### Phase 1: Initialization & Validation

1. **Project Loading** (`executeWebsiteKeywordPipeline`)
   - Loads project from database
   - Retrieves existing `keywordGenerationProgress` state
   - Initializes `targetToUse` early (from `target` parameter or saved progress)

2. **State Check**
   - Determines if resuming (`isResuming`) based on:
     - Explicit `resume` flag, OR
     - Existing progress with stage not 'complete' or 'error'
   - Validates `target` is provided if not resuming

3. **Website Normalization**
   - Normalizes website URL using `normalizeWebsite()`:
     - Adds `https://` if missing
     - Extracts hostname
     - Removes `www.` prefix
     - Converts to lowercase
   - Example: `www.Example.com` → `example.com`

4. **Website Difference Check** (Key for Multiple Websites)
   ```typescript
   // Lines 3803-3824
   if (normalizedTarget && hasKeywords) {
       const existingKeywords = await storage.getProjectKeywords(projectId);
       const existingSourceWebsites = new Set<string>();
       existingKeywords.forEach((kw: any) => {
           if (kw.sourceWebsites && Array.isArray(kw.sourceWebsites)) {
               kw.sourceWebsites.forEach((site: string) => existingSourceWebsites.add(site));
           }
       });
       isDifferentWebsite = !existingSourceWebsites.has(normalizedTarget);
   }
   ```
   - Checks if the normalized website has already been processed
   - If same website AND all steps complete → skip pipeline (return early)
   - If different website → proceed to fetch new keywords

5. **Report Reset** (for new pipelines on projects with existing reports)
   - If starting new pipeline (`!isResuming`) AND report exists:
     - Resets `reportGenerated: false`
     - Sets `currentStage: 'creating-task'`
     - This ensures progress steps are visible in UI

### Phase 2: Keyword Extraction

**Condition:** `if (!hasKeywords || isDifferentWebsite)`

1. **DataForSEO API Call**
   - Calls `getKeywordsForSiteLive(targetToUse, locationCode, locationName, dateFrom, dateTo)`
   - Date range: Last 4 years from today
   - Returns array of keyword results with metrics

2. **Keyword Extraction**
   - Extracts keyword strings from API results
   - Filters out empty/invalid keywords
   - Saves to progress:
     ```typescript
     await saveProgress({
         currentStage: 'extracting-keywords',
         newKeywords: finalKeywords,
         dataForSEOSiteResults: siteResults,
         keywordsGenerated: finalKeywords.length,
         newKeywordsCollected: finalKeywords.length
     });
     ```

3. **Stage Transition**
   - If metrics not fetched yet → transitions to `'fetching-dataforseo'`

### Phase 3: DataForSEO Metrics Processing

**Condition:** `if (!hasDataForSEOMetrics && finalKeywords.length > 0)`

1. **In-Memory Processing**
   - Processes `siteResults` using `processDataForSEOResults()`
   - Extracts: volume, competition, CPC, topPageBid, monthlyData
   - Creates `processedKeywordsToInsert` array
   - **No database writes yet** - all in memory for speed

2. **Progress Update**
   - Sets `currentStage: 'fetching-dataforseo'`
   - Stores processed data in memory variables

### Phase 4: Report Generation

**Condition:** `if (!hasReport)` OR `if (hasReport && isDifferentWebsite)`

1. **Keyword Collection for Report**
   - If just processed: Uses in-memory `processedKeywordsToInsert`
   - Otherwise: Loads from database via `storage.getProjectKeywords(projectId)`
   - **Important:** Loads ALL keywords from project (accumulated from all websites)

2. **Source Websites Mapping**
   ```typescript
   // Lines 4213-4223
   const allKeywordsFromDb = await storage.getProjectKeywords(projectId);
   const keywordToSourceWebsitesMap = new Map<string, string[]>();
   allKeywordsFromDb.forEach((kw: any) => {
       keywordToSourceWebsitesMap.set(kw.keyword.toLowerCase(), kw.sourceWebsites || []);
   });
   keywordsForReport = keywordsForReport.map(kw => ({
       ...kw,
       sourceWebsites: keywordToSourceWebsitesMap.get(kw.keyword.toLowerCase()) || []
   }));
   ```
   - Maps each keyword to its source websites array
   - Ensures report includes `sourceWebsites` for filtering

3. **Report Generation**
   - Calls `generateReportData()` with all keywords
   - Calculates similarity scores, opportunity scores, aggregated metrics
   - Returns report with keywords including `sourceWebsites`

4. **Report Regeneration** (when adding keywords to existing report)
   ```typescript
   // Lines 4286-4330
   if (hasReport) {
       // Regenerate report with ALL keywords (including newly added ones)
       const allKeywords = await storage.getProjectKeywords(projectId);
       const keywordsWithData = allKeywords.filter(/* has metrics */);
       const reportData = await generateReportData(/* all keywords */);
   }
   ```
   - If report already exists → regenerates with ALL keywords
   - Ensures new keywords from new website are included

5. **Progress Update**
   - Sets `currentStage: 'complete'`
   - Sets `reportGenerated: true`

### Phase 5: Database Persistence (Background)

**Condition:** `if (!hasDataForSEOMetrics && processedKeywordsToInsert.length > 0)`

1. **Save Keywords to Database** (Background async)
   ```typescript
   // Lines 4343-4352
   await saveKeywordsToProject(
       processedKeywordsToInsert,
       finalKeywords,
       projectId,
       project.pitch || '',
       storage,
       keywordVectorService,
       targetToUse // ← sourceWebsite parameter
   );
   ```
   - Saves keywords to `globalKeywords` table
   - Links keywords to project via `customSearchProjectKeywords` table
   - **Key:** Passes `targetToUse` as `sourceWebsite` parameter

2. **Keyword Accumulation Logic** (`saveKeywordsToProject`)
   ```typescript
   // keyword-processing-service.ts lines 203-252
   const existingLinks = await storage.getProjectKeywords(projectId);
   const existingLinkMap = new Map();
   
   for (const keywordText of allKeywordsToLink) {
       const existingLink = existingLinkMap.get(keywordId);
       
       if (existingLink) {
           // Keyword already linked - update sourceWebsites
           if (normalizedSourceWebsite) {
               const currentSourceWebsites = existingLink.sourceWebsites || [];
               if (!currentSourceWebsites.includes(normalizedSourceWebsite)) {
                   // Add new source website to array
                   const updatedSourceWebsites = [...currentSourceWebsites, normalizedSourceWebsite];
                   keywordsToUpdate.push({ keywordId, sourceWebsites: updatedSourceWebsites });
               }
           }
       } else {
           // New keyword link - create with sourceWebsite
           keywordIdsToLink.push(keywordId);
           // ... similarity calculation ...
       }
   }
   
   // Create new links with sourceWebsite
   await storage.linkKeywordsToProject(
       projectId,
       keywordIdsToLink,
       similarityScoresToLink,
       normalizedSourceWebsite ? [normalizedSourceWebsite] : []
   );
   
   // Update existing links with new sourceWebsite
   for (const update of keywordsToUpdate) {
       await storage.updateKeywordLinkSourceWebsites(
           projectId,
           update.keywordId,
           update.sourceWebsites
       );
   }
   ```
   - **New keywords:** Created with `sourceWebsites: [normalizedSourceWebsite]`
   - **Existing keywords:** Updated to append new source website to array
   - **Result:** Keywords accumulate source websites as more websites are processed

3. **Metrics Computation** (Background, after keywords saved)
   - Computes growth metrics (YoY, 3M), volatility, trend strength, opportunity score
   - Saves to database in batches
   - Updates `metricsComputed: true` when complete

## Key Mechanisms for Multiple Websites

### 1. Website Normalization
- Ensures consistent comparison: `www.example.com` = `example.com` = `https://example.com`
- Prevents duplicate processing of same website

### 2. Source Website Tracking
- Stored in `customSearchProjectKeywords.sourceWebsites` (JSONB array)
- Each keyword can have multiple source websites
- Example: Keyword "video editing" might have `sourceWebsites: ["example.com", "competitor.com"]`

### 3. Keyword Accumulation
- **New keywords:** Added to project with single source website
- **Existing keywords:** Source website appended to existing array
- **No duplicates:** Same keyword from same website won't be added twice

### 4. Report Regeneration
- When adding keywords from new website to project with existing report:
  - Report is regenerated with ALL keywords (old + new)
  - Ensures new keywords appear in report
  - Preserves existing keywords and their source websites

### 5. Skip Logic
- If same website already processed AND all steps complete → skip entire pipeline
- If different website → proceed even if report exists
- If same website but incomplete → resume from where it left off

## Database Schema

### `customSearchProjectKeywords` Table
```sql
- id: UUID (primary key)
- customSearchProjectId: UUID (foreign key to project)
- globalKeywordId: UUID (foreign key to keyword)
- similarityScore: DECIMAL
- sourceWebsites: JSONB (array of strings) ← KEY FIELD
- createdAt: TIMESTAMP
```

### Example Data
```json
{
  "id": "123",
  "customSearchProjectId": "project-1",
  "globalKeywordId": "keyword-1",
  "similarityScore": 0.85,
  "sourceWebsites": ["example.com", "competitor.com"],
  "createdAt": "2025-01-01T00:00:00Z"
}
```

## State Management

### Progress States (`keywordGenerationProgress`)
- `creating-task`: Initial stage
- `extracting-keywords`: Keywords extracted from API
- `fetching-dataforseo`: Processing DataForSEO metrics
- `generating-report`: Generating final report
- `complete`: Pipeline complete
- `error`: Error occurred

### Flags
- `hasKeywords`: Keywords extracted
- `hasDataForSEOResults`: API results available
- `hasDataForSEOMetrics`: Metrics processed
- `hasReport`: Report generated
- `isDifferentWebsite`: Website not previously processed

## Error Handling

1. **Early Errors** (before `targetToUse` initialized)
   - `targetToUse` initialized early to prevent ReferenceError in catch blocks

2. **Validation Errors**
   - Missing target → Error saved to progress, pipeline stops
   - No keywords found → Error saved, detailed message provided

3. **API Errors**
   - DataForSEO API failures → Error saved, pipeline stops
   - Database save failures → Logged but don't stop pipeline

## Performance Optimizations

1. **In-Memory Processing First**
   - Process DataForSEO metrics in memory before database save
   - Generate report from in-memory data for immediate display

2. **Background Database Operations**
   - Keywords saved to database in background (non-blocking)
   - Metrics computed in background after keywords saved
   - User sees report immediately while database operations continue

3. **Batch Processing**
   - Metrics computed in batches of 50 keywords
   - Retry logic for failed batches

## Frontend Integration

1. **Source Website Filtering**
   - Frontend displays unique source websites above keywords table
   - Users can select/deselect websites to filter keywords
   - Filter applied before sorting/pagination

2. **Progress Display**
   - Shows current stage and elapsed time
   - Displays loading indicators during processing
   - Shows "Loading report..." after report generation stage

3. **Auto-Resume**
   - Detects incomplete pipelines on page load
   - Automatically resumes pipeline execution
   - Polls for status updates every 2 seconds

## Example Flow: Adding Second Website

**Scenario:** Project already has keywords from `example.com`, user adds `competitor.com`

1. **Request:** `POST /api/custom-search/find-keywords-from-website`
   - `projectId: "project-1"`
   - `target: "competitor.com"`

2. **Pipeline Execution:**
   - Normalizes: `competitor.com`
   - Checks existing source websites: `["example.com"]`
   - Determines: `isDifferentWebsite = true`
   - Resets `reportGenerated: false` (to show progress)

3. **Keyword Extraction:**
   - Fetches keywords from `competitor.com`
   - Extracts 500 keywords
   - Saves to progress

4. **Metrics Processing:**
   - Processes DataForSEO metrics in memory
   - Prepares for database save

5. **Report Generation:**
   - Loads ALL keywords from project (from both websites)
   - Regenerates report with all keywords
   - Each keyword includes its `sourceWebsites` array

6. **Database Save (Background):**
   - Saves new keywords with `sourceWebsites: ["competitor.com"]`
   - Updates existing keywords: `sourceWebsites: ["example.com", "competitor.com"]`
   - Computes metrics in background

7. **Result:**
   - Project now has keywords from both websites
   - Report shows all keywords with source website tags
   - Users can filter by source website in UI

## Summary

The pipeline supports multiple websites through:
1. **Normalized website comparison** to detect duplicates
2. **Source website tracking** in database (JSONB array)
3. **Keyword accumulation** (append source websites to existing keywords)
4. **Report regeneration** with all keywords when new website added
5. **Background persistence** for performance
6. **State management** to track progress and prevent duplicate work

This design allows users to build comprehensive keyword sets from multiple competitor websites while maintaining clear attribution of where each keyword originated.

