import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
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
  onGeneratingChange?: (isGenerating: boolean) => void;
}

export function IdeaGenerator({
  onIdeaGenerated,
  onShowHistory,
  onReportGenerated,
  currentIdea,
  onGeneratingChange,
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

  // Notify parent when generating state changes
  useEffect(() => {
    const isGenerating =
      generateIdeaMutation.isPending || generateReportMutation.isPending;
    onGeneratingChange?.(isGenerating);
  }, [generateIdeaMutation.isPending, generateReportMutation.isPending, onGeneratingChange]);

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
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-secondary via-primary to-white bg-clip-text text-transparent mb-6">
            Idea Watcher
          </h2>
          <p className="text-base text-white/80 leading-relaxed">
            Generate AI-powered startup ideas or validate your own. Get instant
            insights from 80,000+ real keywords with search volume, competition,
            and growth trends.
          </p>
        </div>

        <div className="relative">
          <Input
            placeholder="Write your idea / keyword here or let AI generate one for you clicking the sparkles icon"
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
              className="h-10 w-10 text-yellow-300 hover:bg-transparent"
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
