import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { GlassmorphicCard } from "./glassmorphic-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, History, Loader2, BarChart } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { IdeaWithReport } from "@shared/schema";

interface IdeaGeneratorProps {
  onIdeaGenerated: (idea: IdeaWithReport) => void;
  onShowHistory: () => void;
  onReportGenerated: (idea: IdeaWithReport) => void;
  currentIdea?: IdeaWithReport | null;
}

export function IdeaGenerator({ 
  onIdeaGenerated, 
  onShowHistory,
  onReportGenerated,
  currentIdea
}: IdeaGeneratorProps) {
  const { toast } = useToast();

  const form = useForm({
    defaultValues: {
      idea: "",
    },
  });

  const generateIdeaMutation = useMutation({
    mutationFn: async (data: { originalIdea: string | null }) => {
      const res = await apiRequest("POST", "/api/generate-idea", data);
      return res.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Idea Generated!",
        description: result.idea.generatedIdea,
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
      onIdeaGenerated(result.idea);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate idea",
        variant: "destructive",
      });
    },
  });

  const generateReportMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      const res = await apiRequest("POST", "/api/generate-report", { ideaId });
      return res.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Report Generated!",
        description: "Your market analysis is ready.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
      if (currentIdea) {
        onReportGenerated({
          ...currentIdea,
          report: {
            ...result.report,
            keywords: result.keywords
          }
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate report",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: { idea: string }) => {
    generateIdeaMutation.mutate({
      originalIdea: data.idea || null,
    });
  };

  const handleGenerateReport = () => {
    if (!currentIdea) return;
    generateReportMutation.mutate(currentIdea.id);
  };

  return (
    <GlassmorphicCard className="p-8">
      <div className="space-y-6">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Generate Your Next Big Idea
            </h2>
            <p className="text-sm text-white/60">
              Enter an existing idea or leave blank for AI-powered suggestions
            </p>
          </div>

          <div className="flex gap-3">
            <Input
              placeholder="e.g., Voice-assisted skill-connecting marketers who can't keep track of expenses with personalized solutions"
              className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20 h-12"
              data-testid="input-idea"
              {...form.register("idea")}
            />
            <Button
              type="submit"
              disabled={generateIdeaMutation.isPending}
              className="gap-2"
              data-testid="button-generate"
            >
              {generateIdeaMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onShowHistory}
              className="gap-2"
              data-testid="button-history"
            >
              <History className="h-4 w-4" />
              History
            </Button>
          </div>
        </form>

        {currentIdea && !currentIdea.report && (
          <div className="pt-4 border-t border-white/10">
            <p className="text-white mb-3">
              Current idea: <span className="font-semibold">{currentIdea.generatedIdea}</span>
            </p>
            <Button
              onClick={handleGenerateReport}
              disabled={generateReportMutation.isPending}
              className="gap-2"
              data-testid="button-generate-report"
            >
              {generateReportMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  <BarChart className="h-4 w-4" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </GlassmorphicCard>
  );
}
