import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Fetches AI-generated interview questions for a given job ID.
 * The server now caches full questions (modelAnswer, keywords) and returns
 * only question text + a sessionToken to the client — so no sensitive
 * evaluation data ever travels to the browser.
 *
 * @param {string} jobId
 * @returns {{ questions, sessionToken, loading, error }}
 */
const useInterviewQuestions = (jobId, level) => {
  const [questions, setQuestions]       = useState([]);
  const [sessionToken, setSessionToken] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  useEffect(() => {
    if (!jobId || !level) {
        setLoading(false);
        return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/jobs/${jobId}/questions?level=${level}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setQuestions(json.data || []);
          setSessionToken(json.sessionToken || null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load questions.');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [jobId, level]);

  return { questions, sessionToken, loading, error };
};

export default useInterviewQuestions;
