import { useState } from 'react';
import { Plus, X, Server, Globe, Check, AlertCircle, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useBlossomServers, DEFAULT_BLOSSOM_SERVERS, isValidBlossomServerUrl } from '@/hooks/useBlossomServers';
import { useToast } from '@/hooks/useToast';

export function BlossomServerManager() {
  const { userServers, allServers, isLoading, updateServers, isUpdating } = useBlossomServers();
  const { toast } = useToast();
  const [newServerUrl, setNewServerUrl] = useState('');
  const [tempServers, setTempServers] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // Initialize temp servers when editing starts
  const startEditing = () => {
    setTempServers([...userServers]);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setTempServers([]);
    setNewServerUrl('');
    setIsEditing(false);
  };

  const addServer = () => {
    const url = newServerUrl.trim();
    
    if (!url) {
      toast({
        title: "Invalid URL",
        description: "Please enter a server URL.",
        variant: "destructive",
      });
      return;
    }

    if (!isValidBlossomServerUrl(url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid HTTP or HTTPS URL.",
        variant: "destructive",
      });
      return;
    }

    if (tempServers.includes(url)) {
      toast({
        title: "Server already exists",
        description: "This server is already in your list.",
        variant: "destructive",
      });
      return;
    }

    setTempServers(prev => [...prev, url]);
    setNewServerUrl('');
  };

  const removeServer = (serverUrl: string) => {
    setTempServers(prev => prev.filter(url => url !== serverUrl));
  };

  const saveServers = async () => {
    try {
      await updateServers(tempServers);
      toast({
        title: "Servers updated!",
        description: "Your Blossom server list has been published to the network.",
      });
      setIsEditing(false);
      setTempServers([]);
    } catch (error) {
      toast({
        title: "Failed to update servers",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const resetToDefaults = () => {
    setTempServers([...DEFAULT_BLOSSOM_SERVERS]);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Server className="w-5 h-5" />
            <span>Blossom Server Configuration</span>
            {isEditing && <Badge variant="secondary">Editing</Badge>}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Manage your media storage servers. These servers will be used for uploading podcast audio files, episode artwork, and images for social posts.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="flex items-center space-x-1">
                <Globe className="w-3 h-3" />
                <span>{userServers.length} User Servers</span>
              </Badge>
              <Badge variant="outline" className="flex items-center space-x-1">
                <Server className="w-3 h-3" />
                <span>{allServers.length} Total Available</span>
              </Badge>
            </div>

            {!isEditing ? (
              <Button onClick={startEditing}>
                <Plus className="w-4 h-4 mr-2" />
                Manage Servers
              </Button>
            ) : (
              <div className="flex items-center space-x-2">
                <Button variant="outline" onClick={cancelEditing} disabled={isUpdating}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={saveServers} disabled={isUpdating}>
                  <Check className="w-4 h-4 mr-2" />
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            )}
          </div>

          {/* Server List */}
          <div className="space-y-4">
            <Label>
              {isEditing ? 'Your Custom Servers (Editing)' : 'Your Custom Servers'}
            </Label>
            
            {/* Custom Servers */}
            <div className="space-y-2">
              {(isEditing ? tempServers : userServers).map((serverUrl, index) => (
                <div key={serverUrl} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{serverUrl}</p>
                      <p className="text-sm text-muted-foreground">Custom server #{index + 1}</p>
                    </div>
                  </div>
                  {isEditing && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeServer(serverUrl)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}

              {(isEditing ? tempServers : userServers).length === 0 && (
                <div className="p-6 text-center border border-dashed rounded-lg">
                  <Server className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {isEditing ? 'No custom servers configured' : 'Using default servers only'}
                  </p>
                </div>
              )}
            </div>

            {/* Add Server Form (only when editing) */}
            {isEditing && (
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <Label htmlFor="new-server">Add New Server</Label>
                <div className="flex space-x-2">
                  <Input
                    id="new-server"
                    value={newServerUrl}
                    onChange={(e) => setNewServerUrl(e.target.value)}
                    placeholder="https://blossom.example.com"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        addServer();
                      }
                    }}
                  />
                  <Button onClick={addServer} disabled={!newServerUrl.trim()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetToDefaults}
                    className="text-xs"
                  >
                    Reset to Defaults
                  </Button>
                </div>
              </div>
            )}

            {/* Default Servers (Read Only) */}
            <div className="space-y-2">
              <Label>Default Servers (Always Available)</Label>
              {DEFAULT_BLOSSOM_SERVERS.map((serverUrl, index) => (
                <div key={serverUrl} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center space-x-3">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{serverUrl}</p>
                      <p className="text-sm text-muted-foreground">Default server #{index + 1}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">Default</Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Information Alert */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>How it works:</strong> Files are uploaded to your custom servers first, then fall back to default servers if needed. 
              Your server list is published as a Nostr event (kind 10063) so other clients can use your preferences.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}