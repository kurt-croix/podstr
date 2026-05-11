# Editing and Deletion for NIP-54 Podcast Episodes

This document explains how episode editing and deletion work in the PODSTR implementation using NIP-54 (`kind:54`) podcast episodes.

## Overview

Since NIP-54 podcast episodes are **regular Nostr events** (not addressable events), they behave differently than replaceable or addressable events when it comes to editing and deletion.

## Key Differences from Addressable Events

| Feature | Addressable Events (kind:30000-39999) | Regular Events (kind:54) |
|---------|--------------------------------------|-------------------------|
| **Editing** | Replace existing event with same `d` tag | Create new event with updated content |
| **Deduplication** | Automatic (relays keep latest `d` tag) | Manual (client-side logic required) |
| **Deletion** | Standard NIP-09 | Standard NIP-09 |
| **Identifier** | `kind` + `pubkey` + `d` tag | Event ID only |

## How Editing Works

### The Challenge
With regular events, there's no built-in mechanism to "update" an existing event. Each edit creates a completely new event with a new ID.

### Our Solution: Title-Based Deduplication

We implement a smart deduplication strategy that:

1. **Tracks Edit Relationships**: Edited events include an `edit` tag referencing the original event
2. **Prioritizes Latest Versions**: Only shows the most recent version of each episode title
3. **Hides Superseded Versions**: Original events that have been edited are hidden from the feed

### Implementation Details

#### 1. Edit Event Creation
When a user edits an episode, we create a new `kind:54` event with:

```typescript
const tags = [
  ['title', updatedTitle],
  ['audio', updatedAudioUrl, audioType],
  ['alt', `Updated podcast episode: ${updatedTitle}`],
  ['edit', originalEventId] // References the original event
];
```

#### 2. Query-Time Deduplication
When fetching episodes, we:

1. **Identify Edit Relationships**: Find all events with `edit` tags
2. **Track Superseded Events**: Mark original events that have been edited
3. **Select Latest Versions**: For each title, keep only the newest event

```typescript
// First pass: identify edited events and their originals
validEvents.forEach(event => {
  if (isEditEvent(event)) {
    const originalId = getOriginalEventId(event);
    if (originalId) {
      originalEvents.add(originalId);
    }
  }
});

// Second pass: select the best version for each title
validEvents.forEach(event => {
  // Skip if this is an original event that has been edited
  if (originalEvents.has(event.id)) return;
  
  // Keep the latest version for each title
  const existing = episodesByTitle.get(title);
  if (!existing || event.created_at > existing.created_at) {
    episodesByTitle.set(title, event);
  }
});
```

#### 3. User Experience
- **Seamless Editing**: Users see only the latest version of each episode
- **No Duplicates**: Original and edited versions don't appear together
- **Preserved History**: All event versions exist on relays (audit trail)
- **Link Stability**: nevent links to original events still work (redirect to latest)

### Benefits of This Approach

#### ✅ **Advantages**
- **User-Friendly**: No duplicate episodes in feeds
- **Preserves History**: Full edit history available on relays
- **Link Stability**: Old links still work (show latest version)
- **Audit Trail**: Complete edit history for moderation/compliance
- **No Data Loss**: Original content never deleted, just superseded

#### ⚠️ **Limitations**
- **Title Changes**: Changing episode title creates a "new" episode
- **Storage Growth**: Multiple versions consume relay storage
- **Client Complexity**: Requires sophisticated deduplication logic
- **Network Load**: More events to query and process

## How Deletion Works

### Standard NIP-09 Implementation

Deletion works exactly like standard Nostr deletion and is **fully supported**:

#### 1. Deletion Event Creation
When a user deletes an episode, we create a `kind:5` deletion event:

```typescript
const deletionEvent = await createEvent({
  kind: 5, // Deletion event
  content: 'Deleted podcast episode',
  tags: [
    ['e', episodeId] // References the episode to delete
  ]
});
```

#### 2. Relay Enforcement
- **Supporting Relays**: Relays that implement NIP-09 will hide the deleted event
- **Non-Supporting Relays**: Event remains visible on relays that don't support deletion

#### 3. Client-Side Filtering
Our implementation includes client-side filtering:

```typescript
// Filter out deleted events in queries
const events = await nostr.query([{
  kinds: [PODCAST_KINDS.EPISODE],
  authors: [getCreatorPubkeyHex()]
}]);

// Client-side filtering (additional safety)
const nonDeletedEvents = events.filter(event => 
  !isEventDeleted(event) // Check against known deletion events
);
```

### Deletion Behavior

#### ✅ **What Works Well**
- **Immediate Effect**: Deletion works instantly on supporting relays
- **Standard Compliance**: Follows NIP-09 specification exactly
- **Client Support**: Most Nostr clients respect deletion events
- **Clean UI**: Deleted episodes disappear from feeds

#### ⚠️ **Considerations**
- **Relay Support**: Effectiveness depends on relay NIP-09 support
- **Permanent**: Deletion cannot be undone (event is gone)
- **Network Effects**: May take time to propagate across all relays
- **Audit Trail**: No way to recover deleted content

## Comparison: Editing vs Deletion

| Aspect | Editing | Deletion |
|--------|---------|----------|
| **Data Persistence** | All versions preserved | Original data removed |
| **User Experience** | Seamless update | Content disappears |
| **Reversibility** | Can edit again | Permanent |
| **Link Stability** | Links still work | Links break |
| **Storage Impact** | Increases storage | Frees storage |
| **Compliance** | Full audit trail | Data removal (GDPR) |

## Best Practices

### For Editing
1. **Meaningful Updates**: Only edit for significant changes (corrections, updates)
2. **Title Consistency**: Avoid changing titles unless necessary
3. **Edit Messages**: Use clear alt tags explaining what was changed
4. **Version Limits**: Consider implementing edit version limits

### For Deletion
1. **Use Sparingly**: Prefer editing over deletion when possible
2. **User Confirmation**: Require explicit confirmation for deletion
3. **Backup Considerations**: Warn users about permanent data loss
4. **Compliance**: Document deletion for legal/regulatory requirements

## Future Enhancements

### Potential Improvements

#### 1. Edit History UI
```typescript
interface EpisodeVersion {
  eventId: string;
  timestamp: Date;
  editReason?: string;
  changes: string[];
}

// Show edit history to users
function EpisodeHistory({ episodeId }: EpisodeHistoryProps) {
  // Fetch and display all versions of an episode
}
```

#### 2. Differential Updates
```typescript
// Store only what changed between versions
interface EditDiff {
  title?: { old: string; new: string };
  content?: { old: string; new: string };
  audio?: { old: string; new: string };
}
```

#### 3. Collaborative Editing
```typescript
// Multiple editors with approval workflow
interface EditProposal {
  targetEvent: string;
  proposedChanges: EpisodeFormData;
  proposer: string;
  approvals: string[];
  status: 'pending' | 'approved' | 'rejected';
}
```

## Conclusion

Our implementation provides a robust editing and deletion system for NIP-54 podcast episodes:

- **Editing**: Uses title-based deduplication with edit tracking for a seamless user experience
- **Deletion**: Follows standard NIP-09 for reliable content removal
- **User Experience**: Clean, intuitive interface that hides complexity
- **Data Integrity**: Preserves history while maintaining current state

This approach balances the technical constraints of regular Nostr events with the user expectations of a modern podcast platform.