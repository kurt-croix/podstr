/**
 * Find shortest podcast episodes by duration
 */

import { NRelay1 } from '@nostrify/nostrify';

interface EpisodeWithDuration {
  title: string;
  duration: number;
  dTag: string;
  eventId: string;
}

async function findShortestEpisodes() {
  console.log('🔍 Fetching episodes from Nostr...');

  const relayUrl = process.env.RELAY_URL || 'wss://nos.lol';
  const relay = new NRelay1(relayUrl);

  try {
    // Query for podcast episodes (kind 30054)
    const events = await relay.query([{
      kinds: [30054],
      limit: 100,
    }], { signal: AbortSignal.timeout(15000) });

    relay.close();

    console.log(`📋 Found ${events.length} total episodes`);

    // Extract duration from tags
    const episodesWithDuration: EpisodeWithDuration[] = [];

    for (const event of events) {
      const title = event.tags.find(([name]) => name === 'title')?.[1] || 'Unknown';
      const durationTag = event.tags.find(([name]) => name === 'duration');
      const duration = durationTag ? parseInt(durationTag[1]) : null;
      const dTag = event.tags.find(([name]) => name === 'd')?.[1] || 'unknown';

      if (duration !== null && duration > 0) {
        episodesWithDuration.push({
          title,
          duration,
          dTag,
          eventId: event.id,
        });
      }
    }

    // Sort by duration (shortest first)
    episodesWithDuration.sort((a, b) => a.duration - b.duration);

    console.log('\n📊 Shortest podcast episodes:');
    console.log('================================');

    episodesWithDuration.slice(0, 10).forEach((ep, index) => {
      const minutes = Math.floor(ep.duration / 60);
      const seconds = ep.duration % 60;
      console.log(`${index + 1}. ${ep.title}`);
      console.log(`   Duration: ${minutes}m ${seconds}s (${ep.duration}s)`);
      console.log(`   d-tag: ${ep.dTag}`);
      console.log(`   Event ID: ${ep.eventId.substring(0, 8)}...`);
      console.log('');
    });

    if (episodesWithDuration.length === 0) {
      console.log('❌ No episodes with duration found');
    } else {
      console.log(`✅ Found ${episodesWithDuration.length} episodes with duration information`);
      console.log(`🎯 Shortest episode: "${episodesWithDuration[0].title}" (${Math.floor(episodesWithDuration[0].duration / 60)}m ${episodesWithDuration[0].duration % 60}s)`);
    }
  } catch (error) {
    console.error('❌ Error fetching episodes:', error);
    process.exit(1);
  }
}

findShortestEpisodes();
