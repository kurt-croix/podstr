import { useSeoMeta } from '@unhead/react';
import { useState, useMemo } from 'react';
import { MessageSquare, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Layout } from '@/components/Layout';
import { PostCard } from '@/components/social/PostCard';
import { ConversationThread } from '@/components/social/ConversationThread';
import { NoteComposer } from '@/components/social/NoteComposer';
import { useCreatorPosts, useCreatorRepliesTab } from '@/hooks/useCreatorPosts';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useQueryClient } from '@tanstack/react-query';
import { getCreatorPubkeyHex, isPodcastCreator, PODCAST_CONFIG } from '@/lib/podcastConfig';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

const PAGE_SIZE = 10;

const SocialFeed = () => {
  const [notesPage, setNotesPage] = useState(1);
  const [repliesPage, setRepliesPage] = useState(1);

  const {
    data: postsData,
    isFetching: isFetchingPosts,
    isLoading: postsLoading,
    error: postsError,
  } = useCreatorPosts(50); // Fetch more to have enough for pagination

  const {
    data: repliesData,
    isFetching: isFetchingReplies,
    isLoading: repliesLoading,
  } = useCreatorRepliesTab(50);

  const { data: creator } = useAuthor(getCreatorPubkeyHex());
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const isCreator = user ? isPodcastCreator(user.pubkey) : false;

  // Flatten all data
  const allNotes = postsData?.pages.flat() || [];
  const allReplies = repliesData?.pages.flat() || [];

  // Paginate notes
  const totalNotesPages = Math.ceil(allNotes.length / PAGE_SIZE);
  const paginatedNotes = useMemo(() => {
    const start = (notesPage - 1) * PAGE_SIZE;
    return allNotes.slice(start, start + PAGE_SIZE);
  }, [allNotes, notesPage]);

  // Paginate replies
  const totalRepliesPages = Math.ceil(allReplies.length / PAGE_SIZE);
  const paginatedReplies = useMemo(() => {
    const start = (repliesPage - 1) * PAGE_SIZE;
    return allReplies.slice(start, start + PAGE_SIZE);
  }, [allReplies, repliesPage]);

  const creatorName = creator?.metadata?.name ||
                     creator?.metadata?.display_name ||
                     genUserName(getCreatorPubkeyHex());

  useSeoMeta({
    title: `${creatorName}'s Social Feed - ${PODCAST_CONFIG.podcast.title}`,
    description: `Follow ${creatorName}'s social updates and posts`,
  });

  const PostSkeleton = () => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start space-x-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="flex-1 space-y-3">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex items-center space-x-4 pt-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-16" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const EmptyState = ({ message, subtitle }: { message: string; subtitle: string }) => (
    <div className="col-span-full">
      <Card className="border-dashed">
        <CardContent className="py-12 px-8 text-center">
          <div className="max-w-sm mx-auto space-y-6">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground" />
            <div className="space-y-2">
              <p className="text-muted-foreground">{message}</p>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const ErrorState = () => (
    <div className="col-span-full">
      <Card className="border-dashed border-red-200">
        <CardContent className="py-12 px-8 text-center">
          <div className="max-w-sm mx-auto space-y-6">
            <p className="text-muted-foreground">
              Failed to load social feed. Please try refreshing the page.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  /** Pagination controls */
  const PaginationControls = ({
    page,
    totalPages,
    setPage,
  }: {
    page: number;
    totalPages: number;
    setPage: (p: number) => void;
  }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-center gap-2 mt-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Prev
        </Button>
        <span className="text-sm text-muted-foreground px-3">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages}
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    );
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">{creatorName}'s Social Feed</h1>
            <p className="text-muted-foreground">
              Follow the latest updates and thoughts from the podcast creator
            </p>
          </div>

          {/* Note Composer — only show for the creator */}
          {isCreator && (
            <div className="mb-8">
              <NoteComposer
                placeholder="Share your thoughts with your audience..."
                onSuccess={(newEvent) => {
                  queryClient.setQueryData(['creator-posts'], (oldData: unknown) => {
                    if (!oldData || typeof oldData !== 'object' || !('pages' in oldData)) return oldData;

                    const typedOldData = oldData as { pages: NostrEvent[][] };

                    const optimisticNote: NostrEvent = {
                      id: newEvent?.id || `temp-${Date.now()}`,
                      kind: 1,
                      pubkey: user!.pubkey,
                      created_at: Math.floor(Date.now() / 1000),
                      content: newEvent?.content || '',
                      tags: newEvent?.tags || [],
                      sig: newEvent?.sig || ''
                    };

                    const updatedPages = [...typedOldData.pages];
                    if (updatedPages[0]) {
                      updatedPages[0] = [optimisticNote, ...updatedPages[0]];
                    } else {
                      updatedPages[0] = [optimisticNote];
                    }

                    return {
                      ...typedOldData,
                      pages: updatedPages
                    };
                  });

                  setTimeout(() => {
                    queryClient.invalidateQueries({
                      queryKey: ['creator-posts']
                    });
                  }, 1000);

                  setNotesPage(1); // Jump to first page to see new post
                }}
              />
            </div>
          )}

          <Tabs defaultValue="notes" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="notes" className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4" />
                <span>Notes</span>
              </TabsTrigger>
              <TabsTrigger value="replies" className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4" />
                <span>Replies</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="notes" className="space-y-4">
              {postsError && <ErrorState />}

              {postsLoading || isFetchingPosts ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <PostSkeleton key={i} />
                  ))}
                </div>
              ) : paginatedNotes.length > 0 ? (
                <>
                  {paginatedNotes.map((event, index) => {
                    // Alternate between primary and accent card styling
                    const isAccent = index % 2 === 1;
                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "rounded-lg transition-all duration-200",
                          isAccent
                            ? "border border-accent/20 bg-gradient-to-br from-accent/5 to-transparent"
                            : "border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent"
                        )}
                      >
                        <PostCard event={event} className="border-0 shadow-none bg-transparent" />
                      </div>
                    );
                  })}
                  <PaginationControls
                    page={notesPage}
                    totalPages={totalNotesPages}
                    setPage={setNotesPage}
                  />
                </>
              ) : (
                <EmptyState
                  message="No notes found"
                  subtitle="The creator hasn't posted anything yet, or posts may be on a different relay."
                />
              )}
            </TabsContent>

            <TabsContent value="replies" className="space-y-4">
              {repliesLoading || isFetchingReplies ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <PostSkeleton key={i} />
                  ))}
                </div>
              ) : paginatedReplies.length > 0 ? (
                <>
                  {paginatedReplies.map((event, index) => {
                    const isAccent = index % 2 === 1;
                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "rounded-lg transition-all duration-200",
                          isAccent
                            ? "border border-accent/20 bg-gradient-to-br from-accent/5 to-transparent"
                            : "border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent"
                        )}
                      >
                        <ConversationThread event={event} />
                      </div>
                    );
                  })}
                  <PaginationControls
                    page={repliesPage}
                    totalPages={totalRepliesPages}
                    setPage={setRepliesPage}
                  />
                </>
              ) : (
                <EmptyState
                  message="No replies found"
                  subtitle="The creator hasn't replied to anyone yet, or replies may be on a different relay."
                />
              )}
            </TabsContent>
          </Tabs>


          {/* Creator Info Card */}
          <Card className="mt-8">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                {creator?.metadata?.picture && (
                  <img
                    src={creator.metadata.picture}
                    alt={creatorName}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                )}
                <div className="flex-1">
                  <h3 className="text-xl font-semibold">{creatorName}</h3>
                  {creator?.metadata?.about && (
                    <p className="text-muted-foreground mt-1">
                      {creator.metadata.about}
                    </p>
                  )}
                  <div className="flex items-center space-x-4 mt-3 text-sm text-muted-foreground">
                    <span>Podcast Creator</span>
                    {creator?.metadata?.nip05 && (
                      <span>✓ {creator.metadata.nip05}</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default SocialFeed;
