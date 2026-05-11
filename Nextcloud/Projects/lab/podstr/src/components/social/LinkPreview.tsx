import { ExternalLink, Music, Youtube, Globe, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface LinkPreviewProps {
  url: string;
  className?: string;
}

/** Extract Spotify episode/show ID from URL */
function getSpotifyId(url: URL): { type: string; id: string } | null {
  // https://open.spotify.com/episode/7BYWORImRADpKic61tLKql
  // https://open.spotify.com/show/...
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && ['episode', 'show', 'track', 'album', 'playlist'].includes(parts[0])) {
    return { type: parts[0], id: parts[1] };
  }
  return null;
}

/** Extract YouTube video ID from URL */
function getYouTubeId(url: URL): string | null {
  // https://www.youtube.com/watch?v=ID
  // https://youtu.be/ID
  // https://www.youtube.com/embed/ID
  if (url.hostname === 'youtu.be') return url.pathname.slice(1);
  const v = url.searchParams.get('v');
  if (v) return v;
  if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2];
  return null;
}

/** Detect known domains and return embed/component type */
function detectProvider(url: URL): 'spotify' | 'youtube' | 'github' | 'generic' {
  const host = url.hostname;
  if (host.includes('spotify.com')) return 'spotify';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('github.com') || host.includes('github.io')) return 'github';
  return 'generic';
}

/** Get a clean display name from a URL */
function getDisplayDomain(url: URL): string {
  return url.hostname.replace('www.', '');
}

/** Get a readable label from URL path */
function getPathLabel(url: URL): string {
  const path = url.pathname;
  if (!path || path === '/') return '';
  // Take last meaningful segment, decode, strip extension
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1] || '';
  return decodeURIComponent(last.replace(/[-_]/g, ' ').replace(/\.\w+$/, ''));
}

export function LinkPreview({ url: urlStr, className }: LinkPreviewProps) {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return null;
  }

  const provider = detectProvider(url);

  // Spotify embed
  if (provider === 'spotify') {
    const spotify = getSpotifyId(url);
    if (spotify) {
      return (
        <Card className={cn("overflow-hidden border-primary/20 bg-gradient-to-r from-primary/5 to-transparent", className)}>
          <CardContent className="p-0">
            <iframe
              src={`https://open.spotify.com/embed/${spotify.type}/${spotify.id}?utm_source=generator&theme=0`}
              width="100%"
              height="152"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="border-0"
              title="Spotify embed"
            />
          </CardContent>
        </Card>
      );
    }
  }

  // YouTube embed
  if (provider === 'youtube') {
    const ytId = getYouTubeId(url);
    if (ytId) {
      return (
        <Card className={cn("overflow-hidden border-primary/20", className)}>
          <CardContent className="p-0">
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
                className="absolute inset-0 w-full h-full border-0"
                title="YouTube embed"
              />
            </div>
          </CardContent>
        </Card>
      );
    }
  }

  // Fallback: domain-aware link card
  const domain = getDisplayDomain(url);
  const pathLabel = getPathLabel(url);
  const Icon = provider === 'github' ? FileText : Globe;

  // Color coding by provider
  const colorMap = {
    spotify: 'border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400',
    youtube: 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400',
    github: 'border-foreground/20 bg-foreground/5',
    generic: 'border-primary/20 bg-gradient-to-r from-primary/5 to-transparent',
  };
  const colors = colorMap[provider];

  return (
    <Card className={cn("overflow-hidden", colors, className)}>
      <a
        href={urlStr}
        target="_blank"
        rel="noopener noreferrer"
        className="block p-3 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            {provider === 'spotify' ? (
              <Music className="w-5 h-5" />
            ) : provider === 'youtube' ? (
              <Youtube className="w-5 h-5" />
            ) : (
              <Icon className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium opacity-70">
              <span>{domain}</span>
              <ExternalLink className="w-3 h-3" />
            </div>
            {pathLabel && (
              <p className="text-sm font-medium truncate mt-0.5">{pathLabel}</p>
            )}
          </div>
        </div>
      </a>
    </Card>
  );
}
