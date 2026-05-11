import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { LoginArea } from '@/components/auth/LoginArea';
import { PenTool, Send, Image, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

import type { NostrEvent } from '@nostrify/nostrify';

interface NoteComposerProps {
  onSuccess?: (event?: NostrEvent) => void;
  placeholder?: string;
  className?: string;
}

export function NoteComposer({
  onSuccess, 
  placeholder = "What's on your mind?",
  className
}: NoteComposerProps) {
  const [content, setContent] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { user } = useCurrentUser();
  const { mutate: createEvent, isPending } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedImage(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!content.trim() && !selectedImage) || !user) return;

    try {
      let noteContent = content.trim();
      const tags: string[][] = [];

      // Upload image if selected
      if (selectedImage) {
        const imageTags = await uploadFile(selectedImage);
        const imageUrl = imageTags[0][1]; // First tag contains the URL
        
        // Add image URL to content
        if (noteContent) {
          noteContent += `\n\n${imageUrl}`;
        } else {
          noteContent = imageUrl;
        }

        // Add imeta tag for the image (NIP-94)
        tags.push(...imageTags);
      }

      const eventData = { 
        kind: 1, 
        content: noteContent,
        tags
      };

      createEvent(
        eventData,
        {
          onSuccess: (publishedEvent) => {
            setContent('');
            removeImage();
            toast({
              title: "Note published!",
              description: selectedImage ? "Your note with image has been published to the network." : "Your note has been published to the network.",
            });
            // Immediately call success with the event data for optimistic updates
            onSuccess?.({
              ...eventData,
              ...publishedEvent,
              content: noteContent
            });
          },
          onError: () => {
            toast({
              title: "Failed to publish note",
              description: "Please try again.",
              variant: "destructive",
            });
          }
        }
      );
    } catch {
      toast({
        title: "Failed to upload image",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!user) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2 text-muted-foreground">
              <PenTool className="h-5 w-5" />
              <span>Sign in to create a note</span>
            </div>
            <LoginArea />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center space-x-2">
          <PenTool className="h-5 w-5" />
          <span>Create a Note</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            className="min-h-[120px] resize-none"
            disabled={isPending || isUploading}
          />

          {/* Image preview */}
          {imagePreview && (
            <div className="relative">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-w-full h-auto max-h-60 rounded-lg border"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={removeImage}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                Share your thoughts with the community
              </span>
              
              {/* Image upload button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending || isUploading}
                className="text-muted-foreground hover:text-foreground"
              >
                <Image className="h-4 w-4" />
              </Button>
            </div>

            <Button 
              type="submit" 
              disabled={(!content.trim() && !selectedImage) || isPending || isUploading}
            >
              <Send className="h-4 w-4 mr-2" />
              {isPending ? 'Publishing...' : isUploading ? 'Uploading...' : 'Publish Note'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}