import express from 'express';
import { createRequire } from 'module';
import protect from '../middleware/authMiddleware.js';
import User from '../models/User.js';
import multer from "multer";
import path from "path";
import fs from "fs";
import { callGemmaJSON, isConfigured } from '../services/gemmaService.js';
import pdfParse from "pdf-parse-fixed";
const router = express.Router();

// ── pdf-parse: CJS module — use createRequire for reliable ESM import ──

// ── Skill filtering: reject garbage terms from AI extraction ──
const GARBAGE_SKILLS = new Set([
  'pdf', 'file format', 'compression', 'flatedecode', 'catalog', 'outlines',
  'stream', 'endstream', 'endobj', 'xref', 'trailer', 'startxref', 'obj',
  'font', 'truetype', 'encoding', 'unicode', 'ascii', 'utf-8', 'utf8',
  'page', 'pages', 'document', 'text', 'image', 'table', 'list',
  'name', 'email', 'phone', 'address', 'date', 'year', 'month',
  'resume', 'cv', 'curriculum vitae', 'objective', 'profile', 'summary',
  'references', 'available upon request', 'hobbies', 'interests',
  'male', 'female', 'age', 'nationality', 'religion',
]);

/**
 * Validate that a skill string looks like a real skill.
 * Rejects PDF artifacts, single characters, pure numbers, and garbage.
 */
function isValidSkill(skill) {
  if (!skill || typeof skill !== 'string') return false;
  const s = skill.trim().toLowerCase();
  if (s.length < 2 || s.length > 50) return false;
  if (GARBAGE_SKILLS.has(s)) return false;
  // Reject pure numbers, hex strings, or PDF internals
  if (/^[0-9.\-/\\]+$/.test(s)) return false;
  if (/^[a-f0-9]{8,}$/i.test(s)) return false;
  // Reject strings that look like PDF operators
  if (/^(obj|endobj|stream|endstream|xref|trailer)$/i.test(s)) return false;
  return true;
}

/**
 * Clean and deduplicate extracted skills.
 */
function cleanSkills(rawSkills) {
  if (!Array.isArray(rawSkills)) return [];
  const seen = new Set();
  return rawSkills
    .map(s => String(s).trim().toLowerCase())
    .filter(s => {
      if (!isValidSkill(s)) return false;
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
}


// ======================
// Multer configuration
// ======================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/resumes");
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});


// GET /api/user/me — fetch current user
router.get('/me', protect, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
});


// PUT /api/user/profile — update profile
router.put('/profile', protect, async (req, res) => {
  try {
    const {
      name,
      age,
      gender,
      currentCompany,
      currentRole,
      preferredRole,
      experience,
      location,
      education,
    } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.name = name || user.name;
    user.age = age;
    user.gender = gender;
    user.currentCompany = currentCompany;
    user.currentRole = currentRole;
    user.preferredRole = preferredRole;
    user.experience = experience;
    user.location = location;
    user.education = education;
    user.isProfileComplete = true;

    const updatedUser = await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Profile update failed' });
  }
});


// ======================
// Resume upload route
// ======================

/**
 * Extract plain text from a PDF file using pdf-parse.
 * Returns empty string on failure — never throws.
 */


async function extractTextFromPDF(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);

    const text = data.text || "";
    console.log("TEXT LENGTH:", text.length);

    return text.trim();
  } catch (err) {
    console.error("PDF ERROR:", err);
    return "";
  }
}

/**
 * Extract plain text from a file for AI processing.
 */
async function extractTextFromFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.pdf') {
    return await extractTextFromPDF(filePath);
  }

  // .txt, .doc, .docx — read as utf-8 (best effort)
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('[Resume] Text extraction error:', err.message);
    return '';
  }
}

router.post('/upload-resume', protect, upload.single('resume'), async (req, res) => {
  try {

    const user = await User.findById(req.user._id);

    user.resumeUrl = `/uploads/resumes/${req.file.filename}`;
    user.resumeName = req.file.originalname;

    const filePath = req.file.path;
    let detectedSkills = [];

    try {
      if (isConfigured()) {
        // Extract text from the resume file
        const resumeText = await extractTextFromFile(filePath, req.file.originalname);

        if (resumeText && resumeText.trim().length > 20) {
          const prompt = `You are a resume skill extractor. Extract ONLY explicitly mentioned skills.
DO NOT infer.
DO NOT guess.
Return empty array if unsure.

STRICT RULES:
- Extract ONLY skills that appear verbatim or as clear synonyms in the text.
- Include: programming languages, frameworks, tools, databases, cloud platforms, methodologies, soft skills.
- DO NOT include: file formats (PDF, DOCX), generic words (document, page, text), personal info (name, email, phone).
- Each skill should be 1-4 words maximum.
- Remove duplicates.

You MUST return ONLY a valid JSON array of strings. No markdown, no explanation.
Example: ["python","react","aws","machine learning","sql"]

Resume text:
${resumeText.substring(0, 4000)}

Return the JSON array now:`;

          try {
            const parsed = await callGemmaJSON(prompt, []);

            if (Array.isArray(parsed)) {
              detectedSkills = cleanSkills(parsed);
            }
          } catch (parseErr) {
            console.error("AI skill extraction parse error:", parseErr.message);
          }
        } else {
          console.warn("[Resume] Extracted text too short or empty — skill extraction skipped.");
        }
      } else {
        console.warn("GEMMA_API_KEY is missing — skill extraction skipped.");
      }
    } catch (aiErr) {
      console.error("Resume skill extraction failed:", aiErr.message);
    }

    console.log("========= AI DETECTED SKILLS =========");
    console.log(detectedSkills);

    user.resumeSkills = detectedSkills;

    await user.save();

    res.status(200).json({
      success: true,
      message: detectedSkills.length > 0
        ? "Resume uploaded"
        : "Resume uploaded but skill extraction failed.",
      resumeUrl: user.resumeUrl,
      resumeSkills: user.resumeSkills
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
});


// ======================
// Delete resume route
// ======================

router.delete('/delete-resume', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Delete the physical file if it exists
    if (user.resumeUrl) {
      const filePath = path.join(process.cwd(), user.resumeUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log("Resume file deleted:", filePath);
      }
    }

    // Clear resume fields
    user.resumeUrl = undefined;
    user.resumeName = undefined;
    user.resumeSkills = [];

    await user.save();

    console.log("========= RESUME SKILLS UPDATED =========");
    console.log(user.resumeSkills);

    res.status(200).json({
      success: true,
      message: 'Resume deleted successfully',
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to delete resume' });
  }
});


// ======================
// Update resume skills route
// ======================

router.put('/update-skills', protect, async (req, res) => {
  try {
    const { resumeSkills } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.resumeSkills = Array.isArray(resumeSkills) ? resumeSkills : [];

    await user.save();

    console.log("========= RESUME SKILLS UPDATED =========");
    console.log(user.resumeSkills);

    res.status(200).json({
      success: true,
      message: 'Skills updated successfully',
      resumeSkills: user.resumeSkills,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to update skills' });
  }
});


export default router;