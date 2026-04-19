import express from 'express';
import Answer from '../models/Answer.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * POST /api/answers/save
 */
router.post('/save', protect, async (req, res) => {
  try {
    const { interview_id, question_id, answer_text, answer_status } = req.body;

    console.log("Answer received:", { interview_id, question_id });

    if (!interview_id || question_id === undefined) {
      return res.status(400).json({ success: false, message: 'interview_id and question_id are required.' });
    }

    const answer = new Answer({
      interview_id,
      question_id: String(question_id),
      user_id: req.user._id,
      answer_text: answer_text || "",
      answer_status: answer_status || "not_answered",
    });

    await answer.save();

    console.log("Saved to DB:", answer._id);

    return res.status(201).json({ success: true, data: answer });
  } catch (error) {
    console.error("Failed to save answer:", error);
    return res.status(500).json({ success: false, message: 'Internal server error while saving answer.' });
  }
});

export default router;
