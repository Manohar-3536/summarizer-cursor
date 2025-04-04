from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound, TooManyRequests
from urllib.parse import urlparse, parse_qs
import time
import json
import os
from pathlib import Path

# Create cache directory if it doesn't exist
CACHE_DIR = Path("cache")
CACHE_DIR.mkdir(exist_ok=True)

def get_video_id(youtube_url):
    """Extract video ID from YouTube URL."""
    parsed_url = urlparse(youtube_url)
    if parsed_url.hostname in ('youtu.be', 'www.youtu.be'):
        return parsed_url.path[1:]
    if parsed_url.hostname in ('youtube.com', 'www.youtube.com'):
        query_params = parse_qs(parsed_url.query)
        return query_params.get('v', [None])[0]
    return None

def get_cached_transcript(video_id):
    """Get transcript from cache if it exists."""
    cache_file = CACHE_DIR / f"{video_id}.json"
    if cache_file.exists():
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                cached_data = json.load(f)
                # Check if cache is less than 24 hours old
                if time.time() - cached_data['timestamp'] < 86400:  # 24 hours
                    return cached_data['transcript']
        except Exception:
            pass
    return None

def save_to_cache(video_id, transcript):
    """Save transcript to cache."""
    cache_file = CACHE_DIR / f"{video_id}.json"
    try:
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump({
                'transcript': transcript,
                'timestamp': time.time()
            }, f)
    except Exception as e:
        print(f"Warning: Could not cache transcript: {e}")

def extract_transcript(youtube_url, max_retries=3):
    """Extract transcript from YouTube video using YouTube Transcript API with retries and caching."""
    try:
        video_id = get_video_id(youtube_url)
        if not video_id:
            return {"error": "Invalid YouTube URL", "status": 400}

        # Check cache first
        cached_transcript = get_cached_transcript(video_id)
        if cached_transcript:
            print("✅ Using cached transcript")
            return {"text": cached_transcript, "status": 200}

        print("🔍 Fetching transcript...")
        
        retry_count = 0
        while retry_count < max_retries:
            try:
                transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
                full_text = ' '.join([entry['text'] for entry in transcript_list])
                
                # Cache the successful result
                save_to_cache(video_id, full_text)
                
                print("✅ Transcript extracted successfully")
                return {"text": full_text, "status": 200}

            except TooManyRequests:
                retry_count += 1
                if retry_count < max_retries:
                    wait_time = 2 ** retry_count  # Exponential backoff
                    print(f"⚠️ Rate limit hit, waiting {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    return {"error": "Rate limit exceeded. Please try again later.", "status": 429}
                    
            except TranscriptsDisabled:
                return {"error": "Transcripts are disabled for this video.", "status": 403}
                
            except NoTranscriptFound:
                return {"error": "No transcript found for this video.", "status": 404}
                
            except Exception as e:
                retry_count += 1
                if retry_count < max_retries:
                    wait_time = 2 ** retry_count
                    print(f"⚠️ Error occurred, retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    return {"error": f"Failed to extract transcript: {str(e)}", "status": 500}

    except Exception as e:
        return {"error": f"Unexpected error: {str(e)}", "status": 500} 