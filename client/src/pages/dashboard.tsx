import { useState, useEffect } from "react";
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
import { LogOut, Loader2, HelpCircle } from "lucide-react";
import type { IdeaWithReport } from "@shared/schema";
import logoImage from "@assets/image_1761146000585.png";

interface DashboardProps {
  user: { id: string; email: string };
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [selectedIdea, setSelectedIdea] = useState<IdeaWithReport | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState<string | null>(null);
  const [displayedKeywordCount, setDisplayedKeywordCount] = useState(10);

  const {
    data: ideas,
    isLoading,
    error,
    refetch,
  } = useQuery<IdeaWithReport[]>({
    queryKey: ["/api/ideas"],
  });

  const loadMoreKeywordsMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/reports/${reportId}/load-more`,
        {}
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ideas"] });
    },
  });

  const deleteKeywordMutation = useMutation({
    mutationFn: async (keywordId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/keywords/${keywordId}`,
        {}
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ideas"] });
    },
  });

  const handleDeleteKeyword = (keywordId: string) => {
    deleteKeywordMutation.mutate(keywordId);
  };

  const handleLoadMore = () => {
    if (!selectedIdea?.report) return;
    
    const totalKeywords = selectedIdea.report.keywords.length;
    const newDisplayCount = displayedKeywordCount + 5;
    
    // Show 5 more keywords immediately
    setDisplayedKeywordCount(newDisplayCount);
    
    // If we're within 5 of running out, preload 5 more in background
    if (newDisplayCount >= totalKeywords - 5) {
      loadMoreKeywordsMutation.mutate(selectedIdea.report.id);
    }
  };

  // Update selected idea with latest data (but don't auto-select on initial load)
  useEffect(() => {
    if (ideas && ideas.length > 0 && selectedIdea) {
      // Only update if there's already a selected idea
      const updated = ideas.find((i) => i.id === selectedIdea.id);
      if (updated) {
        setSelectedIdea(updated);
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
  }, [ideas]);

  const handleIdeaGenerated = (newIdea: IdeaWithReport) => {
    setSelectedIdea(newIdea);
    setDisplayedKeywordCount(10); // Reset to show 10 initially
    if (newIdea?.report?.keywords && newIdea.report.keywords.length > 0) {
      setSelectedKeyword(newIdea.report.keywords[0].keyword);
    }
    refetch();
  };

  const handleIdeaSelect = (idea: IdeaWithReport) => {
    setSelectedIdea(idea);
    setDisplayedKeywordCount(10); // Reset to show 10 initially
    if (idea?.report?.keywords && idea.report.keywords.length > 0) {
      setSelectedKeyword(idea.report.keywords[0].keyword);
    } else {
      setSelectedKeyword(null);
    }
    setShowHistory(false);
  };

  const handleReportGenerated = (ideaWithReport: IdeaWithReport) => {
    setSelectedIdea(ideaWithReport);
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
            <span className="text-sm text-white/60">{user.email}</span>
            <Button
              variant="ghost"
              onClick={() => setShowHelp(true)}
              data-testid="button-help"
              className="gap-2"
            >
              <HelpCircle className="h-5 w-5" />
              <span>Help</span>
            </Button>
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
        />

        {isLoading && (
          <GlassmorphicCard className="p-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="text-white/60">Loading your ideas...</p>
            </div>
          </GlassmorphicCard>
        )}

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
          selectedIdea?.report && (() => {
            const displayedKeywords = selectedIdea.report.keywords.slice(0, displayedKeywordCount);
            const hasMoreToShow = displayedKeywordCount < selectedIdea.report.keywords.length;
            
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
                  onLoadMore={hasMoreToShow || selectedIdea.report.keywords.length < 100 ? handleLoadMore : undefined}
                  isLoadingMore={loadMoreKeywordsMutation.isPending}
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
                  Validated an idea ?<br />
                  Let's find a cofounder and launch with Pioneers
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
        <SheetContent className="w-full sm:w-[500px] bg-background/95 backdrop-blur-xl border-white/10">
          <SheetHeader>
            <SheetTitle className="text-white">Idea History</SheetTitle>
          </SheetHeader>
          <div className="mt-6 overflow-y-auto h-[calc(100vh-100px)]">
            <IdeaHistory ideas={ideas || []} onIdeaSelect={handleIdeaSelect} />
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
                How to Use Idea Watcher
              </DialogTitle>
              <DialogDescription
                id="help-description"
                className="text-white/60 text-left"
              >
                Validate startup ideas with real market data
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-white/80 text-left">
              <div>
                <h3 className="text-base font-semibold text-white mb-1">
                  <span className="text-blue-400">1.</span> Enter or Generate an
                  Idea
                </h3>
                <p className="text-sm">
                  Type your idea or keyword in the text field, or click the{" "}
                  <span className="text-yellow-300">sparkle icon ✨</span> to
                  generate one with AI. Press{" "}
                  <kbd className="px-1.5 py-0.5 bg-blue-500/20 border border-blue-400/30 rounded text-xs text-blue-300 font-semibold">
                    Enter
                  </kbd>{" "}
                  to generate a market report.
                </p>
              </div>

              <div>
                <h3 className="text-base font-semibold text-white mb-1">
                  <span className="text-blue-400">2.</span> Review the 6 Key
                  Metrics
                </h3>
                <p className="text-sm leading-relaxed">
                  <strong>Avg Volume:</strong> Monthly search demand •{" "}
                  <strong>Avg Competition:</strong> How crowded the market is •{" "}
                  <strong>Avg CPC:</strong> Cost per click for ads •{" "}
                  <strong>Avg Top Page Bid:</strong> Top-of-page advertising
                  cost • <strong>Avg 3M Growth:</strong> Short-term trend •{" "}
                  <strong>Avg YoY Growth:</strong> Long-term trend
                </p>
              </div>

              <div>
                <h3 className="text-base font-semibold text-white mb-1">
                  <span className="text-blue-400">3.</span> Explore Keyword
                  Trends
                </h3>
                <p className="text-sm">
                  Click any keyword in the table to view its 12-month historical
                  search volume chart and detailed metrics.
                </p>
              </div>

              <div className="bg-purple-500/10 border border-purple-500/20 rounded-md p-3">
                <h3 className="text-base font-semibold text-purple-300 mb-1">
                  💡 Pro Tip
                </h3>
                <p className="text-sm text-purple-200/80">
                  Found a trending keyword? Enter it back into the text field to
                  discover even more related ideas and iterate your way to the
                  perfect niche!
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
    </div>
  );
}
