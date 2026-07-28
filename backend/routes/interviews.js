import express from "express";
import InterviewSession from "../models/InterviewSession.js";
import QuestionSession from "../models/QuestionSession.js";
import protect from "../middleware/authMiddleware.js";
import { callGemmaJSON, isConfigured } from "../services/gemmaService.js";

const router = express.Router();

// ─── Payload size guardrails ───────────────────────────────────────────────────
const MAX_ANSWER_LENGTH = 2000; // characters per answer — trim silently if exceeded
const MAX_PROCTORING_EVENTS = 20; // cap event list
const MIN_ANSWER_LENGTH = 3; // minimum chars to consider an answer valid

/**
 * Check whether an answer is effectively empty / not answered.
 */
function isEmptyAnswer(userAnswer) {
  if (!userAnswer) return true;
  const trimmed = userAnswer.trim();
  if (trimmed.length < MIN_ANSWER_LENGTH) return true;
  // Catch placeholder text
  const placeholders = [
    "(no answer given)",
    "no answer",
    "n/a",
    "na",
    "none",
    "-",
    ".",
  ];
  if (placeholders.includes(trimmed.toLowerCase())) return true;
  return false;
}

/**
 * Build the evaluation prompt for Gemma.
 * Only includes questions that have actual answers — empty answers are pre-scored to 0.
 */
function buildEvalPrompt(role, answersText) {
  return `You are a high-level technical interviewer evaluating a candidate for a ${role} position.
Your goal is to perform a deep GAP ANALYSIS of the candidate's answers against the provided Ideal Answers.

STRICT EVALUATION RULES:
1. **Relevance First**: If the candidate's answer is unrelated to the question or addresses the wrong topic, ALL scores MUST be 0.
2. **Comparison**: Directly compare the 'candidate_answer' with the 'ideal_answer'.
3. **Keyword Detection**: Identify which essential technical terms from the 'ideal_answer' were used by the candidate.
4. **Accuracy over Jargon**: If a candidate explains a complex concept correctly using simple words, give a high Technical Score (0.8+). If they use jargon but get the logic wrong, give a low score.
5. **Fairness**: Do not penalize for brevity if the core answer is complete. Do penalize for rambling or irrelevant fluff.

SCORING DIMENSIONS (Scale 0.0 to 1.0):
- technical_score: Accuracy, depth, and correctness of the technical concept.
- jd_alignment_score: Relevance to the question and the ${role} role.
- communication_score: Clarity, professional tone, and use of relevant terminology.
- structure_score: How well the answer is organized and sequenced.

OUTPUT FORMAT (Strict JSON only):
{
  "per_question": [
    {
      "index": 0,
      "technical_score": 0.85,
      "jd_alignment_score": 0.9,
      "communication_score": 0.7,
      "structure_score": 0.8,
      "feedback": "Your answer correctly identifies [Concept X] which matches the ideal response. However, you missed mentioning [Concept Y] and [Concept Z] which are critical for a complete explanation.",
      "matched_keywords": ["term1", "term2"],
      "missing_keywords": ["term3", "term4"],
      "improvements": ["Mention the specific use of [Concept Y] to show architectural depth."]
    }
  ],
  "overall_summary": {
    "strengths": ["Strong understanding of [Topic A]", "Clear communication of [Topic B]"],
    "improvements": ["Deepen knowledge in [Topic C]", "Work on structured explanations for [Topic D]"]
  }
}

Answers to evaluate:
${answersText}

Return only the JSON block. No explanation.`;
}

// Simple Jaccard similarity for copy-paste checking
function getSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const v1 = s1
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const v2 = s2
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (v1.length === 0 || v2.length === 0) return 0;
  const intersection = v1.filter((w) => v2.includes(w));
  const union = new Set([...v1, ...v2]).size;
  return intersection.length / union;
}
/**
 * Compute per-question final scores from AI evaluation data.
 * STRICT: Empty/missing answers always get score=0 with appropriate feedback.
 */
