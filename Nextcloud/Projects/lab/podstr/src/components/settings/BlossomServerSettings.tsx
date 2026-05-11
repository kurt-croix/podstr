import { useState } from 'react';
import { Plus, X, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/useToast';
import { useBlossomServers, isValidBlossomServerUrl, DEFAULT_BLOSSOM_SERVERS } from '@/hooks/useBlossomServers';

export function BlossomServerSettings() {
  const { userServers, allServers, isLoading, updateServers, isUpdating } = useBlossomServers();
  const { toast } = useToast();
  const [newServerUrl, setNewServerUrl] = useState('');

  const handleAddServer = async () => {
    if (!newServerUrl.trim()) return;

    const url = newServerUrl.trim();
    
    if (!isValidBlossomServerUrl(url)) {
      toast({
        title: 'Invalid URL',
        description: 'Please enter a valid HTTP or HTTPS URL.',
        variant: 'destructive',
      });
      return;
    }

    if (userServers.includes(url)) {
      toast({
        title: 'Server already added',
        description: 'This server is already in your list.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updateServers([...userServers, url]);
      setNewServerUrl('');
      toast({
        title: 'Server added',
        description: 'Blossom server has been added to your preferences.',
      });
    } catch (error) {
      toast({
        title: 'Failed to add server',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveServer = async (serverToRemove: string) => {
    try {
      const updatedServers = userServers.filter(server => server !== serverToRemove);
      await updateServers(updatedServers);
      toast({
        title: 'Server removed',
        description: 'Blossom server has been removed from your preferences.',
      });
    } catch (error) {
      toast({
        title: 'Failed to remove server',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleResetToDefaults = async () => {
    try {
      await updateServers(DEFAULT_BLOSSOM_SERVERS);
      toast({
        title: 'Servers reset',
        description: 'Blossom servers have been reset to defaults.',
      });
    } catch (error) {
      toast({
        title: 'Failed to reset servers',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 px-8 text-center">
          <div className="flex items-center justify-center space-x-2">
            <Server className="w-4 h-4 animate-pulse" />
            <span className="text-muted-foreground">Loading server preferences...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Server className="w-5 h-5" />
          <span>Blossom File Servers</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure your preferred Blossom servers for file uploads. Your files will be uploaded to these servers in order of preference.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add new server */}
        <div className="space-y-3">
          <Label>Add New Server</Label>
          <div className="flex space-x-2">
            <Input
              placeholder="https://your-blossom-server.com"
              value={newServerUrl}
              onChange={(e) => setNewServerUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddServer()}
              disabled={isUpdating}
            />
            <Button 
              onClick={handleAddServer} 
              disabled={isUpdating || !newServerUrl.trim()}
              variant="outline"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Current servers */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Your Servers</Label>
            {userServers.length > 0 && (
              <Button 
                onClick={handleResetToDefaults}
                disabled={isUpdating}
                variant="ghost"
                size="sm"
              >
                Reset to Defaults
              </Button>
            )}
          </div>
          
          {userServers.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 px-3 border-2 border-dashed rounded-lg text-center">
              No custom servers configured. Using defaults: {DEFAULT_BLOSSOM_SERVERS.join(', ')}
            </div>
          ) : (
            <div className="space-y-2">
              {userServers.map((server, index) => (
                <div 
                  key={server}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <Badge variant="outline" className="text-xs">
                      #{index + 1}
                    </Badge>
                    <code className="text-sm">{server}</code>
                  </div>
                  <Button
                    onClick={() => handleRemoveServer(server)}
                    disabled={isUpdating}
                    variant="ghost"
                    size="sm"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All servers (combined) */}
        <div className="space-y-3">
          <Label>Upload Order</Label>
          <p className="text-xs text-muted-foreground">
            Files will be uploaded to these servers in this order:
          </p>
          <div className="space-y-1">
            {allServers.map((server, index) => (
              <div 
                key={server}
                className="flex items-center space-x-3 p-2 bg-muted/50 rounded text-sm"
              >
                <Badge variant={userServers.includes(server) ? "default" : "secondary"} className="text-xs">
                  #{index + 1}
                </Badge>
                <code className="flex-1">{server}</code>
                {userServers.includes(server) ? (
                  <Badge variant="outline" className="text-xs">Custom</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Default</Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Help text */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Note:</strong> Blossom servers store your files using content-addressed storage (SHA-256 hashes).
          </p>
          <p>
            Files uploaded to any Blossom server can be retrieved from other servers using the same hash.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}