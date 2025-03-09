import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

// Use relative path for API URL in production
const API_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:5000/api';

function App() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('video', file);

    try {
      setLoading(true);
      setError('');
      const response = await axios.post(`${API_URL}/summarize-video`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setSummary(response.data.summary);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process video');
    } finally {
      setLoading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.avi', '.mov', '.mkv']
    },
    maxFiles: 1
  });

  const handleYoutubeSubmit = async (e) => {
    e.preventDefault();
    if (!youtubeUrl) return;

    try {
      setLoading(true);
      setError('');
      
      const response = await axios.post(`${API_URL}/summarize-youtube`, {
        url: youtubeUrl
      });
      
      setSummary(response.data.summary);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process YouTube video');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-8 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent animate-gradient">
          Instant Clip Summarizer
        </h1>

        <div className="mb-8">
          <div
            {...getRootProps()}
            className={`card cursor-pointer ${
              isDragActive
                ? 'border-2 border-purple-500 bg-purple-50'
                : 'border-2 border-dashed border-gray-300 hover:border-purple-400'
            } transition-all duration-300`}
          >
            <input {...getInputProps()} />
            <div className="text-center py-8">
              <svg
                className="w-12 h-12 mx-auto mb-4 text-purple-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-lg text-gray-600">
                {isDragActive
                  ? 'Drop the video here'
                  : 'Drag & drop a video file here, or click to select'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center my-8">
          <div className="flex-1 h-px bg-gray-300"></div>
          <p className="px-4 text-gray-500 font-medium">OR</p>
          <div className="flex-1 h-px bg-gray-300"></div>
        </div>

        <form onSubmit={handleYoutubeSubmit} className="mb-8">
          <input
            type="text"
            placeholder="Enter YouTube URL"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            className="input-field mb-4"
          />
          <button
            type="submit"
            disabled={loading || !youtubeUrl}
            className={`btn-primary w-full ${
              loading || !youtubeUrl ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            Summarize
          </button>
        </form>

        {loading && (
          <div className="flex justify-center my-8">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {summary && (
          <div className="card bg-white/80 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800">Summary</h2>
            <div className="prose prose-purple max-w-none">
              <p className="text-gray-700 whitespace-pre-wrap">{summary}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