function computeQuestionScores(
  questions_answers,
  storedQuestions,
  answerIndexes,
  aiEvaluation,
) {
  let aiEvalIdx = 0;

  return questions_answers.map((qa, i) => {
    const qIndex = answerIndexes ? answerIndexes[i] : i;
    const stored = storedQuestions[qIndex];
    if (!stored) return qa;

    // ── EMPTY ANSWER ──
    if (!qa.userAnswer || qa.userAnswer.trim().length === 0) {
      return {
        ...qa,
        semantic_score: 0,
        keyword_score: 0,
        concept_score: 0,
        structure_score: 0,
        score: 0,
        feedback: "No answer provided for this question.",
        improvements: [
          "Ensure you provide a clear verbal or typed response to every question.",
        ],
        difficulty: stored.difficulty || "medium",
        category: stored.category || "technical",
        answer_status: "not_answered",
        matched_keywords: [],
        missing_keywords: stored.keywords || [],
      };
    }

    const answer = qa.userAnswer.toLowerCase().trim();

    // ── COPY QUESTION CHECK ──
    if (
      answer === qa.question.toLowerCase().trim() ||
      getSimilarity(qa.question, qa.userAnswer) > 0.85
    ) {
      return {
        ...qa,
        score: 0,
        feedback:
          "The answer provided is nearly identical to the question itself. Please provide a unique explanation.",
        improvements: [
          "Use your own words to explain the concept rather than repeating the question.",
        ],
        answer_status: "invalid",
        matched_keywords: [],
        missing_keywords: stored.keywords || [],
      };
    }
    // ── GET AI EVALUATION SAFELY ──
    let ev = aiEvaluation?.per_question?.find((e) => e.index === qa.index);

    // STRICT: NO FALLBACK
    if (!ev) {
      console.error("❌ No AI eval found for index:", qa.index);

      return {
        ...qa,
        semantic_score: 0,
        keyword_score: 0,
        concept_score: 0,
        structure_score: 0,
        score: 0,
        feedback: "No answer provided or evaluation failed",
        improvements: ["Provide a valid answer"],
        answer_status: "not_answered",
      };
    }

    const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

    const techScore = clamp01(ev.technical_score || ev.concept_score);
    const jdScore = clamp01(ev.jd_alignment_score || ev.semantic_score);
    const commScore = clamp01(ev.communication_score || ev.keyword_score);
    const strScore = clamp01(ev.structure_score);

    // ── 🚨 RELEVANCE CHECK ──
    // If AI gives very low technical or JD scores, it's likely irrelevant
    if (techScore < 0.3 || jdScore < 0.3) {
      return {
        ...qa,
        semantic_score: jdScore,
        keyword_score: commScore,
        concept_score: techScore,
        structure_score: strScore,
        score: 0,
        feedback:
          ev.feedback ||
          "The answer does not appear to be relevant to the question asked.",
        improvements: ev.improvements?.length
          ? ev.improvements
          : [
              "Ensure your answer directly addresses the technical requirements of the question.",
            ],
        difficulty: stored.difficulty || "medium",
        category: stored.category || "technical",
        answer_status: "invalid",
        matched_keywords: ev.matched_keywords || [],
        missing_keywords: ev.missing_keywords || stored.keywords || [],
      };
    }

    // ── NORMAL SCORING ──
    // Weighted scoring: Technical (40%), JD Alignment (30%), Communication (15%), Structure (15%)
    let fScore =
      (0.4 * techScore + 0.3 * jdScore + 0.15 * commScore + 0.15 * strScore) *
      100;

    // ── KEYWORD BONUS ──
    // If the candidate used most of the target keywords, give a small boost
    const matchedCount = (ev.matched_keywords || []).length;
    const totalKeywords = (stored.keywords || []).length;
    if (totalKeywords > 0 && matchedCount / totalKeywords > 0.7) {
      fScore += 5;
    }

    // ── DIFFICULTY BOOST ──
    if ((stored.difficulty || "medium") === "hard") fScore *= 1.05;

    let finalScore = Math.min(100, Math.max(0, Math.round(fScore)));

    // ── FINAL SAFETY CUT ──
    if (finalScore < 15) finalScore = 0;

    return {
      ...qa,
      semantic_score: jdScore,
      keyword_score: commScore,
      concept_score: techScore,
      structure_score: strScore,
      score: finalScore,
      feedback: ev.feedback || "Answer successfully evaluated.",
      improvements: ev.improvements || [],
      matched_keywords: ev.matched_keywords || [],
      missing_keywords: ev.missing_keywords || [],
      difficulty: stored.difficulty || "medium",
      category: stored.category || "technical",
      answer_status: "answered",
    };
  });
}
/**
 * Compute aggregate category scores.
 */
