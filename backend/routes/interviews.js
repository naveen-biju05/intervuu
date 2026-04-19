import express from 'express';
import InterviewSession from '../models/InterviewSession.js';
import QuestionSession from '../models/QuestionSession.js';
import protect from '../middleware/authMiddleware.js';
import { callGemmaJSON, isConfigured } from '../services/gemmaService.js';

const router = express.Router();

// ─── Payload size guardrails ───────────────────────────────────────────────────
const MAX_ANSWER_LENGTH = 2000;   // characters per answer — trim silently if exceeded
const MAX_PROCTORING_EVENTS = 20; // cap event list
const MIN_ANSWER_LENGTH = 3;      // minimum chars to consider an answer valid

/**
 * Check whether an answer is effectively empty / not answered.
 */
function isEmptyAnswer(userAnswer) {
  if (!userAnswer) return true;
  const trimmed = userAnswer.trim();
  if (trimmed.length < MIN_ANSWER_LENGTH) return true;
  // Catch placeholder text
  const placeholders = ['(no answer given)', 'no answer', 'n/a', 'na', 'none', '-', '.'];
  if (placeholders.includes(trimmed.toLowerCase())) return true;
  return false;
}

/**
 * Build the evaluation prompt for Gemma.
 * Only includes questions that have actual answers — empty answers are pre-scored to 0.
 */
function buildEvalPrompt(role, answersText) {
  // 4. IRRELEVANT ANSWER HIGH SCORE FIX
  return `You are a strict but fair interview evaluator for a ${role} position.
Evaluate meaning over exact keywords. Be fair even if an answer is simple.

STRICT RULES:
- Score ONLY based on actual content provided.
- Do NOT give default or mid-range scores. Base every score on evidence in the answer.
- If an answer is very short or off-topic, scores should be very low (0.0-0.2).
- If answer topic != question topic -> score must be < 0.3.
- If answer mentions unrelated domain -> penalize heavily.
- feedback MUST mention specific concepts the candidate got right or missed.
- feedback must NOT be generic. Reference the actual answer content.

For EACH answer below, score these dimensions (0 to 1):
- index: the index of the question provided
- semantic_score: meaning similarity to Ideal Answer
- keyword_score: keyword and synonym overlap
- concept_score: correctness of core idea (most important)
- structure_score: clarity and logical flow
- length_penalty: 1 if answer is too short (<15 words) or irrelevant rambling, else 0

You MUST return ONLY valid JSON with NO extra text, NO markdown, NO explanation.
Format:
{"per_question":[{"index":0, "semantic_score":0.85,"keyword_score":0.7,"concept_score":0.9,"structure_score":0.8,"length_penalty":0,"feedback":"Specific feedback about THIS answer...","improvements":["Specific improvement suggestion..."],"matched_keywords":["keyword1"]}]}

Answers:
${answersText}

Return the JSON now:`;
}

// Simple Jaccard similarity for copy-paste checking
function getSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const v1 = s1.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const v2 = s2.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (v1.length === 0 || v2.length === 0) return 0;
  const intersection = v1.filter(w => v2.includes(w));
  const union = new Set([...v1, ...v2]).size;
  return intersection.length / union;
}
/**
 * Compute per-question final scores from AI evaluation data.
 * STRICT: Empty/missing answers always get score=0 with appropriate feedback.
 */
