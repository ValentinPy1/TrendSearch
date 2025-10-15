import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { IdeaGenerator } from "@/components/idea-generator";
import { MetricsCards } from "@/components/metrics-cards";
import { TrendChart } from "@/components/trend-chart";
import { IdeaHistory } from "@/components/idea-history";
import { Button } from "@/components/ui/button";
import { GlassmorphicCard } from "@/components/glassmorphic-card";
import { LogOut, Loader2 } from "lucide-react";
import type { IdeaWithReport } from "@shared/schema";

interface DashboardProps {
  user: { id: string; email: string };
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [selectedIdea, setSelectedIdea] = useState<IdeaWithReport | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: ideas, isLoading, error, refetch } = useQuery<IdeaWithReport[]>({
    queryKey: ['/api/ideas'],
  });

  // Update selected idea when ideas change
  useEffect(() => {
    if (ideas && ideas.length > 0) {
      if (!selectedIdea || !ideas.find(i => i.id === selectedIdea.id)) {
        // Select the most recent idea
        setSelectedIdea(ideas[0]);
      } else {
        // Update selected idea with latest data
        const updated = ideas.find(i => i.id === selectedIdea.id);
        if (updated) {
          setSelectedIdea(updated);
        }
      }
    }
  }, [ideas]);

  const handleIdeaGenerated = (newIdea: IdeaWithReport) => {
    setSelectedIdea(newIdea);
    refetch();
  };

  const handleIdeaSelect = (idea: IdeaWithReport) => {
    setSelectedIdea(idea);
    setShowHistory(false);
  };

  const handleReportGenerated = (ideaWithReport: IdeaWithReport) => {
    setSelectedIdea(ideaWithReport);
    refetch();
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 backdrop-blur-xl bg-background/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Idea Finder</h1>
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
                {error instanceof Error ? error.message : "Something went wrong"}
              </p>
              <Button onClick={() => refetch()} variant="secondary">
                Try Again
              </Button>
            </div>
          </GlassmorphicCard>
        )}

        {!isLoading && !error && showHistory && (
          <IdeaHistory
            ideas={ideas || []}
            onIdeaSelect={handleIdeaSelect}
          />
        )}

        {!isLoading && !error && selectedIdea?.report && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
                {selectedIdea.generatedIdea}
              </h2>
            </div>

            <MetricsCards report={selectedIdea.report} />

            <TrendChart
              keywords={selectedIdea.report.keywords}
              reportId={selectedIdea.report.id}
            />
          </div>
        )}
      </main>
    </div>
  );
}
