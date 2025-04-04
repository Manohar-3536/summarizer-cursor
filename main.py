# import extract
# import summarize

# if __name__ == "__main__":
#     youtube_link = input("Enter YouTube URL: ")

#     # Step 1: Extract and clean subtitles
#     cleaned_text = extract.extract_subtitles(youtube_link)

#     if cleaned_text:
#         # Step 2: Summarize the cleaned text
#         summary = summarize.summarize_text(cleaned_text)

#         # Step 3: Save the summary to a file
#         summary_file = "summary.txt"
#         with open(summary_file, "w", encoding="utf-8") as file:
#             file.write(summary)

#         print(f"\n✅ Summary saved to {summary_file}")
#     else:
#         print("❌ Failed to process subtitles.")

# newer chatgpt one========================================================================
from extract import extract_transcript
from summarize import summarize_text

def process_youtube_video(youtube_url):
    """Process a YouTube video: extract transcript and generate summary."""
    
    # Try getting transcript using YouTube Transcript API
    result = extract_transcript(youtube_url)
    
    if result.get('status') != 200:
        print(f"❌ {result.get('error', 'Unknown error')}")
        return None
    
    transcript = result.get('text')
    
    # Generate summary using BART
    print("📝 Generating summary...")
    summary = summarize_text(transcript)
    
    return summary

def main():
    # Example usage
    youtube_url = input("Enter YouTube URL: ")
    summary = process_youtube_video(youtube_url)
    
    if summary:
        print("\n=== Summary ===")
        print(summary)
    else:
        print("❌ Failed to generate summary")

if __name__ == "__main__":
    main()
