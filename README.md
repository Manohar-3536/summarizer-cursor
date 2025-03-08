# Instant-Clip-Summarizer
II-year project
Started Basic UI   18-02-2025
Added Drag and Drop and created another style with responsiveness   19-02-2025

## Description
Instant Clip Summarizer is a web application that allows users to upload video files or provide YouTube URLs and get AI-generated summaries of the content.

## Features
- Upload video files through drag-and-drop
- Summarize YouTube videos by URL
- Modern, responsive UI
- Text-to-Speech capability

## Tech Stack
- **Frontend**: React, Material-UI
- **Backend**: Node.js, Express
- **AI**: OpenAI API
- **Video Processing**: FFmpeg, ytdl-core

## Local Development
1. Clone the repository
2. Install dependencies:
   ```
   # Install server dependencies
   cd server
   npm install

   # Install client dependencies
   cd ../client
   npm install
   ```
3. Set up environment variables:
   - Create a `.env` file in the server directory
   - Add your OpenAI API key: `OPENAI_API_KEY=your_api_key_here`

4. Run the application:
   ```
   # Start the server
   cd server
   npm run dev

   # In a new terminal, start the client
   cd client
   npm start
   ```

## Deployment to Render.com

1. Fork or clone this repository to your GitHub account
2. Create an account on [Render.com](https://render.com/)
3. Click "New" and select "Blueprint" from the dropdown
4. Connect your GitHub repository
5. Render will detect the `render.yaml` file and set up your service
6. Add your environment variables:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `DEEPSEEK_API_KEY`: Your DeepSeek API key
7. Deploy your application

## Important Notes
- You need valid API keys for OpenAI and DeepSeek
- The application uses OpenAI's Whisper for transcription, which has usage costs
- For videos longer than 10 minutes, only metadata is used for summarization to reduce API costs
- The uploads directory needs to be persistent in production environments

## License
This project is licensed under the MIT License - see the LICENSE file for details.
