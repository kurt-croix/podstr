import { Link, useLocation } from 'react-router-dom';
import { Headphones, List, Users, MessageSquare, User, Rss, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePodcastConfig } from '@/hooks/usePodcastConfig';
import { isPodcastCreator } from '@/lib/podcastConfig';
import { cn } from '@/lib/utils';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const location = useLocation();
  const { user } = useCurrentUser();
  const podcastConfig = usePodcastConfig();
  const isCreator = user && isPodcastCreator(user.pubkey);

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const navItems = [
    {
      path: '/',
      icon: Headphones,
      label: 'Home',
      description: 'Overview & latest episode'
    },
    {
      path: '/episodes',
      icon: List,
      label: 'Episodes',
      description: 'Browse all episodes'
    },
    {
      path: '/social',
      icon: MessageSquare,
      label: 'Social',
      description: 'Creator updates'
    },
    {
      path: '/community',
      icon: Users,
      label: 'Community',
      description: 'Engage with listeners'
    }
  ];

  const secondaryItems = [
    {
      path: '/about',
      icon: User,
      label: 'About',
      description: 'Podcast info'
    },
    {
      path: 'https://kurt-croix.github.io/podstr/rss.xml',
      icon: Rss,
      label: 'RSS Feed',
      description: 'Subscribe',
      external: true
    }
  ];

  return (
    <aside className={cn(
      "w-64 h-screen bg-navy border-r border-gold/10 flex-shrink-0 sticky top-0",
      "hidden lg:flex lg:flex-col",
      className
    )}>
      {/* Logo */}
      <div className="p-6 border-b border-gold/15">
        <Link to="/" className="flex items-center space-x-3 hover:opacity-90 transition-opacity group">
          <div className="relative">
            <Headphones className="w-8 h-8 text-gold group-hover:scale-110 transition-transform duration-200" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white font-serif truncate">{podcastConfig.podcast.title}</h1>
            <p className="text-xs text-gold/60">
              Proof Over Promises
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-6">
        {/* Main Navigation */}
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-gold/50 px-3 mb-3 uppercase tracking-wider">Navigate</h3>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <Button
                key={item.path}
                variant="ghost"
                size="sm"
                asChild
                className={cn(
                  "w-full justify-start h-auto py-3 px-3 transition-all duration-200 text-white/70 hover:text-white hover:bg-white/10",
                  active && "bg-gold/15 text-gold shadow-sm border-l-2 border-gold"
                )}
              >
                <Link to={item.path} className="flex items-start space-x-3">
                  <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <div className="text-left min-w-0">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-white/40 truncate">{item.description}</div>
                  </div>
                </Link>
              </Button>
            );
          })}
        </div>

        {/* Secondary Navigation */}
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-gold/50 px-3 mb-3 uppercase tracking-wider">More</h3>
          {secondaryItems.map((item) => {
            const Icon = item.icon;
            const active = !item.external && isActive(item.path);

            return (
              <Button
                key={item.path}
                variant="ghost"
                size="sm"
                asChild
                className={cn(
                  "w-full justify-start h-auto py-3 px-3 transition-all duration-200 text-white/70 hover:text-white hover:bg-white/10",
                  active && "bg-gold/15 text-gold shadow-sm border-l-2 border-gold"
                )}
              >
                {item.external ? (
                  <a
                    href={item.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start space-x-3"
                  >
                    <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div className="text-left min-w-0">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-white/40 truncate">{item.description}</div>
                    </div>
                  </a>
                ) : (
                  <Link to={item.path} className="flex items-start space-x-3">
                    <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div className="text-left min-w-0">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-white/40 truncate">{item.description}</div>
                    </div>
                  </Link>
                )}
              </Button>
            );
          })}
        </div>

        {/* Creator Studio */}
        {isCreator && (
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-gold/50 px-3 mb-3 uppercase tracking-wider">Creator</h3>
            <Button
              size="sm"
              asChild
              className="w-full justify-start h-auto py-3 px-3 bg-gold/20 hover:bg-gold/30 text-gold transition-all"
            >
              <Link to="/studio" className="flex items-start space-x-3">
                <Settings className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="text-left min-w-0">
                  <div className="font-medium">Studio</div>
                  <div className="text-xs text-gold/60 truncate">Creator tools</div>
                </div>
              </Link>
            </Button>
          </div>
        )}
      </nav>

      {/* Bottom accent */}
      <div className="h-1 bg-gradient-to-r from-crimson via-gold to-crimson" />
    </aside>
  );
}
