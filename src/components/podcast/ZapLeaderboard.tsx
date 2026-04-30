import { Crown, Zap, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { useZapLeaderboard } from '@/hooks/useZapLeaderboard';
import { genUserName } from '@/lib/genUserName';
import type { ZapLeaderboardEntry } from '@/types/podcast';

interface ZapLeaderboardProps {
  limit?: number;
  className?: string;
  showTitle?: boolean;
}

interface LeaderboardEntryProps {
  entry: ZapLeaderboardEntry;
  rank: number;
}

function LeaderboardEntry({ entry, rank }: LeaderboardEntryProps) {
  const { data: author } = useAuthor(entry.userPubkey);
  const metadata = author?.metadata;

  const displayName = metadata?.name || metadata?.display_name || genUserName(entry.userPubkey);
  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-4 h-4 text-yellow-500" />;
      case 2:
        return <Crown className="w-4 h-4 text-gray-400" />;
      case 3:
        return <Crown className="w-4 h-4 text-orange-600" />;
      default:
        return <span className="w-4 h-4 flex items-center justify-center text-xs font-bold text-muted-foreground">#{rank}</span>;
    }
  };

  const formatAmount = (sats: number): string => {
    if (sats >= 1000000) {
      return `${(sats / 1000000).toFixed(1)}M`;
    } else if (sats >= 1000) {
      return `${(sats / 1000).toFixed(1)}K`;
    }
    return sats.toString();
  };

  return (
    <div className="flex items-center space-x-3 py-3">
      <div className="flex-shrink-0">
        {getRankIcon(rank)}
      </div>
      
      <Avatar className="w-8 h-8">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="text-xs">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium truncate">{displayName}</p>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" className="text-xs">
              <Zap className="w-3 h-3 mr-1" />
              {formatAmount(entry.totalAmount)}
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
          <span>{entry.zapCount} zaps</span>
          <div className="flex items-center space-x-1">
            <Calendar className="w-3 h-3" />
            <span>
              {formatDistanceToNow(entry.lastZapDate, { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center space-x-3 py-3">
          <Skeleton className="w-4 h-4" />
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="flex items-center space-x-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ZapLeaderboard({
  limit = 10,
  className,
  showTitle = true
}: ZapLeaderboardProps) {
  const { config } = useAppContext();
  if (!config.zapsEnabled) return null;

  const { data: leaderboard, isLoading, error } = useZapLeaderboard(limit);

  if (error) {
    return (
      <Card className={className}>
        {showTitle && (
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Zap className="w-5 h-5" />
              <span>Top Supporters</span>
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Failed to load leaderboard
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      {showTitle && (
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="w-5 h-5" />
            <span>Top Supporters</span>
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="pt-0">
        {isLoading ? (
          <LeaderboardSkeleton />
        ) : leaderboard && leaderboard.length > 0 ? (
          <div className="space-y-1">
            {leaderboard.map((entry, index) => (
              <LeaderboardEntry
                key={entry.userPubkey}
                entry={entry}
                rank={index + 1}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Zap className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No zaps yet</p>
            <p className="text-xs text-muted-foreground">
              Be the first to support this podcast!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}