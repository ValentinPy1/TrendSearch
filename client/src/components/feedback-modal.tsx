import { useState } from "react";
import { usePostHog } from "posthog-js/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface FeedbackModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const FEEDBACK_SURVEY_ID = "019a8285-58ca-0000-ba7a-8d17e7f72830";
const QUESTION_ID = "5ed84a1c-1803-4d20-9da0-24dc9a0e0d0f";

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
    const { toast } = useToast();
    const posthog = usePostHog();
    const [feedbackText, setFeedbackText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!feedbackText.trim()) {
            toast({
                title: "Feedback required",
                description: "Please enter your feedback before submitting.",
                variant: "destructive",
            });
            return;
        }

        setIsSubmitting(true);

        try {
            // Send to PostHog using survey sent event format
            if (posthog) {
                posthog.capture("survey sent", {
                    $survey_id: FEEDBACK_SURVEY_ID,
                    $survey_response_5ed84a1c_1803_4d20_9da0_24dc9a0e0d0f: feedbackText.trim(),
                });
            }

            // Also store in our database for backup
            try {
                await apiRequest("POST", "/api/feedback", {
                    feedbackId: FEEDBACK_SURVEY_ID,
                    question: "What can we do to improve our product?",
                    answer: feedbackText.trim(),
                });
            } catch (error) {
                console.error("Failed to save feedback to database:", error);
                // Don't fail the whole operation if database save fails
            }

            toast({
                title: "Thank you!",
                description: "Your feedback has been submitted successfully.",
            });

            setFeedbackText("");
            onOpenChange(false);
        } catch (error) {
            console.error("Error submitting feedback:", error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to submit feedback",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDismiss = () => {
        setFeedbackText("");
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleDismiss}>
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
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={handleDismiss}
                            className="flex-1"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !feedbackText.trim()}
                            className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                        >
                            {isSubmitting ? (
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
