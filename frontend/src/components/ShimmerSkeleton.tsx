interface SkeletonProps { className?: string; }

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`shimmer rounded-md ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border p-6" style={{ borderColor: 'rgba(0,229,255,0.08)', background: 'rgba(13,17,23,0.85)' }}>
      <Skeleton className="h-3 w-24 mb-4" />
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex gap-4 items-center px-4 py-3">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-36" />
      <Skeleton className="h-3 w-12" />
      <Skeleton className="h-3 w-14" />
      <Skeleton className="h-5 w-20 rounded-full" />
    </div>
  );
}

export function SkeletonTimeline() {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex flex-col items-center">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="w-[1px] h-12 mt-1" />
      </div>
      <div className="flex-1 pb-6">
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}