function computeQuestionScores(questions_answers, storedQuestions, answerIndexes, aiEvaluation) {
  // Track which AI eval index maps to which question
  let aiEvalIdx = 0;

  return questions_answers.map((qa, i) => {
    const qIndex = answerIndexes ? answerIndexes[i] : i;
    const stored = storedQuestions[qIndex];
    if (!stored) return qa; // Skip if invalid
    console.log("Mapped Q:", qIndex);


    // ── STRICT RULE: Empty answer = score 0, no evaluation ──
    if (qa.is_empty || isEmptyAnswer(qa.userAnswer)) {
      return {
        ...qa,
        semantic_score: 0,
        keyword_score: 0,
        concept_score: 0,
        structure_score: 0,
        score: 0,
        feedback: 'No answer provided. Please attempt the question.',
        improvements: ['Provide a substantive answer addressing the core question.'],
        difficulty: stored.difficulty || qa.difficulty || 'medium',
        category: stored.category || qa.category || 'technical',
        answer_status: 'not_answered'
      };
    }

    // ── Answered questions: use AI evaluation ──
    const trueIndex = typeof qa.index !== 'undefined' ? qa.index : i;
    let ev = aiEvaluation?.per_question?.find(e => e.index === trueIndex) ||
               aiEvaluation?.per_question?.[aiEvalIdx] || {
      semantic_score: 0, keyword_score: 0, concept_score: 0, structure_score: 0,
      length_penalty: 0, feedback: 'Evaluation pending or failed.', improvements: [], matched_keywords: []
    };
    aiEvalIdx++;

    // Validate AI scores are within bounds (0-1)
    const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
    const semScore = clamp01(ev.semantic_score);
    const keyScore = clamp01(ev.keyword_score);
    const conScore = clamp01(ev.concept_score);
    const strScore = clamp01(ev.structure_score);

    // Confidence Markers — slight penalty for uncertainty language
    const confidenceMarkers = ["i think", "maybe", "not sure", "i guess", "probably"];
    const hasConfidencePenalty = confidenceMarkers.some(m => qa.userAnswer.toLowerCase().includes(m));

    // 3. COPY-PASTE QUESTION CHEATING FIX
    const sim = getSimilarity(qa.question, qa.userAnswer);
    let finalScore = 0;

    let answer_status = 'answered';
    if (qa.userAnswer.trim().length < 50) {
      answer_status = 'timeout_partial';
    }

    if (sim > 0.8 || qa.userAnswer.toLowerCase() === qa.question.toLowerCase()) {
      finalScore = 0;
      ev.feedback = "Answer appears copied from question";
      answer_status = "invalid";
    } else if (qa.userAnswer.length < 5) { // 9. STRICT ANSWER VALIDATION
      finalScore = 0;
    } else {
      // Formula: final_score = (0.4 * sem + 0.2 * key + 0.25 * con + 0.15 * str) * 100
      let fScore = (
        0.4 * semScore +
        0.2 * keyScore +
        0.25 * conScore +
        0.15 * strScore
      ) * 100;

      // Penalties
      if (hasConfidencePenalty) fScore *= 0.95;
      if (ev.length_penalty === 1) fScore *= 0.9;
      if (qa.userAnswer.trim().length < 20 && qa.userAnswer.trim().length >= MIN_ANSWER_LENGTH) fScore *= 0.9;

      // 4. IRRELEVANT ANSWER HIGH SCORE FIX
      if (semScore < 0.3 && conScore < 0.3) {
        fScore = Math.min(fScore, 25);
      }

      // Difficulty Boost
      if ((stored.difficulty || qa.difficulty) === 'hard') fScore *= 1.1;

      finalScore = Math.min(100, Math.max(0, Math.round(fScore * 100) / 100));
    }

    return {
      ...qa,
      semantic_score: semScore,
      keyword_score: keyScore,
      concept_score: conScore,
      structure_score: strScore,
      score: finalScore,
      feedback: ev.feedback || 'Evaluation completed.',
      improvements: ev.improvements || [],
      difficulty: stored.difficulty || qa.difficulty || 'medium',
      category: stored.category || qa.category || 'technical',
      answer_status
    };
  });
}

/**
 * Compute aggregate category scores.
 * STRICT: Categories with no answered questions default to 0, not 70.
 */
