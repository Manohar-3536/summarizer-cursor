from youtube_transcript_api import YouTubeTranscriptApi
from urllib.parse import urlparse, parse_qs

def get_video_id(youtube_url):
    """Extract video ID from YouTube URL."""
    parsed_url = urlparse(youtube_url)
    if parsed_url.hostname in ('youtu.be', 'www.youtu.be'):
        return parsed_url.path[1:]
    if parsed_url.hostname in ('youtube.com', 'www.youtube.com'):
        query_params = parse_qs(parsed_url.query)
        return query_params.get('v', [None])[0]
    return None

def extract_transcript(youtube_url):
    """Extract transcript from YouTube video using YouTube Transcript API."""
    try:
        video_id = get_video_id(youtube_url)
        if not video_id:
            print("❌ Invalid YouTube URL")
            return None

        print("🔍 Fetching transcript...")
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        
        # Combine all transcript pieces into one text
        full_text = ' '.join([entry['text'] for entry in transcript_list])
        
        print("✅ Transcript extracted successfully")
        return full_text

    except Exception as e:
        print(f"❌ Error extracting transcript: {str(e)}")
        return None 