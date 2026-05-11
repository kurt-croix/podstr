import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface ThemeSwitcherProps {
  className?: string;
}

export function ThemeSwitcher({ className }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();

  const themes = [
    {
      id: 'light' as const,
      label: 'Light',
      icon: Sun,
      description: 'Bright and clean interface',
      color: 'bg-gradient-to-br from-yellow-100 to-white border-yellow-200'
    },
    {
      id: 'dark' as const,
      label: 'Dark',
      icon: Moon,
      description: 'Easy on the eyes',
      color: 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700'
    },
    {
      id: 'system' as const,
      label: 'System',
      icon: Monitor,
      description: 'Follow your device settings',
      color: 'bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200'
    }
  ];

  return (
    <Card className={cn("border-primary/20 bg-gradient-to-br from-primary/5 to-transparent", className)}>
      <CardHeader>
        <CardTitle className="gradient-text text-lg">Theme</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3">
          {themes.map((themeOption) => {
            const Icon = themeOption.icon;
            const isActive = theme === themeOption.id;
            
            return (
              <Button
                key={themeOption.id}
                variant={isActive ? "default" : "outline"}
                className={cn(
                  "w-full justify-start h-auto p-4 transition-all duration-200",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-lg scale-105" 
                    : "hover:bg-accent hover:text-accent-foreground hover:scale-102",
                  "focus-ring"
                )}
                onClick={() => setTheme(themeOption.id)}
              >
                <div className="flex items-center space-x-3 w-full">
                  <div className={cn(
                    "p-2 rounded-lg",
                    isActive 
                      ? "bg-primary-foreground/20" 
                      : themeOption.color
                  )}>
                    <Icon className={cn(
                      "w-5 h-5",
                      isActive ? "text-primary-foreground" : "text-foreground"
                    )} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-medium">{themeOption.label}</div>
                    <div className={cn(
                      "text-xs",
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}>
                      {themeOption.description}
                    </div>
                  </div>
                  {isActive && (
                    <div className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse"></div>
                  )}
                </div>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}