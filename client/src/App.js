import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Divider,
  CircularProgress
} from '@mui/material';
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
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom align="center">
        Instant Clip Summarizer
      </Typography>

      <Box sx={{ mb: 4 }}>
        <Paper
          {...getRootProps()}
          sx={{
            p: 3,
            textAlign: 'center',
            cursor: 'pointer',
            bgcolor: isDragActive ? 'action.hover' : 'background.paper',
            border: '2px dashed',
            borderColor: isDragActive ? 'primary.main' : 'grey.300'
          }}
        >
          <input {...getInputProps()} />
          <Typography>
            {isDragActive
              ? 'Drop the video here'
              : 'Drag & drop a video file here, or click to select'}
          </Typography>
        </Paper>
      </Box>

      <Divider sx={{ my: 4 }}>OR</Divider>

      <Box component="form" onSubmit={handleYoutubeSubmit} sx={{ mb: 4 }}>
        <TextField
          fullWidth
          label="YouTube URL"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Button
          fullWidth
          variant="contained"
          type="submit"
          disabled={loading || !youtubeUrl}
        >
          Summarize
        </Button>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Typography color="error" sx={{ my: 2 }}>
          {error}
        </Typography>
      )}

      {summary && (
        <Paper sx={{ p: 3, mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Summary
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{summary}</Typography>
        </Paper>
      )}
    </Container>
  );
}

export default App;
