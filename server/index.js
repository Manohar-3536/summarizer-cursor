const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const play = require('play-dl');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { OpenAI } = require('openai');
const axios = require('axios');
const fs = require('fs');
const { promisify } = require('util');
const unlinkAsync = promisify(fs.unlink);
const { pipeline } = require('@xenova/transformers');

// Configure ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://instant-clip-summarizer.onrender.com', 'https://www.instant-clip-summarizer.onrender.com'] 
    : 'http://localhost:3000',
  optionsSuccessStatus: 200
};

// Cache configuration
const CACHE_DIR = path.join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;
const requestCounts = new Map();

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Rate limiting middleware
const rateLimiter = (req, res, next) => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  // Clean up old entries
  for (const [ip, data] of requestCounts.entries()) {
    if (data.timestamp < windowStart) {
      requestCounts.delete(ip);
    }
  }
  
  const clientIP = req.ip;
  const clientData = requestCounts.get(clientIP) || { count: 0, timestamp: now };
  
  if (clientData.timestamp < windowStart) {
    clientData.count = 0;
    clientData.timestamp = now;
  }
  
  if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((clientData.timestamp + RATE_LIMIT_WINDOW - now) / 1000)
    });
  }
  
  clientData.count++;
  requestCounts.set(clientIP, clientData);
  next();
};

app.use(rateLimiter);

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Cache functions
function getCacheKey(url) {
  const urlObj = new URL(url);
  return urlObj.searchParams.get('v') || path.basename(urlObj.pathname);
}

function getCachedData(cacheKey) {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (Date.now() - cacheData.timestamp < 24 * 60 * 60 * 1000) { // 24 hours
        return cacheData.data;
      }
    } catch (error) {
      console.error('Cache read error:', error);
    }
  }
  return null;
}

function saveToCache(cacheKey, data) {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  try {
    fs.writeFileSync(cachePath, JSON.stringify({
      timestamp: Date.now(),
      data: data
    }));
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

// Helper function to extract audio from video
async function extractAudioFromVideo(videoPath) {
  const audioPath = `${videoPath}.mp3`;
  
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .toFormat('mp3')
      .audioCodec('libmp3lame')
      .audioBitrate('192k') // Higher quality for better transcription
      .audioChannels(2) // Stereo for better quality
      .audioFrequency(44100) // CD quality
      .output(audioPath)
      .on('start', () => {
        console.log('Started audio extraction');
      })
      .on('progress', (progress) => {
        console.log(`Processing audio: ${progress.percent}% done`);
      })
      .on('end', () => {
        console.log('Audio extraction completed');
        resolve(audioPath);
      })
      .on('error', (err) => {
        console.error('Error extracting audio:', err);
        reject(err);
      })
      .run();
  });
}

// Helper function to validate YouTube URL
function isValidYouTubeUrl(url) {
  return play.yt_validate(url) === 'video';
}

