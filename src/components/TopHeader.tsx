import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Headphones, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoginArea } from '@/components/auth/LoginArea';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import { usePodcastConfig } from '@/hooks/usePodcastConfig';
import { cn } from '@/lib/utils';
import { MobileSidebar } from '@/components/MobileSidebar';

interface TopHeaderProps {
  className?: string;
}

export function TopHeader({ className }: TopHeaderProps) {
  const podcastConfig = usePodcastConfig();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className={cn(
      "border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm",
      className
    )}>
      <div className="container mx-auto lg:max-w-none lg:mx-0 px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Hamburger Menu + Logo */}
          <div className="flex items-center space-x-3">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="focus-ring">
                  <Menu className="w-5 h-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <MobileSidebar onNavigate={() => setIsMobileMenuOpen(false)} />
              </SheetContent>
            </Sheet>

            <Link to="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
              <Headphones className="w-6 h-6 text-primary" />
              <h1 className="text-lg font-bold gradient-text truncate">
                {podcastConfig.podcast.title}
              </h1>
            </Link>
          </div>

          {/* Login area */}
          <div className="ml-auto">
            <LoginArea className="max-w-60" />
          </div>
        </div>
      </div>
    </header>
  );
}
