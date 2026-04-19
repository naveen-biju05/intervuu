import express from 'express';
import { randomBytes } from 'crypto';
import Job from '../models/Job.js';
import QuestionSession from '../models/QuestionSession.js';
import protect from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import { callGemma, callGemmaJSON, isConfigured, logKeyStatus } from '../services/gemmaService.js';

const router = express.Router();

// Map DB schema to Frontend expectations
const mapJobForFrontend = (jobDoc) => {
  const j = jobDoc.toObject ? jobDoc.toObject() : jobDoc;
  return {
    ...j,
    id: j._id.toString(),
    logoUrl: j.logo || j.logoUrl || '',
    tags: j.skills && j.skills.length > 0 ? j.skills : (j.tags || []),
    description: typeof j.description === 'string'
      ? j.description.split('\n').filter(Boolean)
      : (j.description || []),
    summary: j.summary || ''
  };
};

/**
 * GET /api/jobs
 */
router.get('/', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    const formattedJobs = jobs.map(mapJobForFrontend);
    res.json({ success: true, data: formattedJobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/jobs
 */
router.post('/', protect, requireAdmin, async (req, res) => {
  try {
    const newJob = new Job(req.body);
    await newJob.save();
    res.status(201).json({ success: true, data: newJob });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/jobs/:id
 */
router.put('/:id', protect, requireAdmin, async (req, res) => {
  try {
    const updatedJob = await Job.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedJob) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    res.json({ success: true, data: updatedJob });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/jobs/:id
 */
router.delete('/:id', protect, requireAdmin, async (req, res) => {
  try {
    const deletedJob = await Job.findByIdAndDelete(req.params.id);
    if (!deletedJob) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * TEST AI — /api/jobs/test-ai
 */
router.get('/test-ai', async (req, res) => {
  if (!isConfigured()) {
    return res.json({ success: false, message: 'Missing GEMMA_API_KEY' });
  }

  try {
    logKeyStatus('test-ai');
    const text = await callGemma('Say hello in one sentence.');
    return res.json({ success: true, data: { text } });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

/**
 * GET JOB BY ID
 */
router.get('/:id', async (req, res) => {
  try {
    // If not valid Mongo ID format, might throw error. Catch handles it.
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    res.json({ success: true, data: mapJobForFrontend(job) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET QUESTIONS (AI)
 * Stores full questions server-side, returns only question text + sessionToken to client.
 * This keeps modelAnswer/keywords off the wire entirely, eliminating payload bloat.
 */
router.get('/:id/questions', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    logKeyStatus('JOBS ROUTE');
    const level = req.query.level || 'Intermediate';

    let fullQuestions = null; // will hold {id, question, modelAnswer, keywords}[]

    if (isConfigured()) {
      const prompt = `Generate exactly 10 ${level} level interview questions for ${job.title}.
Each question must be categorized into one of: technical, jd, communication, structure.
Assign a difficulty: easy, medium, hard.

You MUST return ONLY a valid JSON array with NO extra text, NO markdown, NO explanation.
Example format:
[{"id":1,"question":"...","modelAnswer":"...","keywords":["..."],"difficulty":"medium","category":"technical"}]

Return the JSON array now:`;

      try {
        console.log('[Questions] Sending to Gemma 3 4B — job:', job.title, 'level:', level);

        const parsed = await callGemmaJSON(prompt, null);

        if (Array.isArray(parsed)) {
          fullQuestions = parsed.slice(0, 10);
        }
      } catch (err) {
        console.log('AI question generation failed:', err.message);
      }
    }

    // Fallback if AI failed or no key
    if (!fullQuestions) {
      console.log('⚠️ FALLBACK TRIGGERED');
      fullQuestions = [
        { id: 1, question: 'Tell me about yourself and your experience.', modelAnswer: 'Structured overview of background, skills, and goals.', keywords: ['background', 'experience', 'skills'], difficulty: 'easy', category: 'communication' },
        { id: 2, question: 'What are your core strengths?', modelAnswer: 'Specific strengths with examples.', keywords: ['strengths', 'skills'], difficulty: 'easy', category: 'communication' },
        { id: 3, question: 'Describe a professional weakness and how you address it.', modelAnswer: 'Honest weakness with mitigation strategy.', keywords: ['weakness', 'growth'], difficulty: 'medium', category: 'communication' },
        { id: 4, question: 'Walk me through a significant project you led.', modelAnswer: 'Situation, task, action, result structure.', keywords: ['project', 'leadership', 'result'], difficulty: 'medium', category: 'structure' },
        { id: 5, question: 'How do you handle working in a team under pressure?', modelAnswer: 'Collaboration and communication examples.', keywords: ['teamwork', 'pressure', 'collaboration'], difficulty: 'medium', category: 'communication' },
        { id: 6, question: 'Describe your biggest professional challenge.', modelAnswer: 'Challenge with specific actions and outcome.', keywords: ['challenge', 'problem-solving'], difficulty: 'hard', category: 'structure' },
        { id: 7, question: 'How do you prioritize tasks and manage deadlines?', modelAnswer: 'Time management techniques and frameworks.', keywords: ['priority', 'deadline', 'organization'], difficulty: 'medium', category: 'structure' },
        { id: 8, question: 'Where do you see yourself in 5 years?', modelAnswer: 'Career goals aligned with the role.', keywords: ['goals', 'growth', 'career'], difficulty: 'easy', category: 'jd' },
        { id: 9, question: 'Why are you interested in this specific role?', modelAnswer: 'Role-specific motivation with company research.', keywords: ['motivation', 'interest', 'role'], difficulty: 'easy', category: 'jd' },
        { id: 10, question: 'Do you have any questions for us?', modelAnswer: 'Thoughtful questions demonstrating preparation.', keywords: ['curiosity', 'preparation'], difficulty: 'easy', category: 'communication' }
      ];
    }

    // Store full questions server-side with a session token (expires in 3h via TTL index)
    const sessionToken = randomBytes(24).toString('hex');
    await QuestionSession.create({
      sessionToken,
      jobId: req.params.id,
      questions: fullQuestions,
    });

    // Return ONLY question text to client — modelAnswer/keywords stay server-side
    const clientQuestions = fullQuestions.map(q => ({ id: q.id, question: q.question }));

    return res.json({
      success: true,
      sessionToken,           // client passes this back on evaluate
      data: clientQuestions,
      mode: isConfigured() ? 'AI' : 'FALLBACK'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;