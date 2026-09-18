"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

export function JudgmentLoading() {
  const [progress, setProgress] = useState(15);

  useEffect(() => {
    // Gentle progress simulation indicating staged batch processing without faking multiple network calls
    const timer1 = setTimeout(() => setProgress(45), 200);
    const timer2 = setTimeout(() => setProgress(75), 600);
    const timer3 = setTimeout(() => setProgress(90), 1200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-5 p-6 rounded-2xl border border-border/80 bg-card text-card-foreground shadow-xs animate-in fade-in-50 duration-200"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Spinner className="size-4 text-foreground" />
          <span className="font-semibold text-sm text-foreground">Judging 11 signals…</span>
        </div>
        <Badge variant="outline" className="text-[11px] font-normal">
          One batched request
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        <Progress value={progress} className="h-1.5 w-full [&_[data-slot=progress-indicator]]:bg-foreground" />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Atomic System One questions</span>
          <span>Single Jev roundtrip</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-1">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-6 w-48 rounded-lg" />
        </div>
        <Skeleton className="h-4 w-3/4 rounded-md" />

        <div className="flex flex-col gap-2.5 pt-2">
          <Skeleton className="h-3 w-full rounded-sm" />
          <Skeleton className="h-3 w-5/6 rounded-sm" />
          <Skeleton className="h-3 w-4/6 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
