import { useSeoMeta } from '@unhead/react';
import { MessageCircle, Users, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layout } from '@/components/Layout';
import { ZapLeaderboard } from '@/components/podcast/ZapLeaderboard';
import { RecentActivity } from '@/components/podcast/RecentActivity';
import { EpisodeDiscussions } from '@/components/podcast/EpisodeDiscussions';
import { PODCAST_CONFIG } from '@/lib/podcastConfig';

const Community = () => {
  useSeoMeta({
    title: `Community - ${PODCAST_CONFIG.podcast.title}`,
    description: `Join the community discussion for ${PODCAST_CONFIG.podcast.title}`,
  });

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Community</h1>
            <p className="text-muted-foreground">
              Engage with the {PODCAST_CONFIG.podcast.title} community
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            {/* Main Content */}
            <div>
              <Tabs defaultValue="activity" className="space-y-6">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="activity" className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4" />
                    <span>Recent Activity</span>
                  </TabsTrigger>
                  <TabsTrigger value="discussions" className="flex items-center space-x-2">
                    <MessageCircle className="w-4 h-4" />
                    <span>Discussions</span>
                  </TabsTrigger>
                  <TabsTrigger value="supporters" className="flex items-center space-x-2">
                    <Users className="w-4 h-4" />
                    <span>Top Supporters</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Community Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <RecentActivity limit={20} showTitle={false} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="discussions" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Episode Discussions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <EpisodeDiscussions limit={15} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="supporters" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Supporters</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ZapLeaderboard limit={20} showTitle={false} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Community;