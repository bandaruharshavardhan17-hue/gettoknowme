import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface WaveformIndicatorProps {
  audioLevel: number;
  isRecording: boolean;
  className?: string;
}

export function WaveformIndicator({ audioLevel, isRecording, className }: WaveformIndicatorProps) {
  const barsCount = 5;
  
  // Generate bar heights based on audio level with some variation
  const getBarHeight = (index: number) => {
    if (!isRecording) return 4;
    
    const baseHeight = Math.max(4, audioLevel * 40);
    // Add variation based on bar position
    const variation = Math.sin((index + Date.now() / 100) * 0.5) * 8;
    return Math.min(32, Math.max(4, baseHeight + variation));
  };

  return (
    <div className={cn("flex items-center justify-center gap-0.5 h-8", className)}>
      {Array.from({ length: barsCount }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "w-1 rounded-full transition-all duration-75",
            isRecording ? "bg-destructive" : "bg-muted-foreground/30"
          )}
          style={{
            height: `${getBarHeight(index)}px`,
          }}
        />
      ))}
    </div>
  );
}
