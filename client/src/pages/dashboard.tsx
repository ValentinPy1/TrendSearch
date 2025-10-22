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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LogOut, Loader2 } from "lucide-react";
import type { IdeaWithReport } from "@shared/schema";

interface DashboardProps {
  user: { id: string; email: string };
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [selectedIdea, setSelectedIdea] = useState<IdeaWithReport | null>(null);
  const [showHistory, setShowHistory] = useState(false);
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

            <MetricsCards keywords={selectedIdea.report.keywords} />

            <KeywordsTable
              keywords={selectedIdea.report.keywords}
              selectedKeyword={selectedKeyword}
              onKeywordSelect={setSelectedKeyword}
            />

            {selectedKeyword &&
              selectedIdea.report.keywords.find(
                (k) => k.keyword === selectedKeyword,
              ) && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_192px] gap-6">
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
    </div>
  );
}
