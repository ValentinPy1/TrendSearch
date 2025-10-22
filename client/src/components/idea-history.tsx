import { FileText, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useState } from "react";
import type { IdeaWithReport } from "@shared/schema";

interface IdeaHistoryProps {
  ideas: IdeaWithReport[];
  onIdeaSelect: (idea: IdeaWithReport) => void;
}

export function IdeaHistory({ ideas, onIdeaSelect }: IdeaHistoryProps) {
  const { toast } = useToast();
  const [ideaToDelete, setIdeaToDelete] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      await apiRequest("DELETE", `/api/ideas/${ideaId}`);
    },
    onSuccess: () => {
      toast({
        title: "Idea deleted",
        description: "The idea has been removed from your history.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ideas"] });
      setIdeaToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete idea",
        variant: "destructive",
      });
      setIdeaToDelete(null);
    },
  });

  if (ideas.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 text-white/40 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No ideas yet</h3>
        <p className="text-sm text-white/60">
          Generate your first idea to get started
        </p>
      </div>
    );
  }

  return (
    <>
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
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-white font-medium line-clamp-2 flex-1">
                    {idea.generatedIdea}
                  </p>
                  <Badge 
                    variant="secondary"
                    className={`flex-shrink-0 ${
                      idea.originalIdea 
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
                        : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    }`}
                    data-testid={`badge-${idea.originalIdea ? 'original' : 'generated'}-${idea.id}`}
                  >
                    {idea.originalIdea ? 'Original' : 'Generated'}
                  </Badge>
                </div>
                <p className="text-xs text-white/40">
                  {formatDistanceToNow(new Date(idea.createdAt), { addSuffix: true })}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="text-white/40 hover:text-white/60 hover:bg-white/5 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setIdeaToDelete(idea.id);
                }}
                data-testid={`button-delete-${idea.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!ideaToDelete} onOpenChange={() => setIdeaToDelete(null)}>
        <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Idea</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Are you sure you want to delete this idea? This action cannot be undone and will also delete the associated report and keywords.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => ideaToDelete && deleteMutation.mutate(ideaToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
