# import yt_dlp
# import whisper
# import re
# import os

# # Function to extract subtitles from YouTube
# def extract_subtitles(youtube_url):
#     ydl_opts = {
#         "writesubtitles": True,
#         "writeautomaticsub": True,
#         "skip_download": True,
#         "quiet": True,
#     }

#     with yt_dlp.YoutubeDL(ydl_opts) as ydl:
#         info = ydl.extract_info(youtube_url, download=False)
#         subtitles = info.get("subtitles", {}) or info.get("automatic_captions", {})

#         if not subtitles:
#             print("❌ No subtitles found for this video.")
#             return None

#         lang = "en" if "en" in subtitles else list(subtitles.keys())[0]
#         print(f"🔍 Found subtitles in: {', '.join(subtitles.keys())}")
#         print(f"📜 Using '{lang}' subtitles.")

#         ydl_opts["subtitleslangs"] = [lang]
#         ydl_opts["outtmpl"] = "subtitles"

#         with yt_dlp.YoutubeDL(ydl_opts) as ydl:
#             ydl.download([youtube_url])

#         subtitle_filename = f"subtitles.{lang}.vtt"
#         if os.path.exists(subtitle_filename):
#             print(f"✅ Subtitles extracted.")
#             return clean_text_for_summary(subtitle_filename, lang)  # Return cleaned text

#     return None

# # Function to clean subtitles (remove timestamps, metadata, and duplicates)
# def clean_text_for_summary(vtt_file, lang):
#     """Cleans subtitles and translates if needed, returning final text."""
#     with open(vtt_file, "r", encoding="utf-8") as file:
#         text = file.read()

#     # Remove WEBVTT headers
#     text = re.sub(r"WEBVTT.*?\n", "", text, flags=re.DOTALL)

#     # Remove timestamps
#     text = re.sub(r"\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}", "", text)

#     # Remove extra formatting tags like <c> and timestamps inside text
#     text = re.sub(r"<\d{2}:\d{2}:\d{2}\.\d{3}><c>|</c>", "", text)

#     # Remove duplicate lines and unnecessary newlines
#     lines = text.split("\n")
#     seen_lines = set()
#     cleaned_text = " ".join(line.strip() for line in lines if line.strip() and line.strip() not in seen_lines and not seen_lines.add(line.strip()))

#     if lang != "en":
#         return translate_subtitles_whisper(cleaned_text, lang)
    
#     return cleaned_text

# # Function to translate subtitles using Whisper
# def translate_subtitles_whisper(text, source_lang, model_size="small"):
#     if source_lang == "en":
#         return text

#     print(f"🔄 Translating subtitles from '{source_lang}' to English using Whisper...")
#     model = whisper.load_model(model_size)
#     result = model.transcribe(text, task="translate")
    
#     return result["text"]


# newer chatgpt one========================================================================
import yt_dlp
import whisper
import os

# Function to download audio and transcribe using Whisper
def extract_subtitles_with_whisper(youtube_url, model_size="tiny"):
    """Downloads audio from YouTube and transcribes it using Whisper."""
    output_filename = "audio.mp3"

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_filename,
        "quiet": True,
        "noplaylist": True,
    }

    print("🎵 Downloading audio...")
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            ydl.download([youtube_url])
        except Exception as e:
            print(f"❌ Error downloading audio: {e}")
            return None

    print("📝 Transcribing audio with Whisper...")
    model = whisper.load_model(model_size)  # Load Whisper model
    result = model.transcribe(output_filename)

    # Remove the audio file after transcription
    os.remove(output_filename)

    return result["text"] if "text" in result else None