function computeAggregates(final_questions, eye_contact_consistency) {
  const answeredQuestions = final_questions.filter(q => q.answer_status !== 'not_answered');

  const getCatAvg = (cat) => {
    const qs = answeredQuestions.filter(q => q.category === cat);
    if (qs.length === 0) {
      // If there are unanswered questions in this category, score is 0
      const unanswered = final_questions.filter(q => q.category === cat && q.answer_status === 'not_answered');
      if (unanswered.length > 0) return 0;
      return 0; // No questions in this category at all — default to 0, not a fake score
    }
    return qs.reduce((sum, q) => sum + q.score, 0) / qs.length;
  };

  const technical_score = getCatAvg('technical');
  const jd_score        = getCatAvg('jd');
  const communication_score = getCatAvg('communication');
  const structure_score     = getCatAvg('structure');

  const overall_score = (
    0.35 * technical_score +
    0.25 * jd_score +
    0.20 * communication_score +
    0.20 * structure_score
  );

  const finalCommunication = Math.min(
    100,
    communication_score + (eye_contact_consistency * 10)
  );

  const strengths = final_questions
    .filter(q => q.score >= 80 && q.answer_status !== 'not_answered')
    .map(q => (q.feedback || '').substring(0, 100))
    .filter(s => s.length > 0)
    .slice(0, 3);

  let improvements = final_questions
    .filter(q => q.score < 60)
    .map(q => q.improvements?.[0])
    .filter(Boolean)
    .slice(0, 3);

  if (improvements.length === 0) {
    improvements = ['Focus on providing more detailed examples in your answers.'];
  }

  return {
    technical: technical_score,
    jd_alignment: jd_score,
    communication: finalCommunication,
    structure: structure_score,
    overall_score,
    strengths,
    improvements,
  };
}

/**
 * Validate the final session data before saving.
 * Ensures no invalid/NaN scores slip through.
 */
function validateSessionData(sessionData) {
  const numFields = ['overall_score', 'technical', 'jd_alignment', 'communication', 'structure'];
  for (const field of numFields) {
    if (typeof sessionData[field] !== 'number' || isNaN(sessionData[field])) {
      sessionData[field] = 0;
    }
    // Clamp to 0-100
    sessionData[field] = Math.max(0, Math.min(100, sessionData[field]));
  }

  // Validate per-question scores
  if (Array.isArray(sessionData.questions_answers)) {
    for (const qa of sessionData.questions_answers) {
      if (typeof qa.score !== 'number' || isNaN(qa.score)) {
        qa.score = 0;
      }
      qa.score = Math.max(0, Math.min(100, qa.score));
      if (!qa.feedback) qa.feedback = 'No feedback available.';
      if (!Array.isArray(qa.improvements)) qa.improvements = [];
    }
  }

  return sessionData;
}

/**
 * POST /api/interviews/evaluate
 *
 * Slim payload contract (client sends):
 *   { sessionToken, role, jobId, answers: [{questionIndex, userAnswer}],
 *     start_time, end_time, eye_contact_consistency, proctoring }
 *
 * For TERMINATED sessions, pass proctoring.terminated = true.
 * The backend saves a minimal record and skips AI eval entirely.
 */

/**
 * POST /api/interviews/start
 */
