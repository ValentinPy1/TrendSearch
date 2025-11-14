import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { IdeaGenerator } from "@/components/idea-generator";
import { MetricsCards } from "@/components/metrics-cards";
import { AverageTrendChart } from "@/components/average-trend-chart";
import { TrendChart } from "@/components/trend-chart";
import { KeywordsTable } from "@/components/keywords-table";
import { KeywordMetricsCards } from "@/components/keyword-metrics-cards";
import { IdeaHistory } from "@/components/idea-history";
import { Button } from "@/components/ui/button";
import { GlassmorphicCard } from "@/components/glassmorphic-card";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
} from "@/components/ui/dialog";
import { LogOut, Loader2, HelpCircle, Sparkles, Coins } from "lucide-react";
import type { IdeaWithReport } from "@shared/schema";
import logoImage from "@assets/image_1761146000585.png";
import { KeywordFilter } from "@/components/keyword-filters";
import { usePaymentStatus } from "@/hooks/use-payment-status";
import { PaywallModal } from "@/components/paywall-modal";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DashboardProps {
    user: { id: string; email: string };
    onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
    const [selectedIdea, setSelectedIdea] = useState<IdeaWithReport | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);
    const { data: paymentStatus } = usePaymentStatus();
    const hasPaid = paymentStatus?.hasPaid ?? false;
    const credits = paymentStatus?.credits ?? 0;
    const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [searchKeyword, setSearchKeyword] = useState<string | null>(null);
    const [displayedKeywordCount, setDisplayedKeywordCount] = useState(10);
    const [excludedKeywordIds, setExcludedKeywordIds] = useState<Set<string>>(
        new Set(),
    );
    const [showNoMoreFilteredDialog, setShowNoMoreFilteredDialog] = useState(false);
    const [pendingLoadMoreWithoutFilters, setPendingLoadMoreWithoutFilters] = useState<{
        reportId: string;
        ideaText: string;
    } | null>(null);
    const [activeTab, setActiveTab] = useState("standard");

    // Track manually loaded keywords to prevent them from being overwritten
    const manuallyLoadedKeywordsRef = useRef<Map<string, Set<string>>>(new Map());
    // Track if filters are currently applied to prevent overwriting filtered keywords
    const hasActiveFiltersRef = useRef<Map<string, boolean>>(new Map());

    // Note: State is preserved when switching tabs. Results are conditionally rendered
    // based on activeTab, so standard search results won't show on custom tab and vice versa.

    // Get filters from localStorage (same place IdeaGenerator stores them)
    const getFiltersFromStorage = (): KeywordFilter[] => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('keyword-filters');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        return parsed;
                    }
                } catch (e) {
                    // Invalid JSON, use empty array
                }
            }
        }
        return [];
    };

    const {
        data: ideas,
        isLoading,
        error,
        refetch,
    } = useQuery<IdeaWithReport[]>({
        queryKey: ["/api/ideas"],
    });

    const loadMoreKeywordsMutation = useMutation({
        mutationFn: async (data: { reportId: string; filters?: KeywordFilter[] }) => {
            const response = await apiRequest(
                "POST",
                `/api/reports/${data.reportId}/load-more`,
                {
                    filters: data.filters?.map(({ id, ...rest }) => rest) || [],
                    existingKeywords: selectedIdea?.report?.keywords?.map(k => ({ keyword: k.keyword })) || [],
                },
            );
            return response.json();
        },
        onSuccess: (result) => {
            if (result.noMoreFiltered) {
                // Show dialog asking if user wants to load without filters
                setShowNoMoreFilteredDialog(true);
            } else if (result.keywords && selectedIdea?.report) {
                // Merge new keywords into existing state
                const newKeywords = result.keywords.map((kw: any) => ({
                    ...kw,
                    id: kw.id || `temp-${Date.now()}-${Math.random()}`, // Generate temp ID if not present
                }));

                // Merge with existing keywords, avoiding duplicates
                const existingKeywordSet = new Set(selectedIdea.report.keywords.map(k => k.keyword));
                const uniqueNewKeywords = newKeywords.filter((kw: any) => !existingKeywordSet.has(kw.keyword));

                // Only update state if we got new keywords
                if (uniqueNewKeywords.length > 0) {
                    const updatedKeywords = [...selectedIdea.report.keywords, ...uniqueNewKeywords];

                    // Track manually loaded keywords for this report
                    if (!manuallyLoadedKeywordsRef.current.has(selectedIdea.report.id)) {
                        manuallyLoadedKeywordsRef.current.set(selectedIdea.report.id, new Set());
                    }
                    const loadedSet = manuallyLoadedKeywordsRef.current.get(selectedIdea.report.id)!;
                    uniqueNewKeywords.forEach(kw => loadedSet.add(kw.keyword));

                    setSelectedIdea({
                        ...selectedIdea,
                        report: {
                            ...selectedIdea.report,
                            keywords: updatedKeywords,
                        },
                    });

                    // Update displayed count AFTER successfully merging keywords
                    setDisplayedKeywordCount(prev => prev + uniqueNewKeywords.length);
                }
            } else {
                // Fallback: invalidate query if result format is unexpected
                queryClient.invalidateQueries({ queryKey: ["/api/ideas"] });
            }
        },
        onError: (error) => {
            console.error("Error loading more keywords:", error);
            // Don't update displayedKeywordCount on error - keep current state
        },
    });

    const loadWithoutFiltersMutation = useMutation({
        mutationFn: async (data: { reportId: string; ideaText: string }) => {
            const response = await apiRequest(
                "POST",
                `/api/reports/${data.reportId}/load-more`,
                {
                    filters: [], // Load without filters
                    existingKeywords: selectedIdea?.report?.keywords?.map(k => ({ keyword: k.keyword })) || [],
                },
            );
            return response.json();
        },
        onSuccess: (result) => {
            if (result.keywords && selectedIdea?.report) {
                // Merge new unfiltered keywords into existing state
                const newKeywords = result.keywords.map((kw: any) => ({
                    ...kw,
                    id: kw.id || `temp-${Date.now()}-${Math.random()}`,
                }));

                // Merge with existing keywords, avoiding duplicates
                const existingKeywordSet = new Set(selectedIdea.report.keywords.map(k => k.keyword));
                const uniqueNewKeywords = newKeywords.filter((kw: any) => !existingKeywordSet.has(kw.keyword));

                if (uniqueNewKeywords.length > 0) {
                    // Clear filter flag since we're loading without filters
                    if (selectedIdea.report.id) {
                        hasActiveFiltersRef.current.delete(selectedIdea.report.id);
                    }

                    // Merge unfiltered keywords with existing keywords
                    setSelectedIdea({
                        ...selectedIdea,
                        report: {
                            ...selectedIdea.report,
                            keywords: [...selectedIdea.report.keywords, ...uniqueNewKeywords],
                        },
                    });

                    // Update displayed count
                    setDisplayedKeywordCount(prev => prev + uniqueNewKeywords.length);
                }
            }
            setShowNoMoreFilteredDialog(false);
            setPendingLoadMoreWithoutFilters(null);
        },
        onError: (error) => {
            console.error("Error loading keywords without filters:", error);
        },
    });

    const handleDeleteKeyword = (keywordId: string) => {
        // Remove keyword from view (frontend-only, doesn't delete from database)
        setExcludedKeywordIds((prev) => new Set([...Array.from(prev), keywordId]));

        // If the deleted keyword was selected, select the first non-excluded keyword
        if (selectedIdea?.report?.keywords) {
            // Create new excluded set for immediate use (state update is async)
            const newExcludedIds = new Set([
                ...Array.from(excludedKeywordIds),
                keywordId,
            ]);

            const remainingVisibleKeywords = selectedIdea.report.keywords.filter(
                (k) => !newExcludedIds.has(k.id),
            );

            if (selectedKeyword) {
                const currentKeywordExcluded =
                    selectedIdea.report.keywords.find(
                        (k) => k.keyword === selectedKeyword,
                    )?.id === keywordId;

                if (currentKeywordExcluded && remainingVisibleKeywords.length > 0) {
                    setSelectedKeyword(remainingVisibleKeywords[0].keyword);
                } else if (currentKeywordExcluded) {
                    setSelectedKeyword(null);
                }
            }
        }
    };

    const handleLoadMore = () => {
        if (!selectedIdea?.report) return;

        const totalKeywords = selectedIdea.report.keywords.length;
        const newDisplayCount = displayedKeywordCount + 5;

        // If we're within 5 of running out, preload 5 more in background
        // Don't update displayedKeywordCount until keywords are successfully loaded
        if (newDisplayCount >= totalKeywords - 5) {
            const filters = getFiltersFromStorage();
            loadMoreKeywordsMutation.mutate({
                reportId: selectedIdea.report.id,
                filters,
            });
            // Store idea text for potential load without filters
            if (selectedIdea.generatedIdea) {
                setPendingLoadMoreWithoutFilters({
                    reportId: selectedIdea.report.id,
                    ideaText: selectedIdea.generatedIdea,
                });
            }
        } else {
            // If we have enough keywords already loaded, just show more
            setDisplayedKeywordCount(newDisplayCount);
        }
    };

    // Update selected idea with latest data (but don't auto-select on initial load)
    // IMPORTANT: Preserve manually loaded keywords and filtered keywords when updating from query
    useEffect(() => {
        if (ideas && ideas.length > 0 && selectedIdea) {
            // Only update if there's already a selected idea
            const updated = ideas.find((i) => i.id === selectedIdea.id);
            if (updated) {
                // Check if we have manually loaded keywords for this report
                const manuallyLoadedSet = manuallyLoadedKeywordsRef.current.get(selectedIdea.report?.id || '');
                const hasActiveFilters = hasActiveFiltersRef.current.get(selectedIdea.report?.id || '');
                const currentKeywords = selectedIdea.report?.keywords || [];
                const updatedKeywords = updated.report?.keywords || [];

                // Check if current keywords are different from updated keywords (might be filtered)
                // If they're different, we should preserve the current ones
                const currentKeywordSet = new Set(currentKeywords.map(k => k.keyword));
                const updatedKeywordSet = new Set(updatedKeywords.map(k => k.keyword));
                const keywordsAreDifferent = currentKeywords.length !== updatedKeywords.length ||
                    currentKeywords.some(k => !updatedKeywordSet.has(k.keyword)) ||
                    updatedKeywords.some(k => !currentKeywordSet.has(k.keyword));

                // If filters are active, NEVER merge unfiltered keywords - only preserve current filtered keywords
                if (hasActiveFilters) {
                    // Filters are active - preserve ONLY the current filtered keywords
                    // Don't merge in unfiltered keywords from the query
                    setSelectedIdea({
                        ...updated,
                        report: updated.report ? {
                            ...updated.report,
                            keywords: currentKeywords, // Keep only current filtered keywords
                        } : undefined,
                    });
                } else if ((manuallyLoadedSet && manuallyLoadedSet.size > 0) || keywordsAreDifferent) {
                    // We have manually loaded keywords or keywords are different - preserve them
                    // Merge: keep all current keywords (especially manually loaded ones), 
                    // add any new ones from updated that aren't already present
                    const mergedKeywords = [
                        ...currentKeywords, // Preserve all current keywords (including manually loaded)
                        ...updatedKeywords.filter(k => !currentKeywordSet.has(k.keyword))
                    ];

                    setSelectedIdea({
                        ...updated,
                        report: updated.report ? {
                            ...updated.report,
                            keywords: mergedKeywords,
                        } : undefined,
                    });
                } else {
                    // No manually loaded keywords, no filters, and keywords match - safe to update
                    setSelectedIdea(updated);
                }

                // Set first keyword if not already set
                if (
                    updated?.report?.keywords &&
                    updated.report.keywords.length > 0 &&
                    !selectedKeyword
                ) {
                    setSelectedKeyword(updated.report.keywords[0].keyword);
                }
            }
        }
    }, [ideas]); // Only depend on ideas, not selectedIdea to avoid infinite loops

    const handleIdeaGenerated = (newIdea: IdeaWithReport) => {
        setSelectedIdea(newIdea);
        setDisplayedKeywordCount(10); // Reset to show 10 initially
        setExcludedKeywordIds(new Set()); // Clear excluded keywords for new idea
        // Clear manually loaded keywords and filter flags for new idea
        if (newIdea.report?.id) {
            manuallyLoadedKeywordsRef.current.delete(newIdea.report.id);
            hasActiveFiltersRef.current.delete(newIdea.report.id);
        }
        if (newIdea?.report?.keywords && newIdea.report.keywords.length > 0) {
            setSelectedKeyword(newIdea.report.keywords[0].keyword);
        }
        refetch();
    };

    const handleIdeaSelect = (idea: IdeaWithReport) => {
        // Clear manually loaded keywords and filter flags for previous idea if switching
        if (selectedIdea?.report?.id && selectedIdea.report.id !== idea.report?.id) {
            manuallyLoadedKeywordsRef.current.delete(selectedIdea.report.id);
            hasActiveFiltersRef.current.delete(selectedIdea.report.id);
        }
        setSelectedIdea(idea);
        setDisplayedKeywordCount(10); // Reset to show 10 initially
        setExcludedKeywordIds(new Set()); // Clear excluded keywords when switching ideas
        if (idea?.report?.keywords && idea.report.keywords.length > 0) {
            setSelectedKeyword(idea.report.keywords[0].keyword);
        } else {
            setSelectedKeyword(null);
        }
        setShowHistory(false);
    };

    const handleReportGenerated = (ideaWithReport: IdeaWithReport) => {
        setSelectedIdea(ideaWithReport);
        // Check if filters were applied (keywords might be filtered)
        const filters = getFiltersFromStorage();
        if (filters && filters.length > 0 && ideaWithReport.report?.id) {
            // Mark that filters are active for this report
            hasActiveFiltersRef.current.set(ideaWithReport.report.id, true);
            // When filters are active, set displayed count to actual filtered keyword count
            // Don't force it to 10 - show only what matches the filters
            const filteredKeywordCount = ideaWithReport.report?.keywords?.length || 0;
            setDisplayedKeywordCount(Math.min(filteredKeywordCount, 10)); // Show up to 10, but not more than available
        } else if (ideaWithReport.report?.id) {
            // No filters, clear the flag and use default count
            hasActiveFiltersRef.current.delete(ideaWithReport.report.id);
            setDisplayedKeywordCount(10); // Default to 10 when no filters
        }
        if (
            ideaWithReport?.report?.keywords &&
            ideaWithReport.report.keywords.length > 0
        ) {
            setSelectedKeyword(ideaWithReport.report.keywords[0].keyword);
        }
        refetch();
    };

    return (
        <div className="min-h-screen">
            <header className="border-b border-white/10 backdrop-blur-xl bg-background/80 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <a
                        href="https://www.pioneerslab.ai/"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <img src={logoImage} alt="Pioneers AI Lab" className="h-6" />
                    </a>
                    <div className="flex items-center gap-4">
                        {hasPaid && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                                <Coins className="h-4 w-4 text-primary" />
                                <span className="text-sm font-semibold text-white">{credits}</span>
                                <span className="text-xs text-white/60">credits</span>
                            </div>
                        )}
                        {!hasPaid && (
                            <Button
                                onClick={() => setShowPaywall(true)}
                                size="sm"
                                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                            >
                                <Sparkles className="h-4 w-4 mr-2" />
                                Upgrade Premium
                            </Button>
                        )}
                        <span className="text-sm text-white/60">{user.email}</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onLogout}
                            data-testid="button-logout"
                        >
                            <LogOut className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                <IdeaGenerator
                    onIdeaGenerated={handleIdeaGenerated}
                    onShowHistory={() => setShowHistory(!showHistory)}
                    onReportGenerated={handleReportGenerated}
                    currentIdea={selectedIdea}
                    onGeneratingChange={setIsGeneratingReport}
                    searchKeyword={searchKeyword}
                    onActiveTabChange={setActiveTab}
                />

                {error && (
                    <GlassmorphicCard className="p-8">
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-destructive mb-2">
                                Error loading ideas
                            </h3>
                            <p className="text-sm text-white/60 mb-4">
                                {error instanceof Error
                                    ? error.message
                                    : "Something went wrong"}
                            </p>
                            <Button onClick={() => refetch()} variant="secondary">
                                Try Again
                            </Button>
                        </div>
                    </GlassmorphicCard>
                )}

                {!isLoading && !error && isGeneratingReport && (
                    <div className="space-y-8">
                        <div className="text-center pt-8 pb-4">
                            <div className="h-12 bg-white/10 rounded-lg animate-pulse max-w-2xl mx-auto" />
                        </div>

                        <div className="pt-16 space-y-4">
                            <div>
                                <h3 className="text-xl font-semibold text-white/90 mb-2">
                                    Top 10 Related Keywords
                                </h3>
                                <p className="text-sm text-white/60">
                                    Generating your market analysis...
                                </p>
                            </div>
                            <GlassmorphicCard className="p-6">
                                <div className="space-y-3">
                                    {[...Array(10)].map((_, i) => (
                                        <div
                                            key={i}
                                            className="h-12 bg-white/10 rounded animate-pulse"
                                        />
                                    ))}
                                </div>
                            </GlassmorphicCard>
                        </div>

                        <div className="pt-8">
                            <GlassmorphicCard className="p-8">
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <div className="h-6 bg-white/10 rounded animate-pulse w-64" />
                                        <div className="h-4 bg-white/10 rounded animate-pulse w-96" />
                                    </div>
                                    <div className="h-96 bg-white/5 rounded animate-pulse" />
                                </div>
                            </GlassmorphicCard>
                        </div>

                        <div className="pt-16 space-y-4">
                            <h3 className="text-xl font-semibold text-white/90">
                                Aggregated KPIs
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                {[...Array(6)].map((_, i) => (
                                    <GlassmorphicCard key={i} className="p-6">
                                        <div className="space-y-3">
                                            <div className="h-4 bg-white/10 rounded animate-pulse w-24" />
                                            <div className="h-8 bg-white/10 rounded animate-pulse w-20" />
                                            <div className="h-3 bg-white/10 rounded animate-pulse w-16" />
                                        </div>
                                    </GlassmorphicCard>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {!isLoading &&
                    !error &&
                    !isGeneratingReport &&
                    activeTab === "standard" &&
                    selectedIdea?.report &&
                    (() => {
                        // Slice first based on displayedKeywordCount, THEN filter out excluded
                        // This prevents backfilling from preloaded keywords when hiding
                        const preFilteredKeywords = selectedIdea.report.keywords.slice(
                            0,
                            displayedKeywordCount,
                        );
                        const displayedKeywords = preFilteredKeywords.filter(
                            (k) => !excludedKeywordIds.has(k.id),
                        );

                        // Check if there are more keywords to show (not counting excluded ones)
                        const allVisibleKeywords = selectedIdea.report.keywords.filter(
                            (k) => !excludedKeywordIds.has(k.id),
                        );
                        const hasMoreToShow =
                            displayedKeywordCount < allVisibleKeywords.length;

                        return (
                            <div className="space-y-4">
                                <div className="text-center pt-8 pb-4">
                                    <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight max-w-3xl mx-auto">
                                        {selectedIdea.generatedIdea}
                                    </h2>
                                </div>

                                <div className="pt-16 space-y-4">
                                    <div>
                                        <h3 className="text-xl font-semibold text-white/90 mb-2">
                                            Top {displayedKeywords.length} Related Keywords
                                        </h3>
                                        <p className="text-sm text-white/60">
                                            Click a keyword to view its trend analysis
                                        </p>
                                    </div>
                                    <KeywordsTable
                                        keywords={displayedKeywords}
                                        selectedKeyword={selectedKeyword}
                                        onKeywordSelect={setSelectedKeyword}
                                        onSearchKeyword={setSearchKeyword}
                                        onDeleteKeyword={handleDeleteKeyword}
                                        onLoadMore={
                                            hasMoreToShow || allVisibleKeywords.length < 100
                                                ? handleLoadMore
                                                : undefined
                                        }
                                        isLoadingMore={loadMoreKeywordsMutation.isPending}
                                        reportId={selectedIdea.report.id}
                                    />
                                </div>

                                {selectedKeyword &&
                                    displayedKeywords.find(
                                        (k) => k.keyword === selectedKeyword,
                                    ) && (
                                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_175px] gap-4">
                                            <TrendChart
                                                key={`chart-${selectedKeyword}`}
                                                keywords={displayedKeywords}
                                                reportId={selectedIdea.report.id}
                                                selectedKeyword={selectedKeyword}
                                            />
                                            <KeywordMetricsCards
                                                key={`metrics-${selectedKeyword}`}
                                                keyword={
                                                    displayedKeywords.find(
                                                        (k) => k.keyword === selectedKeyword,
                                                    )!
                                                }
                                                allKeywords={displayedKeywords}
                                            />
                                        </div>
                                    )}

                                <div className="pt-16 space-y-4">
                                    <h3 className="text-xl font-semibold text-white/90">
                                        Aggregated KPIs
                                    </h3>
                                    <MetricsCards keywords={displayedKeywords} />
                                </div>

                                <div>
                                    <AverageTrendChart keywords={displayedKeywords} />
                                </div>

                                {/* Call to Action */}
                                <div className="text-center py-8">
                                    <h3 className="text-2xl font-semibold mb-6 bg-gradient-to-r from-secondary via-primary to-white bg-clip-text text-transparent">
                                        Found an opportunity?
                                        <br />
                                        Find a cofounder and launch with Pioneers
                                    </h3>
                                    <Button
                                        asChild
                                        className="px-8 py-3 text-base font-semibold text-white border border-white/20 shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:shadow-[0_0_50px_rgba(139,92,246,0.7)] hover:scale-105 transition-all duration-300"
                                        style={{
                                            background:
                                                "radial-gradient(ellipse 120% 120% at 50% -20%, rgba(139, 92, 246, 0.95), rgba(59, 130, 246, 0.85) 60%, rgba(99, 102, 241, 0.75))",
                                        }}
                                        data-testid="button-launch-cta"
                                    >
                                        <a
                                            href="https://thepioneer.vc/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {">"} Launch your startup
                                        </a>
                                    </Button>
                                </div>
                            </div>
                        );
                    })()}
            </main>

            {/* History Sidebar */}
            <Sheet open={showHistory} onOpenChange={setShowHistory}>
                <SheetContent className="!w-full sm:!w-[400px] sm:!max-w-[500px] bg-background/95 backdrop-blur-xl border-white/10">
                    <SheetHeader>
                        <SheetTitle className="text-white">Idea History</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6 overflow-y-auto h-[calc(100vh-100px)] custom-scrollbar pr-4">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center gap-4 py-12">
                                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                                <p className="text-white/60">Loading your ideas...</p>
                            </div>
                        ) : (
                            <IdeaHistory ideas={ideas || []} onIdeaSelect={handleIdeaSelect} />
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            {/* Help Dialog */}
            <Dialog open={showHelp} onOpenChange={setShowHelp}>
                <DialogPortal>
                    <DialogOverlay className="!bg-black/20" />
                    <DialogContent
                        className="!bg-white/5 backdrop-blur-xl border-white/10 max-w-xl p-8"
                        style={{ background: "rgba(255, 255, 255, 0.05)" }}
                        aria-describedby="help-description"
                    >
                        <DialogHeader>
                            <DialogTitle className="text-2xl text-white text-left">
                                How to Use Trends Search
                            </DialogTitle>
                            <DialogDescription
                                id="help-description"
                                className="text-white/60 text-left"
                            >
                                Discover market opportunities through trend research
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 text-white/80 text-left">
                            <div>
                                <h3 className="text-base font-semibold text-white mb-1">
                                    <span className="text-blue-400">1.</span> Search for Market
                                    Opportunities
                                </h3>
                                <p className="text-sm">
                                    Enter any keyword or niche you're curious about, or click the{" "}
                                    <span className="text-yellow-300">sparkle icon ✨</span> to
                                    let AI suggest trending opportunities. Press{" "}
                                    <kbd className="px-1.5 py-0.5 bg-blue-500/20 border border-blue-400/30 rounded text-xs text-blue-300 font-semibold">
                                        Enter
                                    </kbd>{" "}
                                    to analyze market trends.
                                </p>
                            </div>

                            <div>
                                <h3 className="text-base font-semibold text-white mb-1">
                                    <span className="text-blue-400">2.</span> Analyze Key Market
                                    Indicators
                                </h3>
                                <p className="text-sm leading-relaxed">
                                    <strong>Avg Volume:</strong> Search demand size •{" "}
                                    <strong>Avg Competition:</strong> Market saturation level •{" "}
                                    <strong>Avg CPC:</strong> Monetization potential •{" "}
                                    <strong>Avg Top Page Bid:</strong> Premium ad value •{" "}
                                    <strong>Avg 3M Growth:</strong> Recent momentum •{" "}
                                    <strong>Avg YoY Growth:</strong> Long-term trajectory
                                </p>
                            </div>

                            <div>
                                <h3 className="text-base font-semibold text-white mb-1">
                                    <span className="text-blue-400">3.</span> Spot Trend Patterns
                                </h3>
                                <p className="text-sm">
                                    Click keywords to visualize 12-month search trends and
                                    identify growing opportunities with strong momentum and low
                                    competition.
                                </p>
                            </div>

                            <div className="bg-purple-500/10 border border-purple-500/20 rounded-md p-3">
                                <h3 className="text-base font-semibold text-purple-300 mb-1">
                                    💡 Pro Tip
                                </h3>
                                <p className="text-sm text-purple-200/80">
                                    Spot a rising keyword? Search it to uncover related niches and
                                    drill deeper into emerging market segments!
                                </p>
                            </div>
                        </div>
                    </DialogContent>
                </DialogPortal>
            </Dialog>

            {/* Logo in bottom right corner */}
            <a
                href="https://www.pioneerslab.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="fixed bottom-4 right-4 z-50"
            >
                <img
                    src={logoImage}
                    alt="Pioneers AI Lab"
                    className="h-6 opacity-60 hover:opacity-100 transition-opacity"
                />
            </a>

            {/* Dialog for when no more filtered keywords available */}
            <AlertDialog open={showNoMoreFilteredDialog} onOpenChange={setShowNoMoreFilteredDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>No More Filtered Keywords</AlertDialogTitle>
                        <AlertDialogDescription>
                            No more keywords match your current filters. Would you like to load keywords without filters?
                            These will still be sorted by relevance to your search query.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (pendingLoadMoreWithoutFilters) {
                                    loadWithoutFiltersMutation.mutate(pendingLoadMoreWithoutFilters);
                                }
                            }}
                            disabled={loadWithoutFiltersMutation.isPending}
                        >
                            {loadWithoutFiltersMutation.isPending ? "Loading..." : "Load Without Filters"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Paywall Modal */}
            <PaywallModal
                open={showPaywall}
                onOpenChange={setShowPaywall}
                feature="custom-search"
            />
        </div>
    );
}
