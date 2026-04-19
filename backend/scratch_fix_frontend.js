import fs from 'fs';

let content = fs.readFileSync('../frontend/src/pages/Interview.jsx', 'utf8');

// 1. Textarea binding (when typing)
const textareaOriginal = `onChange={(e) => setAnswerText(e.target.value)}`;
const textareaReplacement = `onChange={(e) => {
                  setAnswerText(e.target.value);
                  finalTranscriptRef.current = e.target.value;
                }}`;
content = content.replace(textareaOriginal, textareaReplacement);


// 2. Transcription logic
const transcriptionOriginal = `        recognition.onresult = (event) => {
          lastSpeechTimeRef.current = Date.now(); // Reset silence timer
          restartAttempts = 0; // Reset restart counter on successful result
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            const confidence = result[0].confidence;

            if (result.isFinal) {
              // Only accept final results above confidence threshold
              if (confidence >= MIN_CONFIDENCE || confidence === 0) {
                // confidence=0 means browser doesn't report it — accept anyway
                finalTranscriptRef.current += transcript + ' ';
                console.log(\`[Voice] Final (conf: \${(confidence * 100).toFixed(0)}%): "\${transcript.trim()}"\`);
              } else {
                console.warn(\`[Voice] Rejected low-confidence (\${(confidence * 100).toFixed(0)}%): "\${transcript.trim()}"\`);
              }
            } else {
              interimTranscript += transcript;
            }
          }
          setAnswerText(finalTranscriptRef.current + interimTranscript);
        };`;

const transcriptionReplacement = `        recognition.onresult = (event) => {
          lastSpeechTimeRef.current = Date.now();
          restartAttempts = 0;
          let interimTranscript = "";
          let newlyFinal = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            
            if (result.isFinal) {
               newlyFinal += transcript + ' ';
            } else {
               interimTranscript += transcript;
            }
          }

          if (newlyFinal) {
             finalTranscriptRef.current += newlyFinal;
          }
          
          setLiveTranscript(interimTranscript);
          setAnswerText(finalTranscriptRef.current + interimTranscript);
          console.log("Transcript updated:", finalTranscriptRef.current + interimTranscript);
        };`;
content = content.replace(transcriptionOriginal, transcriptionReplacement);

// 3. Auto-restart delay
const onendOriginal = `            setTimeout(() => {
              if (isRecordingRef.current) {
                try {
                  recognition.start();
                  console.log(\`[Voice] Restarted recognition (attempt \${restartAttempts})\`);
                } catch(e) {
                  console.warn('[Voice] Restart failed:', e.message);
                }
              }
            }, delay);`;

const onendReplacement = `            setTimeout(() => {
              if (isRecordingRef.current) {
                try {
                  recognition.start();
                  console.log(\`[Voice] Restarted recognition (attempt \${restartAttempts})\`);
                } catch(e) {
                  console.warn('[Voice] Restart failed:', e.message);
                }
              }
            }, 300);`;
content = content.replace(onendOriginal, onendReplacement);

// 4. Submit Answer logic
const submitOriginal = `  const handleSubmitAnswer = async () => {
    // Stop any active recording
    stopRecording();
    const finalAnswer = (answerText || '').trim();

    // If no answer provided via voice or typing, send empty string (backend will score 0)
    const response = {
      question:   currentQuestion.question,
      userAnswer: finalAnswer || '',
    };

    if (!finalAnswer) {
      console.log('[Submit] No answer provided for question', currentQuestionIndex + 1);
    }

    const newAllAnswers = [...allAnswers, response];
    setAllAnswers(newAllAnswers);`;

const submitReplacement = `  const handleSubmitAnswer = async () => {
    // Stop any active recording
    stopRecording();
    
    // Read from finalTranscriptRef directly, NOT UI field, as per strict instructions
    const finalAnswer = (finalTranscriptRef.current || '').trim();

    let status = "answered";
    if (!finalAnswer) {
      status = "not_answered";
      console.log('[Submit] No answer provided for question', currentQuestionIndex + 1);
    }

    let savedData = null;
    try {
      console.log("Final answer submitted:", finalAnswer);
      const res = await api.post('/answers/save', {
        interview_id: interviewId,
        question_id: currentQuestionIndex,
        answer_text: finalAnswer,
        answer_status: status
      });
      console.log("Saved to DB:", res.data);
      savedData = res.data;
    } catch (e) {
      console.error("Failed to save answer to DB", e);
      // Wait, should we block if it fails?
      // Strict rule: "ONLY after success move to next question".
      // But if there's a strict network failure, wait we'll alert the user.
      alert("Failed to save answer. Please try again.");
      return; // Do NOT proceed
    }

    const response = {
      question: currentQuestion.question,
      userAnswer: finalAnswer || '',
    };

    const newAllAnswers = [...allAnswers, response];
    setAllAnswers(newAllAnswers);`;

content = content.replace(submitOriginal, submitReplacement);

// 5. Also need to pass interviewId in \`/evaluate\` request instead of sessionToken, or keep sessionToken but add interview_id
const evalPayloadOriginal = `        const res = await api.post('/interviews/evaluate', {
          sessionToken,
          jobId: jobId || job?.id,
          role: job?.title,
          answers: slimAnswers,
          start_time: startTime,
          end_time: new Date(),
          eye_contact_consistency: finalEyeScore,
          proctoring: {`;

const evalPayloadReplacement = `        const res = await api.post('/interviews/evaluate', {
          interview_id: interviewId,
          sessionToken,
          jobId: jobId || job?.id,
          role: job?.title,
          answers: slimAnswers,
          start_time: startTime,
          end_time: new Date(),
          eye_contact_consistency: finalEyeScore,
          proctoring: {`;
content = content.replace(evalPayloadOriginal, evalPayloadReplacement);


fs.writeFileSync('../frontend/src/pages/Interview.jsx', content, 'utf8');