router.post('/start', protect, async (req, res) => {
  try {
    const { sessionToken, jobId, role } = req.body;
    if (!sessionToken || !jobId) {
      return res.status(400).json({ success: false, message: 'sessionToken and jobId are required.' });
    }

    const newSession = new InterviewSession({
      user_id: req.user._id,
      job_id: jobId,
      role: role || 'Unknown',
      start_time: new Date(),
      status: 'in_progress',
      duration_minutes: 0,
      questions_answers: [],
    });

    await newSession.save();

    res.status(201).json({ success: true, data: newSession });
  } catch (err) {
    console.error('[Start] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/evaluate', protect, async (req, res) => {
  try {
    const {
      sessionToken,
      jobId,
      role,
      answers = [],
      start_time,
      end_time,
      eye_contact_consistency = 0,
      proctoring,
    } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!sessionToken) {
      return res.status(400).json({ success: false, message: 'sessionToken is required.' });
    }

    // ── Fetch stored questions ────────────────────────────────────────────────
    const questionSession = await QuestionSession.findOne({ sessionToken });
    if (!questionSession) {
      return res.status(400).json({ success: false, message: 'Invalid or expired session token.' });
    }
    const storedQuestions = questionSession.questions;

    const start = new Date(start_time);
    const end   = new Date(end_time);
    const duration_minutes = Math.max(0, (end - start) / (1000 * 60));

    // ── Cap proctoring events ─────────────────────────────────────────────────
    const proctoringData = proctoring || { score: 0, warnings: 0, terminated: false, events: [], termination_reason: null };
    if (proctoringData.events?.length > MAX_PROCTORING_EVENTS) {
      proctoringData.events = proctoringData.events.slice(-MAX_PROCTORING_EVENTS);
    }
    if (proctoring?.termination_reason) {
      proctoringData.termination_reason = proctoring.termination_reason;
    }

    // ── TERMINATED SESSION — minimal save, skip AI entirely ───────────────────
    if (proctoringData.terminated) {
      const questions_answers = answers.map((a) => {
        const stored = storedQuestions[a.questionIndex];
        return {
          index:       a.questionIndex,
          question:    stored?.question   || '',
          userAnswer:  (a.userAnswer || '(no answer given)').substring(0, MAX_ANSWER_LENGTH),
          modelAnswer: stored?.modelAnswer || '',
          keywords:    stored?.keywords   || [],
          score:       0,
          feedback:    'Session terminated due to proctoring violation.',
          improvements: [],
          answer_status: 'not_answered'
        };
      }).filter(qa => qa.question);


      
      let sessionRecord;
      if (req.body.interview_id) {
         sessionRecord = await InterviewSession.findById(req.body.interview_id);
      }
      const finalPayload = validateSessionData({

        user_id:              req.user._id,
        job_id:               jobId || questionSession.jobId,
        role:                 role || 'Unknown',
        start_time:           start,
        end_time:             end,
        duration_minutes,
        overall_score:        0,
        technical:            0,
        jd_alignment:         0,
        communication:        0,
        structure:            0,
        questions_answers:    questions_answers,
        strengths:            [],
        improvements:         ['Your session was terminated due to proctoring irregularities. Future evaluations will require a stable environment and full adherence to screen-tracking guidelines.'],
        eye_contact_consistency: 0,
        proctoring:           proctoringData,
      });
      
      if (sessionRecord) {
         Object.assign(sessionRecord, finalPayload);
         await sessionRecord.save();
      } else {
         sessionRecord = new InterviewSession(finalPayload);
         await sessionRecord.save();
      }

      await QuestionSession.deleteOne({ sessionToken });
      return res.status(201).json({ success: true, data: sessionRecord });
    }

    // ── NORMAL SESSION — reconstruct full QA, run AI eval ─────────────────────
    const questions_answers = answers.map((a, index) => {
      const stored = storedQuestions[a.questionIndex];
      const uAnswer = a.userAnswer || '';
      return {
        index:       a.questionIndex ?? index, // Ensure index is passed for evaluation mapping
        question:    stored?.question   || '',
        userAnswer:  (uAnswer || '(no answer given)').substring(0, MAX_ANSWER_LENGTH),
        modelAnswer: stored?.modelAnswer || '',
        keywords:    stored?.keywords   || [],
        is_empty:    isEmptyAnswer(uAnswer)
      };
    }).filter(qa => qa.question); // Remove if stored is missing


    let aiEvaluation = null;

    // ── Only send ANSWERED questions to AI — skip empty ones to save tokens ──
    const answeredQAs = questions_answers.filter(qa => !qa.is_empty);

    if (isConfigured() && answeredQAs.length > 0) {
      const answersText = JSON.stringify(answeredQAs.map(qa => ({
         index: qa.index,
         question: qa.question,
         ideal_answer: qa.modelAnswer,
         candidate_answer: qa.userAnswer
      })), null, 2);

      const prompt = buildEvalPrompt(role, answersText);

      try {
        console.log('[Evaluate] Sending to Gemma 3 4B — answered questions:', answeredQAs.length, '/ total:', questions_answers.length);
        aiEvaluation = await callGemmaJSON(prompt, null);

        // ── Validate AI response structure ──
        if (aiEvaluation && !aiEvaluation.per_question) {
          console.warn('[Evaluate] AI response missing per_question field, discarding.');
          aiEvaluation = null;
        }
      } catch (err) {
        console.error('[Evaluate] AI eval failed:', err.message);
      }
    }

    // ── Pending Evaluation Check ──────────────────────────────────────────────
    let status = 'completed';
    if (!aiEvaluation?.per_question) {
      // If we had answerable questions but AI failed, mark as pending
      if (answeredQAs.length > 0) {
        status = 'pending_evaluation';
      }
      aiEvaluation = {
        per_question: answeredQAs.map(() => ({
          semantic_score: 0, keyword_score: 0, concept_score: 0, structure_score: 0,
          length_penalty: 0, feedback: 'Evaluation pending — AI was unavailable.', improvements: [], matched_keywords: [],
        })),
      };
    }

    // ── Score assembly ────────────────────────────────────────────────────────
    const answerIndexes = answers.map(a => a.questionIndex);
    const final_questions = computeQuestionScores(
      questions_answers, storedQuestions, answerIndexes, aiEvaluation
    );

    const aggregates = computeAggregates(final_questions, eye_contact_consistency);

    const sessionPayload = validateSessionData({
      user_id:               req.user._id,
      job_id:                jobId || questionSession.jobId,
      role,
      start_time:            start,
      end_time:              end,
      status,
      duration_minutes,
      overall_score:         aggregates.overall_score,
      technical:             aggregates.technical,
      jd_alignment:          aggregates.jd_alignment,
      communication:         aggregates.communication,
      structure:             aggregates.structure,
      questions_answers:     final_questions,
      strengths:             aggregates.strengths,
      improvements:          aggregates.improvements,
      eye_contact_consistency,
      proctoring:            proctoringData,
    });

    
    let sessionRecord;
    if (req.body.interview_id) {
       sessionRecord = await InterviewSession.findById(req.body.interview_id);
    }
    
    if (sessionRecord) {
       Object.assign(sessionRecord, sessionPayload);
       await sessionRecord.save();
    } else {
       sessionRecord = new InterviewSession(sessionPayload);
       await sessionRecord.save();
    }

    // Clean up session cache
    await QuestionSession.deleteOne({ sessionToken });

    res.status(201).json({ success: true, data: sessionRecord });

  } catch (err) {
    console.error('[Evaluate] Unhandled error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/interviews/:id
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const query = { _id: req.params.id };
    if (req.user.role !== 'admin') query.user_id = req.user._id;

    const session = await InterviewSession.findOne(query);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/interviews/:id/retry
 * Retries evaluation for pending sessions.
 */
router.post('/:id/retry', protect, async (req, res) => {
  try {
    const session = await InterviewSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    if (session.user_id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    if (session.status !== 'pending_evaluation') {
      return res.status(400).json({ success: false, message: 'Session is already evaluated' });
    }

    if (!isConfigured()) {
      return res.status(500).json({ success: false, message: 'GEMMA_API_KEY missing, cannot evaluate' });
    }

    // Only evaluate non-empty answers
    const answeredQAs = session.questions_answers.filter(qa => !isEmptyAnswer(qa.userAnswer));

    if (answeredQAs.length === 0) {
      // All answers are empty — just zero everything out
      session.questions_answers = session.questions_answers.map(qa => ({
        ...qa.toObject ? qa.toObject() : qa,
        score: 0,
        feedback: 'No answer provided. Please attempt the question.',
        improvements: ['Provide a substantive answer addressing the core question.'],
        answer_status: 'not_answered',
        semantic_score: 0, keyword_score: 0, concept_score: 0, structure_score: 0,
      }));
      session.overall_score = 0;
      session.technical = 0;
      session.jd_alignment = 0;
      session.communication = 0;
      session.structure = 0;
      session.strengths = [];
      session.improvements = ['All questions were left unanswered. Please attempt the interview again.'];
      session.status = 'completed';
      await session.save();
      return res.json({ success: true, data: session });
    }

    const answersText = answeredQAs
      .map((qa, i) =>
        `Q${i + 1}: ${qa.question}\nIdeal Answer: ${qa.modelAnswer}\nCandidate Answer: ${qa.userAnswer}`
      )
      .join('\n\n');

    const prompt = buildEvalPrompt(session.role, answersText);

    console.log('[Retry] Sending to Gemma 3 4B — answered:', answeredQAs.length, '/ total:', session.questions_answers.length);
    const aiEvaluation = await callGemmaJSON(prompt);

    if (!aiEvaluation?.per_question) {
      throw new Error('AI evaluation returned invalid structure');
    }

    let aiIdx = 0;
    const final_questions = session.questions_answers.map((qa, i) => {
      const qaObj = qa.toObject ? qa.toObject() : qa;

      // ── STRICT: Empty answers always get 0 ──
      if (isEmptyAnswer(qaObj.userAnswer)) {
        return {
          ...qaObj,
          score: 0,
          feedback: 'No answer provided. Please attempt the question.',
          improvements: ['Provide a substantive answer addressing the core question.'],
          answer_status: 'not_answered',
          semantic_score: 0, keyword_score: 0, concept_score: 0, structure_score: 0,
        };
      }

      const ev = aiEvaluation?.per_question?.[aiIdx] || {
        semantic_score: 0, keyword_score: 0, concept_score: 0, structure_score: 0,
        length_penalty: 0, feedback: 'Error during retry eval.', improvements: [], matched_keywords: []
      };
      aiIdx++;

      const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
      const semScore = clamp01(ev.semantic_score);
      const keyScore = clamp01(ev.keyword_score);
      const conScore = clamp01(ev.concept_score);
      const strScore = clamp01(ev.structure_score);

      // Confidence Markers
      const confidenceMarkers = ["i think", "maybe", "not sure", "i guess", "probably"];
      const hasConfidencePenalty = confidenceMarkers.some(m => qaObj.userAnswer.toLowerCase().includes(m));

      let fScore = (
        0.4 * semScore +
        0.2 * keyScore +
        0.25 * conScore +
        0.15 * strScore
      ) * 100;

      if (hasConfidencePenalty) fScore *= 0.95;
      if (ev.length_penalty === 1) fScore *= 0.9;
      if (qaObj.userAnswer.trim().length < 20 && qaObj.userAnswer.trim().length >= MIN_ANSWER_LENGTH) fScore *= 0.9;
      if (qaObj.difficulty === 'hard') fScore *= 1.1;

      const finalScore = Math.min(100, Math.max(0, Math.round(fScore * 100) / 100));

      return {
        ...qaObj,
        semantic_score: semScore,
        keyword_score: keyScore,
        concept_score: conScore,
        structure_score: strScore,
        score: finalScore,
        feedback: ev.feedback || 'Evaluation completed.',
        improvements: ev.improvements || [],
        answer_status: qaObj.userAnswer.trim().length < 50 ? 'timeout_partial' : 'answered',
      };
    });

    session.questions_answers = final_questions;

    const aggregates = computeAggregates(final_questions, session.eye_contact_consistency);

    session.technical = aggregates.technical;
    session.jd_alignment = aggregates.jd_alignment;
    session.communication = aggregates.communication;
    session.structure = aggregates.structure;
    session.overall_score = aggregates.overall_score;
    session.strengths = aggregates.strengths;
    session.improvements = aggregates.improvements;
    session.status = 'completed';

    // Final validation before save
    validateSessionData(session);

    await session.save();

    res.json({ success: true, data: session });
  } catch (err) {
    console.error('[Retry Evaluation] Unhandled error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
