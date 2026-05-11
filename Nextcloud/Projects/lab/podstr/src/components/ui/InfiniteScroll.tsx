import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface InfiniteScrollProps {
  children: React.ReactNode;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  className?: string;
  threshold?: number;
}

export function InfiniteScroll({
  children,
  hasMore,
  isLoading,
  onLoadMore,
  className,
  threshold = 100,
}: InfiniteScrollProps) {
  const observerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !isLoading) {
          onLoadMore();
        }
      },
      {
        rootMargin: `${threshold}px`,
      }
    );

    const currentObserverRef = observerRef.current;
    if (currentObserverRef) {
      observer.observe(currentObserverRef);
    }

    return () => {
      if (currentObserverRef) {
        observer.unobserve(currentObserverRef);
      }
    };
  }, [hasMore, isLoading, onLoadMore, threshold]);

  return (
    <div className={cn('space-y-4', className)}>
      {children}
      {hasMore && (
        <div ref={observerRef} className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}
    </div>
  );
}