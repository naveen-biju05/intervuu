import express from "express";
import { randomBytes } from "crypto";
import Job from "../models/Job.js";
import QuestionSession from "../models/QuestionSession.js";
import protect from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";
import {
  callGemma,
  callGemmaJSON,
  isConfigured,
  logKeyStatus,
} from "../services/gemmaService.js";

const router = express.Router();

// Map DB schema to Frontend expectations
const mapJobForFrontend = (jobDoc) => {
  const j = jobDoc.toObject ? jobDoc.toObject() : jobDoc;
  return {
    ...j,
    id: j._id.toString(),
    logoUrl: j.logo || j.logoUrl || "",
    tags: j.skills && j.skills.length > 0 ? j.skills : j.tags || [],
    description:
      typeof j.description === "string"
        ? j.description.split("\n").filter(Boolean)
        : j.description || [],
    summary: j.summary || "",
  };
};

/**
 * GET /api/jobs
 */
router.get("/", async (req, res) => {
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
router.post("/", protect, requireAdmin, async (req, res) => {
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
router.put("/:id", protect, requireAdmin, async (req, res) => {
  try {
    const updatedJob = await Job.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updatedJob) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    res.json({ success: true, data: updatedJob });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/jobs/:id
 */
router.delete("/:id", protect, requireAdmin, async (req, res) => {
  try {
    const deletedJob = await Job.findByIdAndDelete(req.params.id);
    if (!deletedJob) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    res.json({ success: true, message: "Job deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * TEST AI — /api/jobs/test-ai
 */
router.get("/test-ai", async (req, res) => {
  if (!isConfigured()) {
    return res.json({ success: false, message: "Missing GEMMA_API_KEY" });
  }

  try {
    logKeyStatus("test-ai");
    const text = await callGemma("Say hello in one sentence.");
    return res.json({ success: true, data: { text } });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

/**
 * GET JOB BY ID
 */
router.get("/:id", async (req, res) => {
  try {
    // If not valid Mongo ID format, might throw error. Catch handles it.
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
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
router.get("/:id/questions", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    logKeyStatus("JOBS ROUTE");
    const level = req.query.level || "Intermediate";

    // Map frontend levels to backend enum: Beginner->easy, Intermediate->medium, Expert/Advanced->hard
    const difficultyMap = {
      Beginner: "easy",
      Intermediate: "medium",
      Expert: "hard",
      Advanced: "hard",
    };
    const dbDifficulty = difficultyMap[level] || "medium";
    const nonce = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    let fullQuestions = null; // will hold {id, question, modelAnswer, keywords}[]

    if (isConfigured()) {
      const prompt = `
Generate EXACTLY 10 interview questions for the role "${job.title}".

Difficulty: ${level}
Difficulty value in JSON: "${dbDifficulty}"

Randomization seed: ${nonce}

Requirements:
- Every question must be unique.
- Every question must be relevant to ${job.title}.
- Avoid generic interview questions.
- Use a mix of:
  - technical
  - jd
  - communication
  - structure
- modelAnswer should be 2-3 sentences.
- keywords must contain exactly 4 important concepts.
- difficulty must always be "${dbDifficulty}".
- category must be one of:
  technical
  jd
  communication
  structure

Return ONLY a valid JSON array.

Do NOT explain.
Do NOT think step-by-step.
Do NOT verify your answer.
Do NOT use markdown.
Do NOT write \`\`\`json.
Do NOT include comments.
Do NOT include placeholders such as "...".
Do NOT include any text before or after the JSON.

The first character of your response MUST be [
The last character of your response MUST be ]

Schema:

[
  {
    "id": 1,
    "question": "",
    "modelAnswer": "",
    "keywords": ["", "", "", ""],
    "difficulty": "${dbDifficulty}",
    "category": "technical"
  }
]
`;

      try {
        console.log(
          "[Questions] Using model:",
          process.env.GEMMA_MODEL || "gemma-3-4b-it",
          "| Job:",
          job.title,
          "| Level:",
          level,
        );

        const parsed = await callGemmaJSON(prompt, null);

        if (Array.isArray(parsed)) {
          // Double check difficulty enforcement in metadata
          fullQuestions = parsed
            .map((q) => ({
              ...q,
              difficulty: dbDifficulty,
            }))
            .slice(0, 10);
        }
      } catch (err) {
        console.log("AI question generation failed:", err.message);
      }
    }

    // Fallback if AI failed or no key
    if (!fullQuestions) {
      console.log("⚠️ FALLBACK TRIGGERED");
      fullQuestions = [
        {
          id: 1,
          question: `Describe your experience with ${job.title} and relevant projects.`,
          modelAnswer: "Structured overview of background, skills, and goals.",
          keywords: ["background", "experience", "skills"],
          difficulty: dbDifficulty,
          category: "communication",
        },
        {
          id: 2,
          question: `What are the most challenging aspects of ${job.title} in your opinion?`,
          modelAnswer: "Specific challenges with examples.",
          keywords: ["challenges", "skills"],
          difficulty: dbDifficulty,
          category: "technical",
        },
        {
          id: 3,
          question: "Describe a complex technical problem you solved recently.",
          modelAnswer: "Honest weakness with mitigation strategy.",
          keywords: ["problem-solving", "growth"],
          difficulty: dbDifficulty,
          category: "technical",
        },
        {
          id: 4,
          question:
            "Walk me through a significant project where you had to lead a team or initiative.",
          modelAnswer: "Situation, task, action, result structure.",
          keywords: ["project", "leadership", "result"],
          difficulty: dbDifficulty,
          category: "structure",
        },
        {
          id: 5,
          question:
            "How do you stay updated with the latest trends and technologies in this field?",
          modelAnswer: "Collaboration and communication examples.",
          keywords: ["learning", "trends", "collaboration"],
          difficulty: dbDifficulty,
          category: "communication",
        },
        {
          id: 6,
          question:
            "Describe a situation where you had to handle a major professional setback.",
          modelAnswer: "Challenge with specific actions and outcome.",
          keywords: ["setback", "problem-solving"],
          difficulty: dbDifficulty,
          category: "structure",
        },
        {
          id: 7,
          question:
            "How do you manage competing priorities under tight deadlines?",
          modelAnswer: "Time management techniques and frameworks.",
          keywords: ["priority", "deadline", "organization"],
          difficulty: dbDifficulty,
          category: "structure",
        },
        {
          id: 8,
          question: `Where do you see the future of ${job.title} heading in the next 5 years?`,
          modelAnswer: "Career goals aligned with the role.",
          keywords: ["future", "growth", "trends"],
          difficulty: dbDifficulty,
          category: "jd",
        },
        {
          id: 9,
          question:
            "Why do you believe you are the best fit for this specific position?",
          modelAnswer: "Role-specific motivation with company research.",
          keywords: ["motivation", "fit", "role"],
          difficulty: dbDifficulty,
          category: "jd",
        },
        {
          id: 10,
          question:
            "If you could change one thing about how this industry operates, what would it be?",
          modelAnswer: "Thoughtful questions demonstrating preparation.",
          keywords: ["industry", "change", "perspective"],
          difficulty: dbDifficulty,
          category: "communication",
        },
      ];
    }

    // Store full questions server-side with a session token (expires in 3h via TTL index)
    const sessionToken = randomBytes(24).toString("hex");
    await QuestionSession.create({
      sessionToken,
      jobId: req.params.id,
      questions: fullQuestions,
    });

    // Return ONLY question text to client — modelAnswer/keywords stay server-side
    const clientQuestions = fullQuestions.map((q) => ({
      id: q.id,
      question: q.question,
    }));

    return res.json({
      success: true,
      sessionToken, // client passes this back on evaluate
      data: clientQuestions,
      mode: isConfigured() ? "AI" : "FALLBACK",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