// Helper function to download YouTube video with retries and caching
async function downloadYouTubeVideo(url, maxRetries = 3) {
  const cacheKey = getCacheKey(url);
  const cachedData = getCachedData(cacheKey);
  
  if (cachedData) {
    console.log('Using cached video data');
    return cachedData;
  }
  
  let lastError;
  let baseWaitTime = 2000; // Start with 2 seconds

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Download attempt ${attempt + 1}/${maxRetries}`);
      
      // Add a small delay even on first attempt to respect rate limits
      if (attempt > 0) {
        const waitTime = baseWaitTime * Math.pow(2, attempt);
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const videoInfo = await play.video_info(url);
      const videoId = videoInfo.video_details.id;
      const videoPath = path.join(__dirname, 'uploads', `${videoId}.mp4`);

      // Ensure uploads directory exists
      const uploadsDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      console.log('Getting stream info...');
      const stream = await play.stream_from_info(videoInfo, { quality: 140 });
      
      console.log('Starting download...');
      await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(videoPath);
        stream.stream
          .on('error', (err) => {
            console.error('Stream error:', err);
            writeStream.end();
            reject(err);
          })
          .pipe(writeStream)
          .on('finish', () => {
            console.log('Download completed');
            resolve();
          })
          .on('error', (err) => {
            console.error('Write stream error:', err);
            reject(err);
          });
      });
      
      // Verify the file exists and has content
      if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size === 0) {
        throw new Error('Downloaded file is empty or does not exist');
      }
      
      // Cache the successful result
      saveToCache(cacheKey, videoPath);
      
      return videoPath;
    } catch (error) {
      lastError = error;
      console.error(`Download attempt ${attempt + 1} failed:`, error.message);
      
      if (error.message.includes('429')) {
        if (attempt === maxRetries - 1) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        // Continue to next attempt
      } else if (error.message.includes('private video') || error.message.includes('not available')) {
        // Don't retry for permanent errors
        throw error;
      } else {
        // For other errors, retry with backoff
        if (attempt === maxRetries - 1) {
          throw error;
        }
      }
    }
  }
  
  throw lastError;
}

// Helper function to transcribe audio using OpenAI Whisper
async function transcribeAudio(audioPath) {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('your_openai_api_key')) {
      console.log('OpenAI API key not configured. Skipping transcription.');
      return "OpenAI API key not configured. Please add your API key to the .env file.";
    }
    
    console.log(`Transcribing audio file: ${audioPath}`);
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
    });
    
    return transcription.text;
  } catch (error) {
    console.error('Transcription error:', error);
    return `Error transcribing audio: ${error.message}`;
  }
}

// Initialize the summarization pipeline
let summarizer = null;
let isInitializing = false;

async function initializeSummarizer() {
  if (!summarizer && !isInitializing) {
    isInitializing = true;
    try {
      console.log('Initializing summarizer...');
      summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
      console.log('Summarizer initialized successfully');
    } catch (error) {
      console.error('Error initializing summarizer:', error);
      // Don't throw the error, just log it
      summarizer = null;
    } finally {
      isInitializing = false;
    }
  }
  return summarizer;
}

// Start the server first
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Then initialize the summarizer in the background
(async () => {
  try {
    await initializeSummarizer();
  } catch (error) {
    console.error('Failed to initialize summarizer:', error);
    // Don't exit the process, let the server continue running
  }
})();

// Helper function to generate summary
async function generateSummary(content) {
  try {
    const currentSummarizer = await initializeSummarizer();
    if (!currentSummarizer) {
      return 'Summarizer not available. Please try again later.';
    }
    
    // Split content into chunks if it's too long
    const MAX_CHUNK_LENGTH = 500; // Reduced for better handling
    const chunks = [];
    for (let i = 0; i < content.length; i += MAX_CHUNK_LENGTH) {
      chunks.push(content.slice(i, i + MAX_CHUNK_LENGTH));
    }
    
    // Summarize each chunk
    const summaries = await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const result = await currentSummarizer(chunk, {
            max_length: 150,
            min_length: 40,
            do_sample: false
          });
          return result[0].summary_text;
        } catch (error) {
          console.error('Chunk summarization error:', error);
          return chunk.slice(0, 100) + '...'; // Return truncated chunk if summarization fails
        }
      })
    );
    
    // Combine summaries
    return summaries.join('\n\n');
  } catch (error) {
    console.error('Summary generation error:', error);
    return `Error generating summary: ${error.message}`;
  }
}

// Routes
app.post('/api/summarize-youtube', async (req, res) => {
  try {
    const { url } = req.body;
    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    console.log(`Processing YouTube URL: ${url}`);

    try {
      // Get video info
      const videoInfo = await play.video_info(url);
      const videoDetails = videoInfo.video_details;
      const videoTitle = videoDetails.title;
      const videoAuthor = videoDetails.channel?.name || 'Unknown';
      const videoDuration = videoDetails.durationInSec;
      
      let transcription = '';
      if (videoDuration < 600) {
        try {
          console.log('Video is shorter than 10 minutes, processing...');
          
          // Download video with retries
          let videoPath = null;
          let retryCount = 0;
          const maxRetries = 3;
          
          while (retryCount < maxRetries && !videoPath) {
            try {
              videoPath = await downloadYouTubeVideo(url);
            } catch (downloadError) {
              console.error(`Download attempt ${retryCount + 1} failed:`, downloadError);
              retryCount++;
              if (retryCount === maxRetries) {
                throw new Error('Failed to download video after multiple attempts');
              }
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
          
          // Extract and process audio
          console.log('Converting to MP3...');
          const audioPath = await extractAudioFromVideo(videoPath);
          
          console.log('Transcribing audio...');
          transcription = await transcribeAudio(audioPath);
          console.log('Transcription completed');
          
          // Clean up files
          try {
            await unlinkAsync(audioPath);
            await unlinkAsync(videoPath);
            console.log('Temporary files deleted');
          } catch (cleanupError) {
            console.error('Error deleting temporary files:', cleanupError);
          }
        } catch (processingError) {
          console.error('Processing error:', processingError);
          transcription = `Error processing video: ${processingError.message}`;
        }
      } else {
        transcription = 'Video is too long for transcription (>10 minutes).';
      }
      
      // Content to summarize
      const contentToSummarize = `
        Title: ${videoTitle}
        Author: ${videoAuthor}
        Duration: ${Math.floor(videoDuration / 60)} minutes and ${videoDuration % 60} seconds
        
        Transcription:
        ${transcription}
      `.trim();
      
      console.log('Generating summary...');
      const summary = await generateSummary(contentToSummarize);
      
      res.json({ 
        title: videoTitle,
        author: videoAuthor,
        duration: videoDuration,
        summary: summary
      });
    } catch (ytError) {
      console.error('YouTube processing error:', ytError);
      return res.status(500).json({ 
        error: 'Failed to process YouTube video',
        details: ytError.message
      });
    }
  } catch (error) {
    console.error('General error:', error);
    res.status(500).json({ 
      error: 'Failed to process YouTube video',
      details: error.message
    });
  }
});

app.post('/api/summarize-video', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    console.log(`Processing uploaded video: ${req.file.filename}`);
    const videoPath = req.file.path;

    // Extract audio from video
    let transcription = '';
    try {
      console.log('Extracting audio from video...');
      const audioPath = await extractAudioFromVideo(videoPath);
      transcription = await transcribeAudio(audioPath);
      console.log('Transcription completed');
      
      // Clean up the audio file
      try {
        await unlinkAsync(audioPath);
        console.log('Audio file deleted');
      } catch (cleanupError) {
        console.error('Error deleting audio file:', cleanupError);
      }
    } catch (audioError) {
      console.error('Audio processing error:', audioError);
      transcription = `Error processing audio: ${audioError.message}`;
    }
    
    // Content to summarize
    const contentToSummarize = `
      Filename: ${req.file.originalname}
      File size: ${req.file.size} bytes
      File type: ${req.file.mimetype}
      
      Transcription:
      ${transcription}
    `;
    
    // Generate summary using BART
    const summary = await generateSummary(contentToSummarize);
    
    res.json({ 
      filename: req.file.filename,
      originalName: req.file.originalname,
      summary: summary
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Failed to process video file',
      details: error.message
    });
  }
});

// Route to process YouTube videos
app.post('/process-video', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'No URL provided' });
    }

    console.log('Received request for URL:', url);

    if (!isValidYouTubeUrl(url)) {
      console.log('Invalid YouTube URL:', url);
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Check cache first
    const cacheKey = getCacheKey(url);
    const cachedResult = getCachedData(cacheKey);
    
    if (cachedResult) {
      console.log('Returning cached result for:', url);
      return res.json(cachedResult);
    }

    console.log('Starting video processing for:', url);

    try {
      // Get video info first
      const videoInfo = await play.video_info(url);
      const videoDetails = videoInfo.video_details;
      console.log('Video details:', {
        title: videoDetails.title,
        duration: videoDetails.durationInSec,
        author: videoDetails.channel?.name
      });

      // Check video duration
      if (videoDetails.durationInSec > 600) {
        return res.status(400).json({
          error: 'Video is too long',
          details: 'Videos must be under 10 minutes long'
        });
      }

      // Download video with retries and rate limit handling
      console.log('Downloading video...');
      let videoPath;
      try {
        videoPath = await downloadYouTubeVideo(url);
        console.log('Video downloaded to:', videoPath);
      } catch (downloadError) {
        console.error('Download error:', downloadError);
        if (downloadError.message.includes('429')) {
          return res.status(429).json({
            error: 'YouTube rate limit exceeded',
            details: 'Please try again in a few minutes'
          });
        }
        throw downloadError;
      }
      
      // Extract audio
      console.log('Extracting audio...');
      let audioPath;
      try {
        audioPath = await extractAudioFromVideo(videoPath);
        console.log('Audio extracted to:', audioPath);
      } catch (audioError) {
        console.error('Audio extraction error:', audioError);
        // Clean up video file if audio extraction fails
        await unlinkAsync(videoPath).catch(console.error);
        throw audioError;
      }
      
      // Transcribe audio
      console.log('Transcribing audio...');
      let transcription;
      try {
        transcription = await transcribeAudio(audioPath);
        console.log('Transcription completed, length:', transcription.length);
      } catch (transcriptionError) {
        console.error('Transcription error:', transcriptionError);
        // Clean up both files if transcription fails
        await Promise.all([
          unlinkAsync(videoPath).catch(console.error),
          unlinkAsync(audioPath).catch(console.error)
        ]);
        throw transcriptionError;
      }
      
      // Generate summary
      console.log('Generating summary...');
      const summary = await generateSummary(transcription);
      console.log('Summary generated, length:', summary.length);
      
      // Cache the result
      const result = { 
        title: videoDetails.title,
        author: videoDetails.channel?.name,
        duration: videoDetails.durationInSec,
        transcription, 
        summary 
      };
      console.log('Saving result to cache...');
      saveToCache(cacheKey, result);
      
      // Clean up files
      console.log('Cleaning up temporary files...');
      await Promise.all([
        unlinkAsync(videoPath).catch(err => console.error('Error deleting video file:', err)),
        unlinkAsync(audioPath).catch(err => console.error('Error deleting audio file:', err))
      ]);
      
      console.log('Processing completed successfully');
      res.json(result);
      
    } catch (error) {
      console.error('Error processing YouTube video:', error);
      
      if (error.message.includes('private video')) {
        return res.status(400).json({
          error: 'Cannot process private video',
          details: 'The video is private or not available'
        });
      }
      
      res.status(500).json({
        error: 'Failed to process video',
        details: error.message
      });
    }
  } catch (error) {
    console.error('General error:', error);
    res.status(500).json({ 
      error: 'Failed to process video',
      details: error.message
    });
  }
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Serve static files from the React app
if (process.env.NODE_ENV === 'production') {
  // Serve static files from production build
  app.use(express.static(path.join(__dirname, '../client/build')));
} else {
  // In development, we'll still serve the build files if they exist
  const clientBuildPath = path.join(__dirname, '../client/build');
  if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));
  }
}

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  const clientBuildPath = path.join(__dirname, '../client/build');
  if (fs.existsSync(path.join(clientBuildPath, 'index.html'))) {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  } else {
    res.status(404).send('Frontend not built yet. Please run "npm run build" in the client directory.');
  }
}); 