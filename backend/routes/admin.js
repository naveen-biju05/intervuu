import express from 'express';
import InterviewSession from '../models/InterviewSession.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/admin/interviews
 * Admin route to get all grouped interview sessions.
 */
router.get('/interviews', protect, async (req, res) => {
  try {
    // Admin check
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const sessions = await InterviewSession.find()
      .populate("user_id", "name email")
      .sort({ createdAt: -1 });

    const groupedData = {};

    sessions.forEach(session => {
       if (!session.user_id) return; // skip if user was completely deleted but session remains

       const userId = session.user_id._id.toString();
       if (!groupedData[userId]) {
         groupedData[userId] = {
           user: {
             name: session.user_id.name,
             email: session.user_id.email
           },
           sessions: []
         };
       }

       groupedData[userId].sessions.push({
         id: session._id,
         role: session.role || "Unknown",
         overall_percentage: Number(session.overall_score || session.overall_percentage || 0),
         technical_score: Number(session.technical || session.technical_score || 0),
         communication_score: Number(session.communication || session.communication_score || 0),
         structure_score: Number(session.structure || session.structure_score || 0),
         date: session.end_time || session.start_time || session.createdAt,
         terminated: session.proctoring?.terminated || false
       });
    });

    const result = Object.values(groupedData);

    res.json({ users: result });
  } catch (err) {
    console.error("Admin interviews fetch error:", err);
    res.status(500).json({ message: "Failed to load admin performance dashboard." });
  }
});

export default router;
