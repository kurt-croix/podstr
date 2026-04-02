# Podcast Transcription with WhisperX

This document describes the automated transcription feature for podcast episodes using WhisperX with speaker diarization.

## Overview

The transcription feature automatically:
1. Detects new podcast episodes created from livestreams
2. Downloads the audio files
3. Transcribes them using WhisperX with speaker diarization
4. Saves transcripts to the `/transcripts` folder
5. Updates episode events on Nostr with transcript URLs
6. Includes transcript links in the RSS feed

## How It Works

### 1. Episode Conversion (`convert-livestreams-to-episodes.ts`)

When livestreams are converted to podcast episodes, the script now:
- Tracks metadata for each successfully created episode (dTag, title, audio URL)
- Saves this metadata to `.episodes-to-transcribe.json` for the transcription step

### 2. Audio Transcription (`transcribe-audio.ts`)

The transcription script:
- Reads episode metadata from `.episodes-to-transcribe.json`
- Downloads audio files from Blossom servers
- Runs WhisperX with speaker diarization using the `HF_TOKEN`
- Saves transcripts as `.txt` files in the `/transcripts` folder
- Outputs a mapping file `.transcript-mapping.json` with transcript URLs

### 3. Episode Update (`update-episodes-with-transcripts.ts`)

The update script:
- Reads the transcript mapping from `.transcript-mapping.json`
- Fetches existing episode events from Nostr
- Updates each episode event to include a `transcript` tag with the transcript URL
- Publishes updated events to Nostr

### 4. RSS Feed Generation (`build-rss.ts`)

The RSS feed builder already supports transcripts:
- Reads the `transcript` tag from episode events
- Includes `<podcast:transcript>` tags in the RSS feed for episodes with transcripts

## GitHub Actions Workflow

The `.github/workflows/deploy.yml` workflow has been updated to include transcription steps:

```yaml
# 1. Install dependencies (Node.js, Python, ffmpeg, WhisperX)
# 2. Convert livestreams to episodes
# 3. Transcribe audio with WhisperX (if episodes were created)
# 4. Update episodes with transcript URLs (if transcription succeeded)
# 5. Build RSS feed and React app
# 6. Commit transcripts to repository
# 7. Deploy to GitHub Pages
```

## Required Secrets

Add the following secret to your GitHub repository:

- **`HF_TOKEN`**: Your Hugging Face API token for WhisperX
  - Get a free token at: https://huggingface.co/settings/tokens
  - Required for speaker diarization and model downloads

## File Structure

```
podstr/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Updated workflow with transcription steps
├── scripts/
│   ├── transcribe-audio.ts     # New: Transcription script
│   ├── update-episodes-with-transcripts.ts  # New: Episode update script
│   └── convert-livestreams-to-episodes.ts   # Modified: Tracks episode metadata
├── transcripts/                # Created: Transcript files (committed to repo)
│   └── {episode-title}-{timestamp}.txt
└── .gitignore                  # Updated: Ignores temp transcription files
```

## Transcript URLs

Transcripts are served via GitHub Pages at:
```
https://{username}.github.io/{repo}/transcripts/{filename}.txt
```

Update the `BASE_URL` environment variable in the workflow if your repository name or username differs.

## WhisperX Configuration

The transcription uses the following WhisperX settings:
- **Model**: `large-v3` (best accuracy)
- **Language**: English
- **Diarization**: Enabled (1-10 speakers)
- **Output format**: Plain text (.txt)

## Manual Usage

You can also run the scripts manually:

### Transcribe episodes
```bash
HF_TOKEN=your_token BASE_URL=https://your-url.tsx scripts/transcribe-audio.ts
```

### Update episodes with transcripts
```bash
NOSTR_PRIVATE_KEY=your_key tsx scripts/update-episodes-with-transcripts.ts
```

## Troubleshooting

### Transcription fails
- Check that `HF_TOKEN` is set correctly in GitHub Secrets
- Verify the audio URL is accessible
- Check GitHub Actions logs for WhisperX error messages

### Episodes not updated with transcripts
- Ensure the episode author pubkey matches the signing key
- Check that the relay URL is accessible
- Verify the transcript mapping file was created successfully

### Transcripts not appearing in RSS
- Wait for the next RSS build cycle or trigger the workflow manually
- Verify the transcript URL is accessible via GitHub Pages
- Check that the episode event includes the `transcript` tag

## Notes

- Temporary files (`.episodes-to-transcribe.json`, `.transcript-mapping.json`) are ignored by git
- Transcripts are committed to the repository and served via GitHub Pages
- Each workflow run only processes new episodes (tracked by conversion state)
- Transcription runs automatically after successful episode conversion
