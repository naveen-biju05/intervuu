import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import passport from './config/passport.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import jobsRoutes from './routes/jobs.js';
import interviewRoutes from './routes/interviews.js';
import analyticsRoutes from './routes/analytics.js';
import adminRoutes from './routes/admin.js';
import answersRoutes from './routes/answers.js';
import protect from './middleware/authMiddleware.js';

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[SERVER] ${req.method} ${req.url}`);
  next();
});

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

app.use('/uploads', express.static('uploads'));
//  Passport init (Google OAuth)
app.use(passport.initialize());

// ─── Routes ───────────────────────────────────────────────────────────────────

// Auth routes (login, signup, google)
app.use('/api/auth', authRoutes);

//  Profile / User routes
app.use('/api/user', userRoutes);

//  Job listings & interview questions
app.use('/api/jobs', jobsRoutes);

// Interviews and analytics
app.use('/api/interviews', interviewRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/answers', answersRoutes);

//  Test protected route
app.get('/api/test', protect, (req, res) => {
  res.json({
    message: "JWT working perfectly",
    user: req.user
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Intervuu API is running.'
  });
});

// ─── Error Handling ───────────────────────────────────────────────────────────

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found.'
  });
});

// PayloadTooLargeError — explicit 413 response
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request payload is too large. Please reduce the size of your submission.',
    });
  }
  next(err);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error.'
  });
});

// ─── Database + Server Start ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });