import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Upload, Play, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePublishTrailer } from '@/hooks/usePublishTrailer';
import { useToast } from '@/hooks/useToast';
import { isPodcastCreator } from '@/lib/podcastConfig';
import type { TrailerFormData } from '@/types/podcast';

const trailerSchema = z.object({
  title: z.string().min(1, 'Title is required').max(128, 'Title must be 128 characters or less'),
  url: z.string().url().optional().or(z.literal('')),
  length: z.number().positive().optional(),
  season: z.number().positive().optional(),
});

type TrailerFormValues = z.infer<typeof trailerSchema>;

interface PublishTrailerFormProps {
  onSuccess?: (trailerId: string) => void;
  onCancel?: () => void;
  className?: string;
}

export function PublishTrailerForm({ 
  onSuccess, 
  onCancel, 
  className 
}: PublishTrailerFormProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishTrailer } = usePublishTrailer();
  const { toast } = useToast();
  
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [publishingState, setPublishingState] = useState<'idle' | 'uploading' | 'publishing' | 'success' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState<string>('');

  const form = useForm<TrailerFormValues>({
    resolver: zodResolver(trailerSchema),
    defaultValues: {
      title: '',
      url: '',
    },
  });

  // Check if user is the creator
  if (!user || !isPodcastCreator(user.pubkey)) {
    return (
      <Card className={className}>
        <CardContent className="py-12 px-8 text-center">
          <p className="text-muted-foreground">
            Only the podcast creator can publish trailers.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type - support both audio and video trailers
      if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
        toast({
          title: 'Invalid file type',
          description: 'Please select an audio file (MP3, WAV, etc.) or video file (MP4, WebM, etc.).',
          variant: 'destructive',
        });
        return;
      }
      
      // Validate file size - more generous limit for video trailers
      const maxSize = file.type.startsWith('video/') ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({
          title: 'File too large',
          description: `${file.type.startsWith('video/') ? 'Video' : 'Audio'} trailers must be less than ${file.type.startsWith('video/') ? '100MB' : '50MB'}.`,
          variant: 'destructive',
        });
        return;
      }
      
      setMediaFile(file);
      form.setValue('url', '');
      form.setValue('length', file.size);
      
      const fileType = file.type.startsWith('video/') ? 'video' : 'audio';
      toast({
        title: `${fileType} trailer selected`,
        description: `${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
      });
    }
  };

  const onSubmit = async (data: TrailerFormValues) => {
    // Prevent double submissions
    if (publishingState !== 'idle') {
      return;
    }

    try {
      console.log('Trailer form submission data:', data);
      console.log('Media file:', mediaFile);
      
      // Validate that we have either media file or URL
      if (!mediaFile && !data.url) {
        toast({
          title: 'Audio/Video required',
          description: 'Please provide either a trailer file or URL.',
          variant: 'destructive',
        });
        return;
      }

      // Start the publishing process
      if (mediaFile) {
        setPublishingState('uploading');
        setUploadProgress(`Uploading ${mediaFile.name}...`);
      } else {
        setPublishingState('publishing');
        setUploadProgress('Publishing trailer...');
      }
      
      const trailerData: TrailerFormData = {
        ...data,
        audioFile: mediaFile || undefined,
        audioType: mediaFile ? mediaFile.type : undefined,
        // Clean up empty URL strings
        url: data.url || undefined,
        length: data.length || mediaFile?.size,
      };

      console.log('Publishing trailer data:', trailerData);
      
      // Update progress for publishing phase
      setPublishingState('publishing');
      setUploadProgress('Publishing to Nostr network...');
      
      const trailerId = await publishTrailer(trailerData);
      
      // Success state
      setPublishingState('success');
      setUploadProgress('Trailer published successfully!');
      
      toast({
        title: 'Trailer published!',
        description: 'Your podcast trailer has been published and will appear in your RSS feed.',
      });

      // Wait a moment to show success state, then reset
      setTimeout(() => {
        setPublishingState('idle');
        setUploadProgress('');
        onSuccess?.(trailerId);
        
        // Reset form
        form.reset();
        setMediaFile(null);
      }, 2000);
      
    } catch (error) {
      setPublishingState('error');
      setUploadProgress('Publishing failed. Please try again.');
      
      toast({
        title: 'Failed to publish trailer',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });

      // Reset to idle after showing error
      setTimeout(() => {
        setPublishingState('idle');
        setUploadProgress('');
      }, 3000);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="w-5 h-5" />
          Publish Podcast Trailer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trailer Title *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Coming April 1st, 2021" 
                      maxLength={128}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    Maximum 128 characters
                  </p>
                </FormItem>
              )}
            />

            {/* Audio/Video Upload/URL */}
            <div className="space-y-4">
              <Label>Trailer File *</Label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Upload Trailer File</Label>
                  <div className="mt-1">
                    <input
                      type="file"
                      accept="audio/*,video/*"
                      onChange={handleMediaFileChange}
                      className="hidden"
                      id="trailer-upload"
                    />
                    <label htmlFor="trailer-upload">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400">
                        <Upload className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm text-gray-500">
                          {mediaFile ? (
                            <span className="text-green-600 font-medium">
                              ✓ {mediaFile.name}
                            </span>
                          ) : (
                            'Click to upload trailer'
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Audio files up to 50MB, video files up to 100MB
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <FormField
                    control={form.control}
                    name="url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm text-muted-foreground">
                          Or Enter Trailer URL
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://example.com/trailer.mp3"
                            disabled={!!mediaFile}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Optional Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="season"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Season Number (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="1"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      Leave empty for general podcast trailer
                    </p>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="length"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>File Size (bytes)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="Auto-detected for uploads"
                        disabled={!!mediaFile}
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      Automatically set when uploading files
                    </p>
                  </FormItem>
                )}
              />
            </div>

            {/* Information */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">About Podcast Trailers</h4>
              <p className="text-sm text-blue-700 mb-3">
                Trailers are short promotional audio or video clips that give listeners a preview of your podcast. 
                They help new audiences discover your content and are automatically included in your RSS feed.
              </p>
              <div className="text-sm text-blue-700">
                <strong>Ideas for trailers:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li><strong>Audio:</strong> Highlight reels, upcoming episode previews, host introductions</li>
                  <li><strong>Video:</strong> Behind-the-scenes clips, visual introductions, animated previews</li>
                </ul>
              </div>
            </div>

            {/* Progress Indicator */}
            {publishingState !== 'idle' && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  {publishingState === 'uploading' || publishingState === 'publishing' ? (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  ) : publishingState === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : publishingState === 'error' ? (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  ) : null}
                  
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      publishingState === 'success' ? 'text-green-800' :
                      publishingState === 'error' ? 'text-red-800' :
                      'text-gray-800'
                    }`}>
                      {uploadProgress}
                    </p>
                    {publishingState === 'uploading' && (
                      <p className="text-xs text-gray-600 mt-1">
                        This may take a moment for larger files...
                      </p>
                    )}
                    {publishingState === 'publishing' && (
                      <p className="text-xs text-gray-600 mt-1">
                        Broadcasting to Nostr relays...
                      </p>
                    )}
                    {publishingState === 'success' && (
                      <p className="text-xs text-green-600 mt-1">
                        Your trailer will appear in the RSS feed and on the about page.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex justify-end space-x-3">
              {onCancel && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={onCancel}
                  disabled={publishingState === 'uploading' || publishingState === 'publishing'}
                >
                  Cancel
                </Button>
              )}
              <Button 
                type="submit" 
                disabled={publishingState === 'uploading' || publishingState === 'publishing' || publishingState === 'success'}
              >
                {publishingState === 'uploading' && (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                )}
                {publishingState === 'publishing' && (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Publishing...
                  </>
                )}
                {publishingState === 'success' && (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Published!
                  </>
                )}
                {(publishingState === 'idle' || publishingState === 'error') && 'Publish Trailer'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}