// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { useState } from 'react';
import { User, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import LoginDialog from './LoginDialog';
import SignupDialog from './SignupDialog';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { AccountSwitcher } from './AccountSwitcher';
import { cn } from '@/lib/utils';

export interface LoginAreaProps {
  className?: string;
}

export function LoginArea({ className }: LoginAreaProps) {
  const { currentUser } = useLoggedInAccounts();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [signupDialogOpen, setSignupDialogOpen] = useState(false);

  const handleLogin = () => {
    setLoginDialogOpen(false);
    setSignupDialogOpen(false);
  };

  return (
    <div className={cn("inline-flex items-center justify-center", className)}>
      {currentUser ? (
        <AccountSwitcher onAddAccountClick={() => setLoginDialogOpen(true)} />
      ) : (
        <div className={cn(
          "flex justify-center",
          className?.includes('w-full') ? "flex-col gap-2" : "flex-row gap-2"
        )}>
          <Button
            onClick={() => setLoginDialogOpen(true)}
            className={cn(
              'flex items-center gap-1.5 py-2 rounded-full bg-primary text-primary-foreground font-medium transition-all hover:bg-primary/90 animate-scale-in text-sm min-w-0',
              className?.includes('w-full') ? "px-4 justify-center w-full" : "px-3"
            )}
          >
            <User className='w-4 h-4 flex-shrink-0' />
            <span className='truncate'>Log in</span>
          </Button>
          <Button
            onClick={() => setSignupDialogOpen(true)}
            variant="outline"
            className={cn(
              "flex items-center gap-1.5 py-2 rounded-full font-medium transition-all text-sm min-w-0",
              className?.includes('w-full') ? "px-4 justify-center w-full" : "px-3"
            )}
          >
            <UserPlus className="w-4 h-4 flex-shrink-0" />
            <span className='truncate'>Sign Up</span>
          </Button>
        </div>
      )}

      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={handleLogin}
        onSignup={() => setSignupDialogOpen(true)}
      />

      <SignupDialog
        isOpen={signupDialogOpen}
        onClose={() => setSignupDialogOpen(false)}
      />
    </div>
  );
}