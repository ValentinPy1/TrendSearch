import { cn } from "@/lib/utils";

interface GlassmorphicCardProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassmorphicCard({ children, className }: GlassmorphicCardProps) {
  return (
    <div 
      className={cn(
        "bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/20",
        className
      )}
    >
      {children}
    </div>
  );
}
