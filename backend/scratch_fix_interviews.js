import fs from 'fs';

let content = fs.readFileSync('routes/interviews.js', 'utf8');

const startRoute = `
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

`;

content = content.replace("router.post('/evaluate', protect, async (req, res) => {", startRoute + "router.post('/evaluate', protect, async (req, res) => {");

content = content.replace("const newSession = new InterviewSession(sessionPayload);\n    await newSession.save();\n\n    // Clean up session cache\n    await QuestionSession.deleteOne({ sessionToken });\n\n    res.status(201).json({ success: true, data: newSession });", `
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
`);

content = content.replace("const terminatedSession = new InterviewSession(validateSessionData({", `
      let sessionRecord;
      if (req.body.interview_id) {
         sessionRecord = await InterviewSession.findById(req.body.interview_id);
      }
      const finalPayload = validateSessionData({
`);
content = content.replace("}));\n      await new InterviewSession(terminatedSession).save();", `});
      
      if (sessionRecord) {
         Object.assign(sessionRecord, finalPayload);
         await sessionRecord.save();
      } else {
         sessionRecord = new InterviewSession(finalPayload);
         await sessionRecord.save();
      }
`);
content = content.replace("return res.status(201).json({ success: true, data: terminatedSession });", "return res.status(201).json({ success: true, data: sessionRecord });");

fs.writeFileSync('routes/interviews.js', content, 'utf8');
