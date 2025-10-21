import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
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
  currentIdea,
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
      // Set the generated idea in the input field
      form.setValue("idea", result.idea.generatedIdea);
      queryClient.invalidateQueries({ queryKey: ["/api/ideas"] });
      onIdeaGenerated(result.idea);

      // Automatically generate report
      generateReportMutation.mutate(result.idea.id);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to generate idea",
        variant: "destructive",
      });
    },
  });

  const generateReportMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      const res = await apiRequest("POST", "/api/generate-report", {
        ideaId,
        keywordCount: 10,
      });
      return res.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Report Generated!",
        description: "Your market analysis is ready.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ideas"] });
      if (currentIdea) {
        onReportGenerated({
          ...currentIdea,
          report: {
            ...result.report,
            keywords: result.keywords,
          },
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to generate report",
        variant: "destructive",
      });
    },
  });

  const handleGenerateIdea = () => {
    // Always generate new AI idea (pass null to force AI generation)
    generateIdeaMutation.mutate({
      originalIdea: null,
    });
  };

  const handleGenerateReport = () => {
    const ideaText = form.getValues("idea");

    if (!ideaText || ideaText.trim().length === 0) {
      toast({
        title: "Error",
        description: "Please enter an idea to generate a report",
        variant: "destructive",
      });
      return;
    }

    // Create idea with the current input, then generate report
    generateIdeaMutation.mutate({
      originalIdea: ideaText.trim(),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGenerateReport();
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-8 pt-12">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-xl md:text-2xl font-bold text-white mb-4">
            Idea Watcher
          </h2>
          <p className="text-sm text-white/70 mb-2 leading-relaxed">
            Get ultra-concise microSaaS ideas powered by AI. Click the{" "}
            <span className="text-primary">sparkle icon</span> to generate a new
            AI idea (5-8 words), or enter your own idea and press{" "}
            <span className="text-secondary">Enter</span> to validate it with
            real market data from 10 semantically-related keywords.
          </p>
          <p className="text-xs text-white/50">
            Each report includes search volume, competition, trends, and growth
            metrics
          </p>
        </div>

        <div className="relative">
          <Input
            placeholder="e.g., Voice-assisted skill-connecting marketers who can't keep track of expenses with personalized solutions"
            className="w-full bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 px-6 pr-24 rounded-full"
            data-testid="input-idea"
            onKeyDown={handleKeyDown}
            {...form.register("idea")}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onShowHistory}
              className="h-10 w-10 text-secondary hover:bg-transparent"
              data-testid="button-history"
            >
              <History className="h-5 w-5 stroke-[2.5]" />
            </Button>
            <Button
              type="button"
              onClick={handleGenerateIdea}
              disabled={
                generateIdeaMutation.isPending ||
                generateReportMutation.isPending
              }
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-primary hover:bg-transparent"
              data-testid="button-generate"
            >
              {generateIdeaMutation.isPending ||
              generateReportMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin stroke-[2.5]" />
              ) : (
                <Sparkles className="h-5 w-5 stroke-[2.5]" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
