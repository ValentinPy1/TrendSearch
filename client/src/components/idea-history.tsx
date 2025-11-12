import { FileText, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { useState, useEffect } from "react";
import type { IdeaWithReport } from "@shared/schema";

interface IdeaHistoryProps {
  ideas: IdeaWithReport[];
  onIdeaSelect: (idea: IdeaWithReport) => void;
}

export function IdeaHistory({ ideas, onIdeaSelect }: IdeaHistoryProps) {
  const { toast } = useToast();
  const [ideaToDelete, setIdeaToDelete] = useState<string | null>(null);
  const [disableConfirmDialog, setDisableConfirmDialog] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Load preference from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('disable-idea-delete-confirmation');
      if (stored === 'true') {
        setDisableConfirmDialog(true);
      }
    }
  }, []);

  const deleteMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      console.log("Deleting idea:", ideaId);
      try {
        // apiRequest already throws if response is not ok, so if we get here, it succeeded
        const response = await apiRequest("DELETE", `/api/ideas/${ideaId}`);
        console.log("Delete response received, status:", response.status);
        // Try to parse JSON if available, otherwise just return success
        try {
          const data = await response.json();
          console.log("Delete response data:", data);
          return data;
        } catch (e) {
          // No JSON body is fine for DELETE - response is already ok
          console.log("No JSON body in response, assuming success");
          return { success: true };
        }
      } catch (error) {
        console.error("Delete mutation error:", error);
        throw error;
      }
    },
    onMutate: async (ideaId: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/ideas"] });
      
      // Snapshot the previous value
      const previousIdeas = queryClient.getQueryData<IdeaWithReport[]>(["/api/ideas"]);
      
      // Optimistically update to remove the deleted idea
      if (previousIdeas) {
        queryClient.setQueryData<IdeaWithReport[]>(["/api/ideas"], 
          previousIdeas.filter(idea => idea.id !== ideaId)
        );
      }
      
      return { previousIdeas };
    },
    onSuccess: () => {
      console.log("Delete successful");
      toast({
        title: "Idea deleted",
        description: "The idea has been removed from your history.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ideas"] });
      setIdeaToDelete(null);
      setDontShowAgain(false);
    },
    onError: (error, ideaId, context) => {
      console.error("Delete error:", error);
      // Rollback optimistic update
      if (context?.previousIdeas) {
        queryClient.setQueryData<IdeaWithReport[]>(["/api/ideas"], context.previousIdeas);
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete idea",
        variant: "destructive",
      });
      setIdeaToDelete(null);
      setDontShowAgain(false);
    },
  });

  const handleDelete = () => {
    console.log("handleDelete called, ideaToDelete:", ideaToDelete);
    if (ideaToDelete) {
      // Save preference if checkbox is checked
      if (dontShowAgain) {
        setDisableConfirmDialog(true);
        if (typeof window !== 'undefined') {
          localStorage.setItem('disable-idea-delete-confirmation', 'true');
        }
      }
      console.log("Calling deleteMutation.mutate with:", ideaToDelete);
      deleteMutation.mutate(ideaToDelete);
    } else {
      console.error("handleDelete called but ideaToDelete is null");
    }
  };

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
            className="bg-white/5 hover-elevate rounded-lg p-4 border border-white/10 transition-all cursor-pointer relative"
            onClick={() => onIdeaSelect(idea)}
            data-testid={`idea-${idea.id}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 pr-20">
                <p className="text-white font-medium line-clamp-2 mb-2">
                  {idea.generatedIdea}
                </p>
                <p className="text-xs text-white/40">
                  {formatDistanceToNow(new Date(idea.createdAt), { addSuffix: true })}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-white/40 hover:text-white/60 hover:bg-white/5 flex-shrink-0 z-10 relative"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log("Delete button clicked for idea:", idea.id);
                  // Check localStorage directly to ensure we have the latest value
                  const shouldSkipConfirmation = typeof window !== 'undefined' && 
                    localStorage.getItem('disable-idea-delete-confirmation') === 'true';
                  
                  console.log("shouldSkipConfirmation:", shouldSkipConfirmation);
                  
                  if (shouldSkipConfirmation) {
                    // Delete immediately if confirmation is disabled
                    console.log("Skipping confirmation, deleting immediately");
                    deleteMutation.mutate(idea.id);
                  } else {
                    // Show confirmation dialog
                    console.log("Showing confirmation dialog");
                    setIdeaToDelete(idea.id);
                  }
                }}
                data-testid={`button-delete-${idea.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="absolute bottom-3 right-3 flex gap-1">
              <Badge 
                variant="secondary"
                className={`text-xs ${
                  idea.originalIdea 
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
                    : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                }`}
                data-testid={`badge-${idea.originalIdea ? 'original' : 'generated'}-${idea.id}`}
              >
                {idea.originalIdea ? 'Original' : 'Generated'}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!ideaToDelete} onOpenChange={() => {
        setIdeaToDelete(null);
        setDontShowAgain(false);
      }}>
        <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Idea</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Are you sure you want to delete this idea? This action cannot be undone and will also delete the associated report and keywords.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-4">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <Label
              htmlFor="dont-show-again"
              className="text-sm text-white/80 cursor-pointer font-normal"
            >
              Don't show this confirmation again
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
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
