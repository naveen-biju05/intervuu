import mongoose from 'mongoose';

/**
 * Stores AI-generated questions server-side so the frontend never needs
 * to round-trip model answers or keywords back to us in the evaluate call.
 * TTL index auto-deletes documents after 3 hours.
 */
const questionSessionSchema = new mongoose.Schema({
  sessionToken: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  jobId: {
    type: String,
    required: true,
  },
  questions: [
    {
      id: Number,
      question: String,
      modelAnswer: String,
      keywords: [String],
      difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
      category: { type: String, enum: ['technical', 'jd', 'communication', 'structure'], default: 'technical' },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 3, // 3-hour TTL — auto-deleted by MongoDB
  },
});

export default mongoose.model('QuestionSession', questionSessionSchema);