function computeAggregates(
  final_questions,
  eye_contact_consistency,
  aiSummary = null,
) {
  const N = final_questions.length;

  let total_technical = 0;
  let total_jd = 0;
  let total_comm = 0;
  let total_structure = 0;

  if (N > 0) {
    for (const q of final_questions) {
      // Scores are extracted from AI eval in 0-1 range, scale by 100.
      // Unanswered questions have these set to 0.
      total_technical += (q.concept_score || 0) * 100;
      total_jd += (q.semantic_score || 0) * 100;
      total_comm += (q.keyword_score || 0) * 100;
      total_structure += (q.structure_score || 0) * 100;
    }
  }

  const final_technical = N > 0 ? Math.round(total_technical / N) : 0;
  const final_jd = N > 0 ? Math.round(total_jd / N) : 0;
  const final_comm = N > 0 ? Math.round(total_comm / N) : 0;
  const final_structure = N > 0 ? Math.round(total_structure / N) : 0;

  const overall_score = Math.round(
    0.3 * final_technical +
      0.25 * final_jd +
      0.25 * final_comm +
      0.2 * final_structure,
  );

  const strengths = Array.from(
    new Set(
      aiSummary?.strengths ||
        final_questions
          .filter((q) => q.score >= 80 && q.answer_status !== "not_answered")
          .map((q) => (q.feedback || "").substring(0, 150))
          .filter((s) => s.length > 0),
    ),
  ).slice(0, 3);

  let improvements = Array.from(
    new Set(
      aiSummary?.improvements ||
        final_questions
          .filter((q) => q.score < 60)
          .map((q) => q.improvements?.[0])
          .filter(Boolean),
    ),
  ).slice(0, 3);

  if (improvements.length === 0 && (!aiSummary || !aiSummary.improvements)) {
    improvements = [
      "Focus on providing more detailed examples and structured explanations in your answers.",
    ];
  }

  return {
    technical: final_technical,
    jd_alignment: final_jd,
    communication: final_comm,
    structure: final_structure,
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
  const numFields = [
    "overall_score",
    "technical",
    "jd_alignment",
    "communication",
    "structure",
  ];
  for (const field of numFields) {
    if (typeof sessionData[field] !== "number" || isNaN(sessionData[field])) {
      sessionData[field] = 0;
    }
    // Clamp to 0-100
    sessionData[field] = Math.max(0, Math.min(100, sessionData[field]));
  }

  // Validate per-question scores
  if (Array.isArray(sessionData.questions_answers)) {
    for (const qa of sessionData.questions_answers) {
      if (typeof qa.score !== "number" || isNaN(qa.score)) {
        qa.score = 0;
      }
      qa.score = Math.max(0, Math.min(100, qa.score));
      if (!qa.feedback) qa.feedback = "No feedback available.";
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
router.post("/start", protect, async (req, res) => {
  try {
    const { sessionToken, jobId, role } = req.body;
    if (!sessionToken || !jobId) {
      return res.status(400).json({
        success: false,
        message: "sessionToken and jobId are required.",
      });
    }

    const newSession = new InterviewSession({
      user_id: req.user._id,
      job_id: jobId,
      role: role || "Unknown",
      start_time: new Date(),
      status: "in_progress",
      duration_minutes: 0,
      questions_answers: [],
    });

    await newSession.save();

    res.status(201).json({ success: true, data: newSession });
  } catch (err) {
    console.error("[Start] Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/evaluate", protect, async (req, res) => {
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
      return res
        .status(400)
        .json({ success: false, message: "sessionToken is required." });
    }

    // ── Fetch stored questions ────────────────────────────────────────────────
    const questionSession = await QuestionSession.findOne({ sessionToken });
    if (!questionSession) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired session token." });
    }
    const storedQuestions = questionSession.questions;

    const start = new Date(start_time);
    const end = new Date(end_time);
    const duration_minutes = Math.max(0, (end - start) / (1000 * 60));

    // ── Cap proctoring events ─────────────────────────────────────────────────
    const proctoringData = proctoring || {
      score: 0,
      warnings: 0,
      terminated: false,
      events: [],
      termination_reason: null,
    };
    if (proctoringData.events?.length > MAX_PROCTORING_EVENTS) {
      proctoringData.events = proctoringData.events.slice(
        -MAX_PROCTORING_EVENTS,
      );
    }
    if (proctoring?.termination_reason) {
      proctoringData.termination_reason = proctoring.termination_reason;
    }

    // ── TERMINATED SESSION — minimal save, skip AI entirely ───────────────────
    if (proctoringData.terminated) {
      const questions_answers = answers
        .map((a) => {
          const stored = storedQuestions[a.questionIndex];
          return {
            index: a.questionIndex,
            question: stored?.question || "",
            userAnswer: (a.userAnswer || "(no answer given)").substring(
              0,
              MAX_ANSWER_LENGTH,
            ),
            modelAnswer: stored?.modelAnswer || "",
            keywords: stored?.keywords || [],
            score: 0,
            feedback: "Session terminated due to proctoring violation.",
            improvements: [],
            answer_status: "not_answered",
          };
        })
        .filter((qa) => qa.question);

      let sessionRecord;
      if (req.body.interview_id) {
        sessionRecord = await InterviewSession.findById(req.body.interview_id);
      }
      const finalPayload = validateSessionData({
        user_id: req.user._id,
        job_id: jobId || questionSession.jobId,
        role: role || "Unknown",
        start_time: start,
        end_time: end,
        duration_minutes,
        overall_score: 0,
        technical: 0,
        jd_alignment: 0,
        communication: 0,
        structure: 0,
        questions_answers: questions_answers,
        strengths: [],
        improvements: [
          "Your session was terminated due to proctoring irregularities. Future evaluations will require a stable environment and full adherence to screen-tracking guidelines.",
        ],
        eye_contact_consistency: 0,
        proctoring: proctoringData,
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
    const questions_answers = answers
      .map((a, index) => {
        const stored = storedQuestions[a.questionIndex];
        const uAnswer = a.userAnswer || "";
        return {
          index: a.questionIndex ?? index, // Ensure index is passed for evaluation mapping
          question: stored?.question || "",
          userAnswer: (uAnswer || "(no answer given)").substring(
            0,
            MAX_ANSWER_LENGTH,
          ),
          modelAnswer: stored?.modelAnswer || "",
          keywords: stored?.keywords || [],
          is_empty: isEmptyAnswer(uAnswer),
        };
      })
      .filter((qa) => qa.question); // Remove if stored is missing

    let aiEvaluation = null;

    // ── Only send ANSWERED questions to AI — skip empty ones to save tokens ──
    const answeredQAs = questions_answers.filter((qa) => !qa.is_empty);

    if (isConfigured() && answeredQAs.length > 0) {
      const answersText = JSON.stringify(
        answeredQAs.map((qa) => ({
          index: qa.index,
          question: qa.question,
          ideal_answer: qa.modelAnswer,
          candidate_answer: qa.userAnswer,
        })),
        null,
        2,
      );

      const prompt = buildEvalPrompt(role, answersText);

      try {
        console.log(
          "[Evaluate] Using model:",
          process.env.GEMMA_MODEL || "gemma-3-4b-it",
          "| Answered:",
          answeredQAs.length,
          "/",
          questions_answers.length,
        );
        aiEvaluation = await callGemmaJSON(prompt, null);

        // ── Validate AI response structure ──
        if (aiEvaluation && !aiEvaluation.per_question) {
          console.warn(
            "[Evaluate] AI response missing per_question field, discarding.",
          );
          aiEvaluation = null;
        }
      } catch (err) {
        console.error("[Evaluate] AI eval failed:", err.message);
      }
    }

    // ── Pending Evaluation Check ──────────────────────────────────────────────
    let status = "completed";
    if (!aiEvaluation?.per_question) {
      // If we had answerable questions but AI failed, mark as pending
      if (answeredQAs.length > 0) {
        status = "pending_evaluation";
      }
      aiEvaluation = {
        per_question: answeredQAs.map(() => ({
          semantic_score: 0,
          keyword_score: 0,
          concept_score: 0,
          structure_score: 0,
          length_penalty: 0,
          feedback: "Evaluation pending — AI was unavailable.",
          improvements: [],
          matched_keywords: [],
        })),
      };
    }

    // ── Score assembly ────────────────────────────────────────────────────────
    const answerIndexes = answers.map((a) => a.questionIndex);
    const final_questions = computeQuestionScores(
      questions_answers,
      storedQuestions,
      answerIndexes,
      aiEvaluation,
    );

    const aggregates = computeAggregates(
      final_questions,
      eye_contact_consistency,
      aiEvaluation?.overall_summary,
    );

    const sessionPayload = validateSessionData({
      user_id: req.user._id,
      job_id: jobId || questionSession.jobId,
      role,
      start_time: start,
      end_time: end,
      status,
      duration_minutes,
      overall_score: aggregates.overall_score,
      technical: aggregates.technical,
      jd_alignment: aggregates.jd_alignment,
      communication: aggregates.communication,
      structure: aggregates.structure,
      questions_answers: final_questions,
      strengths: aggregates.strengths,
      improvements: aggregates.improvements,
      eye_contact_consistency,
      proctoring: proctoringData,
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
    console.error("[Evaluate] Unhandled error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/interviews/:id
 */
router.get("/:id", protect, async (req, res) => {
  try {
    const query = { _id: req.params.id };
    if (req.user.role !== "admin") query.user_id = req.user._id;

    const session = await InterviewSession.findOne(query);
    if (!session) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
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
router.post("/:id/retry", protect, async (req, res) => {
  try {
    const session = await InterviewSession.findById(req.params.id);
    if (!session) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    }
    if (
      session.user_id.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }
    if (session.status !== "pending_evaluation") {
      return res
        .status(400)
        .json({ success: false, message: "Session is already evaluated" });
    }

    if (!isConfigured()) {
      return res.status(500).json({
        success: false,
        message: "GEMMA_API_KEY missing, cannot evaluate",
      });
    }

    // Only evaluate non-empty answers
    const answeredQAs = session.questions_answers.filter(
      (qa) => !isEmptyAnswer(qa.userAnswer),
    );

    if (answeredQAs.length === 0) {
      // All answers are empty — just zero everything out
      session.questions_answers = session.questions_answers.map((qa) => ({
        ...(qa.toObject ? qa.toObject() : qa),
        score: 0,
        feedback: "No answer provided. Please attempt the question.",
        improvements: [
          "Provide a substantive answer addressing the core question.",
        ],
        answer_status: "not_answered",
        semantic_score: 0,
        keyword_score: 0,
        concept_score: 0,
        structure_score: 0,
      }));
      session.overall_score = 0;
      session.technical = 0;
      session.jd_alignment = 0;
      session.communication = 0;
      session.structure = 0;
      session.strengths = [];
      session.improvements = [
        "All questions were left unanswered. Please attempt the interview again.",
      ];
      session.status = "completed";
      await session.save();
      return res.json({ success: true, data: session });
    }

    const answersText = JSON.stringify(
      answeredQAs.map((qa) => ({
        index: qa.index,
        question: qa.question,
        ideal_answer: qa.modelAnswer,
        candidate_answer: qa.userAnswer,
      })),
      null,
      2,
    );

    const prompt = buildEvalPrompt(session.role, answersText);

    console.log(
      "[Retry] Using model:",
      process.env.GEMMA_MODEL || "gemma-3-4b-it",
      "| Answered:",
      answeredQAs.length,
      "/",
      session.questions_answers.length,
    );
    let aiEvaluation = await callGemmaJSON(prompt);
    // 🚨 FIX: handle array response from Gemma
    if (Array.isArray(aiEvaluation)) {
      aiEvaluation = {
        per_question: aiEvaluation,
      };
    }

    if (!aiEvaluation || !Array.isArray(aiEvaluation.per_question)) {
      console.error("❌ Invalid AI response:", aiEvaluation);

      aiEvaluation = {
        per_question: answeredQAs.map((qa) => ({
          index: qa.index,
          semantic_score: 0,
          keyword_score: 0,
          concept_score: 0,
          structure_score: 0,
          length_penalty: 0,
          feedback: "AI failed — treated as incorrect answer",
          improvements: ["Provide a clear and relevant answer"],
          matched_keywords: [],
        })),
      };
    }

    let aiIdx = 0;
    const final_questions = session.questions_answers.map((qa, i) => {
      const qaObj = qa.toObject ? qa.toObject() : qa;

      // ── STRICT: Empty answers always get 0 ──
      if (isEmptyAnswer(qaObj.userAnswer)) {
        return {
          ...qaObj,
          score: 0,
          feedback: "No answer provided. Please attempt the question.",
          improvements: [
            "Provide a substantive answer addressing the core question.",
          ],
          answer_status: "not_answered",
          semantic_score: 0,
          keyword_score: 0,
          concept_score: 0,
          structure_score: 0,
        };
      }

      let ev = aiEvaluation?.per_question?.find((e) => e.index === qaObj.index);

      if (!ev) {
        ev = {
          semantic_score: 0,
          keyword_score: 0,
          concept_score: 0,
          structure_score: 0,
          feedback: "Evaluation missing",
          improvements: ["Answer properly"],
          matched_keywords: [],
        };
      }

      const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
      const semScore = clamp01(ev.semantic_score);
      const keyScore = clamp01(ev.keyword_score);
      const conScore = clamp01(ev.concept_score);
      const strScore = clamp01(ev.structure_score);

      // Confidence Markers
      const confidenceMarkers = [
        "i think",
        "maybe",
        "not sure",
        "i guess",
        "probably",
      ];
      const hasConfidencePenalty = confidenceMarkers.some((m) =>
        qaObj.userAnswer.toLowerCase().includes(m),
      );

      let fScore =
        (0.4 * semScore + 0.1 * keyScore + 0.4 * conScore + 0.1 * strScore) *
        100;

      if (hasConfidencePenalty) fScore *= 0.95;
      if (
        qaObj.userAnswer.trim().length < 20 &&
        qaObj.userAnswer.trim().length >= MIN_ANSWER_LENGTH
      )
        fScore *= 0.9;
      if (qaObj.difficulty === "hard") fScore *= 1.1;

      const finalScore = Math.min(
        100,
        Math.max(0, Math.round(fScore * 100) / 100),
      );

      return {
        ...qaObj,
        semantic_score: semScore,
        keyword_score: keyScore,
        concept_score: conScore,
        structure_score: strScore,
        score: finalScore,
        feedback: ev.feedback || "Evaluation completed.",
        improvements: ev.improvements || [],
        answer_status:
          qaObj.userAnswer.trim().length < 50 ? "timeout_partial" : "answered",
      };
    });

    session.questions_answers = final_questions;

    const aggregates = computeAggregates(
      final_questions,
      session.eye_contact_consistency,
      aiEvaluation?.overall_summary,
    );

    session.technical = aggregates.technical;
    session.jd_alignment = aggregates.jd_alignment;
    session.communication = aggregates.communication;
    session.structure = aggregates.structure;
    session.overall_score = aggregates.overall_score;
    session.strengths = aggregates.strengths;
    session.improvements = aggregates.improvements;
    session.status = "completed";

    // Final validation before save
    validateSessionData(session);

    await session.save();

    res.json({ success: true, data: session });
  } catch (err) {
    console.error("[Retry Evaluation] Unhandled error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
