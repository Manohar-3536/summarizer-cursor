const play = require('play-dl');
const fs = require('fs');
const { OpenAI } = require('openai');
const { Readable } = require('stream');
const ffmpeg = require('fluent-ffmpeg');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Buffer size for chunked processing (1MB)
const CHUNK_SIZE = 1024 * 1024;

async function transcribeAudioChunk(chunk) {
    try {
        // Create a temporary file for the chunk
        const tempFile = `chunk_${Date.now()}.mp3`;
        await fs.promises.writeFile(tempFile, chunk);

        // Transcribe the chunk
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFile),
            model: "whisper-1",
        });

        // Clean up temp file
        await fs.promises.unlink(tempFile);

        return transcription.text;
    } catch (error) {
        console.error('Error transcribing chunk:', error);
        return '';
    }
}

async function testYouTubeDownload() {
    try {
        const url = 'https://www.youtube.com/watch?v=_Z5-P9v3F8w'; // Test video
        console.log('Testing URL:', url);
        
        // Get video info
        console.log('Getting video info...');
        const videoInfo = await play.video_info(url);
        console.log('Video title:', videoInfo.video_details.title);
        console.log('Video duration:', videoInfo.video_details.durationInSec, 'seconds');
        
        // Get the lowest quality audio stream (usually smaller size)
        console.log('Getting audio stream...');
        const stream = await play.stream_from_info(videoInfo, { 
            quality: 140, // lowest quality audio-only format
            discordPlayerCompatibility: false // disable unnecessary processing
        });
        
        let startTime = Date.now();
        let totalBytes = 0;
        let chunks = [];
        
        // Process the stream in chunks
        stream.stream.on('data', async (chunk) => {
            totalBytes += chunk.length;
            chunks.push(chunk);
            
            // Log progress
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            const bytesPerSecond = totalBytes / elapsedSeconds;
            const mbPerSecond = (bytesPerSecond / (1024 * 1024)).toFixed(2);
            console.log(`Download progress: ${(totalBytes / 1024 / 1024).toFixed(2)} MB (${mbPerSecond} MB/s)`);
            
            // If we have enough data, start processing
            if (chunks.length * chunk.length >= CHUNK_SIZE) {
                const buffer = Buffer.concat(chunks);
                chunks = []; // Reset chunks array
                
                // Start transcription for this chunk
                const text = await transcribeAudioChunk(buffer);
                if (text) {
                    console.log('Transcribed chunk:', text);
                }
            }
        });

        // Handle stream completion
        stream.stream.on('end', async () => {
            // Process any remaining chunks
            if (chunks.length > 0) {
                const buffer = Buffer.concat(chunks);
                const text = await transcribeAudioChunk(buffer);
                if (text) {
                    console.log('Transcribed final chunk:', text);
                }
            }

            const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log('Processing completed!');
            console.log(`Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
            console.log(`Total time: ${totalTime} seconds`);
            process.exit(0);
        });

        stream.stream.on('error', (err) => {
            console.error('Error in stream:', err);
            process.exit(1);
        });
        
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

// Add error handling for uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    process.exit(1);
});

testYouTubeDownload(); 