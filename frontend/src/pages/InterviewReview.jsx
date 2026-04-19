import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../utils/api";
import Navbar from "../components/Navbar";

const InterviewReview = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [session, setSession] = useState(location.state?.sessionData || null);
  const [loading, setLoading] = useState(!session);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (!session || session.status !== 'pending_evaluation' || retrying) return;
    setRetrying(true);
    try {
      const res = await api.post(`/interviews/${session._id}/retry`);
      if (res.data.success) {
        setSession(res.data.data);
      }
    } catch (err) {
      console.warn("Auto-evaluation retry failed, will try again...");
    } finally {
      setRetrying(false);
    }
  };

  // Auto-retry polling
  useEffect(() => {
    let timer;
    if (session?.status === 'pending_evaluation' && !retrying) {
      handleRetry();
      timer = setInterval(handleRetry, 10000);
    }
    return () => clearInterval(timer);
  }, [session?.status, retrying]);

  useEffect(() => {
    if (!session) {
      const fetchSession = async () => {
        try {
          const res = await api.get(`/interviews/${sessionId}`);
          setSession(res.data.data);
        } catch (err) {
          setError("Failed to load interview review.");
        } finally {
          setLoading(false);
        }
      };
      fetchSession();
    }
  }, [sessionId, session]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F5FB]">
        <Navbar />
        <div className="flex items-center justify-center p-20">
          <div className="w-12 h-12 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-[#F3F5FB]">
        <Navbar />
        <div className="p-20 text-center text-red-500 font-medium">
          {error || "Session not found."}
          <div className="mt-4">
            <button onClick={() => navigate('/dashboard')} className="px-6 py-2 bg-violet-600 text-white rounded-lg">Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F5FB] font-sans pb-20">
      <Navbar />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Interview Review</h1>
            <p className="text-sm text-gray-500 mt-2">Detailed feedback per question.</p>
          </div>
          <button 
            onClick={() => navigate(session.status === 'pending_evaluation' ? '/dashboard' : `/report/${session._id}`)}
            className="px-6 py-3 bg-[#1e2029] hover:bg-black text-white text-sm font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {session.status === 'pending_evaluation' ? 'Return to Dashboard' : 'View Performance Summary'}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
          </button>
        </div>

        {session.status === 'pending_evaluation' ? (
          <div className="bg-white rounded-[24px] shadow-sm border border-blue-100 p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center mb-6">
              <svg className="w-8 h-8 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v2m0 12v2m8-8h-2M6 12H4m15.364-6.364l-1.414 1.414M7.05 16.95l-1.414 1.414M16.95 16.95l1.414 1.414M7.05 7.05L5.636 5.636"></path></svg>
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">Interview Under Review</h2>
            <p className="text-gray-500 mb-8 max-w-md italic">AI evaluation is in progress. Results will be updated automatically shortly.</p>
          </div>
        ) : (
        <div className="space-y-6">
          {session.questions_answers.map((qa, index) => (
            <div key={index} className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-8 overflow-hidden relative">
              <div className="absolute top-0 left-0 w-2 h-full bg-violet-500"></div>
              
              <div className="flex justify-between items-start mb-6">
                <div className="max-w-[80%]">
                  <span className="text-[#8338ec] text-xs font-bold tracking-[0.2em] uppercase mb-2 block">Question {(index + 1).toString().padStart(2, "0")}</span>
                  <h3 className="text-xl font-bold text-slate-800 leading-snug">{qa.question}</h3>
                </div>
                <div className="text-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <span className="block text-2xl font-black text-slate-800 tabular-nums leading-none tracking-tighter">
                    {session.proctoring?.terminated ? "—" : Math.round(qa.score || 0)}
                    {!session.proctoring?.terminated && <span className="text-sm text-gray-400 font-bold ml-0.5">%</span>}
                  </span>
                  <span className="text-[9px] uppercase font-bold text-gray-400 tracking-widest mt-1 block">Score</span>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    Your Answer
                  </h4>
                  <p className="text-slate-700 text-sm leading-relaxed">{qa.userAnswer || <span className="italic text-gray-400">No answer provided.</span>}</p>
                </div>

                <div className="bg-violet-50/50 rounded-xl p-5 border border-violet-100">
                  <h4 className="text-[10px] font-bold text-violet-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    Feedback & Ideal Answer
                  </h4>
                  <div className="space-y-4">
                    {qa.feedback && (
                      <p className="text-slate-800 text-sm font-medium leading-relaxed">{qa.feedback}</p>
                    )}
                    {qa.modelAnswer && (
                      <div>
                        <span className="text-xs font-semibold text-violet-800 uppercase tracking-wide block mb-1">Ideal Approach:</span>
                        <p className="text-slate-700 text-sm leading-relaxed">{qa.modelAnswer}</p>
                      </div>
                    )}
                  </div>
                </div>

                {qa.keywords && qa.keywords.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Keywords to Practice</h4>
                    <div className="flex flex-wrap gap-2">
                      {qa.keywords.map((kw, i) => (
                        <span key={i} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg border border-gray-200">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
};

export default InterviewReview;
