import { GlassmorphicCard } from "./glassmorphic-card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { IdeaWithReport } from "@shared/schema";

interface IdeaHistoryProps {
  ideas: IdeaWithReport[];
  onIdeaSelect: (idea: IdeaWithReport) => void;
}

export function IdeaHistory({ ideas, onIdeaSelect }: IdeaHistoryProps) {
  if (ideas.length === 0) {
    return (
      <GlassmorphicCard className="p-8">
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-white/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No ideas yet</h3>
          <p className="text-sm text-white/60">
            Generate your first idea to get started
          </p>
        </div>
      </GlassmorphicCard>
    );
  }

  return (
    <GlassmorphicCard className="p-6">
      <h3 className="text-xl font-semibold text-white mb-4">Idea History</h3>
      <div className="space-y-3">
        {ideas.map((idea) => (
          <div
            key={idea.id}
            className="bg-white/5 hover-elevate rounded-lg p-4 border border-white/10 transition-all cursor-pointer"
            onClick={() => onIdeaSelect(idea)}
            data-testid={`idea-${idea.id}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium mb-1 line-clamp-2">
                  {idea.generatedIdea}
                </p>
                {idea.originalIdea && (
                  <p className="text-sm text-white/60 mb-2 line-clamp-1">
                    Original: {idea.originalIdea}
                  </p>
                )}
                <p className="text-xs text-white/40">
                  {formatDistanceToNow(new Date(idea.createdAt), { addSuffix: true })}
                </p>
              </div>
              {idea.report && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onIdeaSelect(idea);
                  }}
                  data-testid={`button-view-report-${idea.id}`}
                >
                  View Report
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </GlassmorphicCard>
  );
}
