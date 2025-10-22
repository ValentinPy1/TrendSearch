import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { IdeaGenerator } from "@/components/idea-generator";
import { MetricsCards } from "@/components/metrics-cards";
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

interface DashboardProps {
  user: { id: string; email: string };
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [selectedIdea, setSelectedIdea] = useState<IdeaWithReport | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

  const {
    data: ideas,
    isLoading,
    error,
    refetch,
  } = useQuery<IdeaWithReport[]>({
    queryKey: ["/api/ideas"],
  });

  // Update selected idea when ideas change
  useEffect(() => {
    if (ideas && ideas.length > 0) {
      if (!selectedIdea || !ideas.find((i) => i.id === selectedIdea.id)) {
        // Select the most recent idea
        const newIdea = ideas[0];
        setSelectedIdea(newIdea);
        // Set first keyword as selected
        if (newIdea?.report?.keywords && newIdea.report.keywords.length > 0) {
          setSelectedKeyword(newIdea.report.keywords[0].keyword);
        }
      } else {
        // Update selected idea with latest data
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
    }
  }, [ideas]);

  const handleIdeaGenerated = (newIdea: IdeaWithReport) => {
    setSelectedIdea(newIdea);
    if (newIdea?.report?.keywords && newIdea.report.keywords.length > 0) {
      setSelectedKeyword(newIdea.report.keywords[0].keyword);
    }
    refetch();
  };

  const handleIdeaSelect = (idea: IdeaWithReport) => {
    setSelectedIdea(idea);
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
          <h1 className="text-2xl font-bold text-white">Idea Watcher</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/60">{user.email}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowHelp(true)}
              data-testid="button-help"
            >
              <HelpCircle className="h-5 w-5" />
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

        {!isLoading && !error && selectedIdea?.report && (
          <div className="space-y-8">
            <div className="text-center py-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight max-w-3xl mx-auto">
                {selectedIdea.generatedIdea}
              </h2>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-white/90">Overall KPIs</h3>
              <MetricsCards keywords={selectedIdea.report.keywords} />
            </div>

            <div className="pt-8">
              <KeywordsTable
                keywords={selectedIdea.report.keywords}
                selectedKeyword={selectedKeyword}
                onKeywordSelect={setSelectedKeyword}
              />
            </div>

            {selectedKeyword &&
              selectedIdea.report.keywords.find(
                (k) => k.keyword === selectedKeyword,
              ) && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_175px] gap-6">
                  <TrendChart
                    key={`chart-${selectedKeyword}`}
                    keywords={selectedIdea.report.keywords}
                    reportId={selectedIdea.report.id}
                    selectedKeyword={selectedKeyword}
                  />
                  <KeywordMetricsCards
                    key={`metrics-${selectedKeyword}`}
                    keyword={
                      selectedIdea.report.keywords.find(
                        (k) => k.keyword === selectedKeyword,
                      )!
                    }
                    allKeywords={selectedIdea.report.keywords}
                  />
                </div>
              )}
          </div>
        )}

        {/* Call to Action */}
        <div className="text-center py-8">
          <h3 className="text-2xl font-semibold text-white mb-6">
            Validated an idea ? Let's help you launch it !
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
              Join the programm
            </a>
          </Button>
        </div>
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
            style={{ background: 'rgba(255, 255, 255, 0.05)' }}
            aria-describedby="help-description"
          >
            <DialogHeader>
              <DialogTitle className="text-2xl text-white text-left">
                How to Use Idea Watcher
              </DialogTitle>
              <DialogDescription id="help-description" className="text-white/60 text-left">
                Validate startup ideas with real market data
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-white/80 text-left">
              <div>
                <h3 className="text-base font-semibold text-white mb-1">
                  <span className="text-blue-400">1.</span> Enter or Generate an Idea
                </h3>
                <p className="text-sm">
                  Type your idea or keyword in the text field, or click the <span className="text-yellow-300">sparkle icon ✨</span> to generate one with AI. Press <kbd className="px-1.5 py-0.5 bg-blue-500/20 border border-blue-400/30 rounded text-xs text-blue-300 font-semibold">Enter</kbd> to generate a market report.
                </p>
              </div>

              <div>
                <h3 className="text-base font-semibold text-white mb-1">
                  <span className="text-blue-400">2.</span> Review the 6 Key Metrics
                </h3>
                <p className="text-sm leading-relaxed">
                  <strong>Avg Volume:</strong> Monthly search demand • <strong>Avg Competition:</strong> How crowded the market is • <strong>Avg CPC:</strong> Cost per click for ads • <strong>Avg Top Page Bid:</strong> Top-of-page advertising cost • <strong>Avg 3M Growth:</strong> Short-term trend • <strong>Avg YoY Growth:</strong> Long-term trend
                </p>
              </div>

              <div>
                <h3 className="text-base font-semibold text-white mb-1">
                  <span className="text-blue-400">3.</span> Explore Keyword Trends
                </h3>
                <p className="text-sm">
                  Click any keyword in the table to view its 12-month historical search volume chart and detailed metrics.
                </p>
              </div>

              <div className="bg-purple-500/10 border border-purple-500/20 rounded-md p-3">
                <h3 className="text-base font-semibold text-purple-300 mb-1">
                  💡 Pro Tip
                </h3>
                <p className="text-sm text-purple-200/80">
                  Found a trending keyword? Enter it back into the text field to discover even more related ideas and iterate your way to the perfect niche!
                </p>
              </div>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
