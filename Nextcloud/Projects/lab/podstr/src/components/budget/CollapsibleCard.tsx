import { useState, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleCardProps {
  title: string;
  children: ReactNode;
  /** Whether this card spans the full row (default: false) */
  fullWidth?: boolean;
  /** Extra content in the header (filters, etc.) */
  headerExtra?: ReactNode;
  /** Whether the card starts collapsed (default: false) */
  defaultOpen?: boolean;
  className?: string;
}

/** A collapsible card with red accent header matching the static site theme */
export function CollapsibleCard({
  title,
  children,
  fullWidth = false,
  headerExtra,
  defaultOpen = true,
  className,
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card
        className={cn(
          'bg-gradient-to-br from-[#e60000]/5 to-transparent shadow-sm',
          'border border-[#e60000]/20 hover:border-[#e60000]/40',
          'transition-all duration-300 hover:-translate-y-1 hover:shadow-lg',
          fullWidth && 'col-span-full',
          className,
        )}
      >
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[#e60000] text-sm font-semibold flex items-center gap-2">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {title}
              </CardTitle>
              {headerExtra && (
                <div onClick={e => e.stopPropagation()}>
                  {headerExtra}
                </div>
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
