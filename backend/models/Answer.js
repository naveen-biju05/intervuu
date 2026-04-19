import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  interview_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InterviewSession',
    required: true,
  },
  question_id: {
    type: String,
    required: true,
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  answer_text: {
    type: String,
    default: "",
  },
  answer_status: {
    type: String,
    enum: ['answered', 'not_answered', 'timeout_partial', 'invalid'],
    default: 'not_answered',
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Answer', answerSchema);
