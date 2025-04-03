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

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

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

// Helper function to download YouTube video
async function downloadYouTubeVideo(url) {
  try {
    // Get video info
    const videoInfo = await play.video_info(url);
    const videoId = videoInfo.video_details.id;
    const videoPath = `uploads/${videoId}.mp4`;

    // Get the best audio-only stream
    const stream = await play.stream_from_info(videoInfo, { quality: 140 }); // 140 is audio-only m4a

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(videoPath);
      
      let startTime = Date.now();
      let totalBytes = 0;
      
      stream.stream.on('data', (chunk) => {
        totalBytes += chunk.length;
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const bytesPerSecond = totalBytes / elapsedSeconds;
        const mbPerSecond = (bytesPerSecond / (1024 * 1024)).toFixed(2);
        console.log(`Download speed: ${mbPerSecond} MB/s`);
      });

      stream.stream.pipe(writeStream);

      writeStream.on('finish', () => {
        console.log('YouTube video download completed');
        resolve(videoPath);
      });

      writeStream.on('error', (err) => {
        console.error('Error writing video file:', err);
        reject(err);
      });

      stream.stream.on('error', (err) => {
        console.error('Error downloading YouTube video:', err);
        reject(err);
      });
    });
  } catch (error) {
    console.error('Error in downloadYouTubeVideo:', error);
    throw error;
  }
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

// Helper function to generate summary using DeepSeek
async function generateSummaryWithDeepSeek(content) {
  try {
    // Check if DeepSeek API key is provided
    if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'your_deepseek_api_key_here') {
      return `DeepSeek API key not configured. Please add your API key to the .env file.
      
      Here's a preview of the content that would be summarized:
      ${content.substring(0, 300)}...`;
    }

    // Make the API call to DeepSeek
    try {
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: "deepseek-reasoner",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that creates concise, well-structured summaries. Focus on extracting the key points and organizing them logically."
          },
          {
            role: "user",
            content: `Please summarize the following content in a professional and informative way. Use bullet points or sections where appropriate to improve readability: ${content}`
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.choices[0].message.content;
    } catch (apiError) {
      console.error('DeepSeek API call error:', apiError.response?.data || apiError.message);
      return `Failed to generate summary with DeepSeek API. Error: ${apiError.message}`;
    }
  } catch (error) {
    console.error('DeepSeek function error:', error);
    return `Failed to generate summary. Error: ${error.message}`;
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
      const summary = await generateSummaryWithDeepSeek(contentToSummarize);
      
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
    
    // Generate summary using DeepSeek
    const summary = await generateSummaryWithDeepSeek(contentToSummarize);
    
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 