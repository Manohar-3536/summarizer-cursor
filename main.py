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
import extract
import summarize
import os

if __name__ == "__main__":
    youtube_link = input("Enter YouTube URL: ")

    # Step 1: Extract and transcribe subtitles using Whisper
    cleaned_text = extract.extract_subtitles_with_whisper(youtube_link)  # Changed function call

    if cleaned_text:
        # Step 2: Summarize the cleaned text using BART
        summary = summarize.summarize_text(cleaned_text)

        # Step 3: Save the summary to a file
        summary_file = "summary.txt"
        with open(summary_file, "w", encoding="utf-8") as file:
            file.write(summary)

        print(f"\n✅ Summary saved to {summary_file}")
    else:
        print("❌ Failed to process subtitles.")
