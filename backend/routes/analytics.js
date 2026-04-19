import express from 'express';
import InterviewSession from '../models/InterviewSession.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/analytics
 * Retrieve aggregated analytics for the logged-in user.
 * Terminated sessions are counted but excluded from score averages.
 */
router.get('/', protect, async (req, res) => {
  try {
    const sessions = await InterviewSession.find({ user_id: req.user._id }).sort({ createdAt: -1 });

    if (sessions.length === 0) {
      return res.json({
        summary: { readiness_score: 0, total_interviews: 0, completed_interviews: 0, terminated_interviews: 0, avg_technical_score: 0, practice_hours: 0 },
        history: [],
        skill_trends: { technical: 0, jd_alignment: 0, communication: 0, structure: 0 }
      });
    }

    let scored_count = 0;
    let total_overall_score = 0;
    let total_technical_score = 0;
    let total_duration_minutes = 0;
    let terminated_count = 0;

    const sums = { technical: 0, jd_alignment: 0, communication: 0, structure: 0 };

    const history = sessions.map(session => {
      const isTerminated = session.proctoring?.terminated === true;
      const isPending = session.status === 'pending_evaluation';
      const overall  = Number(session.overall_score || session.overall_percentage || 0);
      const tech     = Number(session.technical || session.technical_score || 0);
      const comm     = Number(session.communication || session.communication_score || 0);
      const struct   = Number(session.structure || session.structure_score || 0);
      const jd       = Number(session.jd_alignment || 0);
      const duration = Number(session.duration_minutes || 0);

      total_duration_minutes += duration;

      if (isTerminated || isPending) {
        if (isTerminated) terminated_count++;
      } else {
        scored_count++;
        total_overall_score   += overall;
        total_technical_score += tech;
        sums.technical     += tech;
        sums.jd_alignment  += jd;
        sums.communication += comm;
        sums.structure     += struct;
      }

      const terminationReason = isTerminated && session.proctoring?.events?.length
        ? session.proctoring.events[session.proctoring.events.length - 1].event
        : null;

      return {
        id:               session._id,
        date_raw:         session.end_time || session.start_time,
        role:             session.role || 'Unknown',
        score:            (isTerminated || isPending) ? null : overall.toFixed(1),
        technical:        (isTerminated || isPending) ? null : tech.toFixed(1),
        communication:    (isTerminated || isPending) ? null : comm.toFixed(1),
        structure:        (isTerminated || isPending) ? null : struct.toFixed(1),
        terminated:       isTerminated,
        pending:          isPending,
        terminationReason,
        report_link:      `/report/${session._id}`
      };
    });

    // ── Readiness Score Calculation ───────────────────────────────────────────
    const scoredSessions = sessions.filter(s => s.status === 'completed' && (!s.proctoring || !s.proctoring.terminated));
    const recentScores = scoredSessions.slice(0, 5).map(s => s.overall_score);
    const avg_recent_scores = recentScores.length > 0 ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : 0;
    
    // Consistency
    let consistency = 0;
    if (recentScores.length > 1) {
      const mean = avg_recent_scores;
      const squareDiffs = recentScores.map(val => Math.pow(val - mean, 2));
      const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
      const stdDev = Math.sqrt(avgSquareDiff);
      consistency = Math.max(0, 1 - (stdDev / 100));
    } else if (recentScores.length === 1) {
      consistency = 1;
    }

    // Completion Rate
    const completion_rate = sessions.length > 0 ? scored_count / sessions.length : 0;

    // Improvement Trend
    let improvement_trend = 0;
    if (scoredSessions.length >= 2) {
      const last = scoredSessions[0].overall_score;
      const first = scoredSessions[scoredSessions.length - 1].overall_score;
      improvement_trend = (last - first) / 100;
    }

    const readiness_score = (
      0.4 * avg_recent_scores +
      0.2 * (consistency * 100) +
      0.2 * (completion_rate * 100) +
      0.2 * (improvement_trend * 100)
    );

    // ── Practice Hours (2h cap) ────────────────────────────────────────────────
    let total_practice_seconds = 0;
    sessions.forEach(s => {
      const dur = (new Date(s.end_time) - new Date(s.start_time)) / 1000;
      if (dur > 0 && dur <= 7200) { // Max 2 hours (7200s)
        total_practice_seconds += dur;
      } else if (dur > 7200) {
        total_practice_seconds += 7200;
      }
    });
    const practice_hours = total_practice_seconds / 3600;

    const skill_trends = {
      technical:     scored_count > 0 ? sums.technical     / scored_count : 0,
      jd_alignment:  scored_count > 0 ? sums.jd_alignment  / scored_count : 0,
      communication: scored_count > 0 ? sums.communication / scored_count : 0,
      structure:     scored_count > 0 ? sums.structure      / scored_count : 0
    };

    // ── DASHBOARD OUTPUT FORMAT (STRICT) ──────────────────────────────────────
    const dashboard_text = `## 📊 OVERALL DASHBOARD

Readiness Score: ${readiness_score.toFixed(0)}%
Total Sessions: ${sessions.length}
✓ Completed: ${scored_count}
✕ Terminated: ${terminated_count}
Avg. Technical Score: ${skill_trends.technical.toFixed(1)} / 100
Practice Hours: ${practice_hours.toFixed(1)}h

---

## 📈 SKILL TRENDS

Technical Skill Proficiency: ${skill_trends.technical.toFixed(0)} / 100
JD Alignment (Role Relevance): ${skill_trends.jd_alignment.toFixed(0)} / 100
Communication (Tone & Clarity): ${skill_trends.communication.toFixed(0)} / 100
Structure (Logic & Flow): ${skill_trends.structure.toFixed(0)} / 100`;

    res.json({
      summary: {
        readiness_score:       readiness_score,
        total_interviews:      sessions.length,
        completed_interviews:  scored_count,
        terminated_interviews: terminated_count,
        avg_technical_score:   skill_trends.technical,
        practice_hours:        practice_hours
      },
      history,
      skill_trends,
      dashboard_text // Exact structure requested
    });
  } catch (err) {
    console.error('Analytics fetch error:', err);
    res.status(500).json({ message: 'Failed to load analytics data', error: err.message });
  }
});

export default router;
