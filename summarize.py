from transformers import pipeline

def summarize_text(cleaned_text):
    """Summarize cleaned subtitles using Hugging Face Transformer models."""
    summarizer = pipeline("summarization", model="facebook/bart-large-cnn", device=-1)  # Run on CPU

    # Prevent errors if text is empty
    if not cleaned_text.strip():
        print("❌ No valid text for summarization!")
        return "No summary available."

    # Split text into proper chunks (without cutting words)
    def chunk_text(text, max_tokens=500):
        words = text.split()
        chunks = []
        i = 0

        while i < len(words):
            chunk = words[i:i + max_tokens]
            chunks.append(" ".join(chunk))
            i += max_tokens

        return chunks

    text_chunks = chunk_text(cleaned_text)

    if len(text_chunks) == 0:
        print("❌ No valid chunks generated!")
        return "No summary available."

    # Summarize each chunk
    summaries = []
    for chunk in text_chunks:
        try:
            summary = summarizer(chunk, max_length=150, min_length=50, do_sample=False)[0]["summary_text"]
            summaries.append(summary)
        except Exception as e:
            print(f"⚠️ Error summarizing chunk: {e}")
            summaries.append("Error summarizing this part.")

    final_summary = "\n\n".join(summaries)

    return final_summary  # Return summarized text


