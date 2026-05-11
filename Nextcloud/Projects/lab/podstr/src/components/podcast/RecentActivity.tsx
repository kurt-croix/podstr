import { MessageCircle, Zap, Share, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { useRecentZapActivity } from '@/hooks/useZapLeaderboard';
import { usePodcastEpisode } from '@/hooks/usePodcastEpisodes';
import { genUserName } from '@/lib/genUserName';

interface ActivityItemProps {
  userPubkey: string;
  type: 'zap' | 'comment' | 'repost';
  amount?: number;
  episodeId?: string;
  timestamp: Date;
}

function ActivityItem({ userPubkey, type, amount, episodeId, timestamp }: ActivityItemProps) {
  const { data: author } = useAuthor(userPubkey);
  const { data: episode } = usePodcastEpisode(episodeId || '');
  const metadata = author?.metadata;

  const displayName = metadata?.name || metadata?.display_name || genUserName(userPubkey);

  const getActivityIcon = () => {
    switch (type) {
      case 'zap':
        return <Zap className="w-4 h-4 text-yellow-500" />;
      case 'comment':
        return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case 'repost':
        return <Share className="w-4 h-4 text-green-500" />;
    }
  };

  const getActivityText = () => {
    const episodeTitle = episode?.title ? ` "${episode.title}"` : '';
    
    switch (type) {
      case 'zap':
        return `zapped${episodeTitle}${amount ? ` ${formatAmount(amount)} sats` : ''}`;
      case 'comment':
        return `commented on${episodeTitle}`;
      case 'repost':
        return `reposted${episodeTitle}`;
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
    <div className="flex items-start space-x-3 py-3">
      <Avatar className="w-8 h-8">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="text-xs">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2 mb-1">
          {getActivityIcon()}
          <p className="text-sm">
            <span className="font-medium">{displayName}</span>{' '}
            <span className="text-muted-foreground">{getActivityText()}</span>
          </p>
        </div>
        
        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{formatDistanceToNow(timestamp, { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-start space-x-3 py-3">
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center space-x-2">
              <Skeleton className="w-4 h-4" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface RecentActivityProps {
  limit?: number;
  className?: string;
  showTitle?: boolean;
}

export function RecentActivity({
  limit = 20,
  className,
  showTitle = true
}: RecentActivityProps) {
  const { config } = useAppContext();
  if (!config.zapsEnabled) return null;

  const { data: recentZaps, isLoading, error } = useRecentZapActivity(limit);

  if (error) {
    return (
      <Card className={className}>
        {showTitle && (
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="w-5 h-5" />
              <span>Recent Activity</span>
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Failed to load activity
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
            <Clock className="w-5 h-5" />
            <span>Recent Activity</span>
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="pt-0">
        {isLoading ? (
          <ActivitySkeleton />
        ) : recentZaps && recentZaps.length > 0 ? (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {recentZaps.map((activity) => (
              <ActivityItem
                key={activity.id}
                userPubkey={activity.userPubkey}
                type="zap"
                amount={activity.amount}
                episodeId={activity.episodeId || undefined}
                timestamp={activity.timestamp}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
            <p className="text-xs text-muted-foreground">
              Activity will appear here as people engage with the podcast
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}