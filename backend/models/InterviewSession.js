import mongoose from "mongoose";

const interviewSessionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    job_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    role: {
      type: String,
      required: true,
    },
    start_time: {
      type: Date,
      required: true,
      default: Date.now,
    },
    end_time: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'pending_evaluation'],
      default: 'in_progress',
    },
    duration_minutes: {
      type: Number,
      default: 0,
    },
    technical: {
      type: Number,
      default: 0,
    },
    jd_alignment: {
      type: Number,
      default: 0,
    },
    communication: {
      type: Number,
      default: 0,
    },
    structure: {
      type: Number,
      default: 0,
    },
    overall_score: {
      type: Number,
      default: 0,
    },
    questions_answers: [
      {
        question: String,
        userAnswer: String,
        modelAnswer: String,
        keywords: [String],
        semantic_score: { type: Number, default: 0 },
        keyword_score: { type: Number, default: 0 },
        concept_score: { type: Number, default: 0 },
        structure_score: { type: Number, default: 0 },
        score: Number, // final_score
        answer_status: { type: String, enum: ['answered', 'not_answered', 'timeout_partial', 'invalid'], default: 'not_answered' },
        difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
        category: { type: String, enum: ['technical', 'jd', 'communication', 'structure'], default: 'technical' },
        feedback: String,
        improvements: [String],
      },
    ],
    strengths: [String],
    improvements: [String],
    eye_contact_consistency: {
      type: Number,
      default: 0,
    },
    proctoring: {
      score: { type: Number, default: 0 },
      warnings: { type: Number, default: 0 },
      terminated: { type: Boolean, default: false },
      termination_reason: { type: String },
      events: [
        {
          event: String,
          timestamp: String,
          severity: String,
        },
      ],
    },
  },
  { timestamps: true }
);

export default mongoose.model("InterviewSession", interviewSessionSchema);
