import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { usePostHog } from "posthog-js/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FeedbackModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
    const { toast } = useToast();
    const posthog = usePostHog();
    const [feedbackText, setFeedbackText] = useState("");

    const submitFeedbackMutation = useMutation({
        mutationFn: async (text: string) => {
            // Submit to PostHog survey API
            const feedbackId = "019a8285-58ca-0000-ba7a-8d17e7f72830";
            const questionId = "5ed84a1c-1803-4d20-9da0-24dc9a0e0d0f";
            
            // Submit via PostHog API
            const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";
            const posthogApiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
            
            if (posthogApiKey && posthog) {
                // Use PostHog client to submit survey response
                posthog.capture("survey_response", {
                    survey_id: feedbackId,
                    question_id: questionId,
                    question: "What can we do to improve our product?",
                    answer: text,
                });
            }

            // Also store in our database for backup
            const res = await apiRequest("POST", "/api/feedback", {
                feedbackId: feedbackId,
                question: "What can we do to improve our product?",
                answer: text,
            });
            return res.json();
        },
        onSuccess: () => {
            toast({
                title: "Thank you!",
                description: "Your feedback has been submitted successfully.",
            });
            setFeedbackText("");
            onOpenChange(false);
        },
        onError: (error) => {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to submit feedback",
                variant: "destructive",
            });
        },
    });

    const handleSubmit = () => {
        if (!feedbackText.trim()) {
            toast({
                title: "Feedback required",
                description: "Please enter your feedback before submitting.",
                variant: "destructive",
            });
            return;
        }

        submitFeedbackMutation.mutate(feedbackText.trim());
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        Share Your Feedback
                    </DialogTitle>
                    <DialogDescription>
                        What can we do to improve our product?
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Textarea
                            placeholder="Tell us what you think... What features would you like to see? What could be better?"
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            className="min-h-[120px] bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
                            disabled={submitFeedbackMutation.isPending}
                        />
                    </div>

                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setFeedbackText("");
                                onOpenChange(false);
                            }}
                            className="flex-1"
                            disabled={submitFeedbackMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={submitFeedbackMutation.isPending || !feedbackText.trim()}
                            className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                        >
                            {submitFeedbackMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                <>
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    Submit Feedback
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

