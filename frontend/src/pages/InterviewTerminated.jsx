import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import CompanyLogo from "../components/CompanyLogo";

const InterviewTerminated = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId, reason } = location.state || {};

  // Clear session storage just in case
  useEffect(() => {
    localStorage.removeItem("selectedJob");
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-rose-50 flex items-center justify-center shadow-inner">
            <svg
              className="w-12 h-12 text-rose-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          
          <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Session Ended</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-8 border border-gray-100 bg-gray-50 p-4 rounded-xl">
            {reason ? (
              <>Your interview was terminated due to: <span className="font-bold text-rose-600 capitalize">{reason}</span>. This event has been logged for review.</>
            ) : (
              "Your interview was terminated by the proctoring engine due to detecting severe irregularities or external devices during the session."
            )}
          </p>
          
          <div className="space-y-4">
            {sessionId && (
              <button
                onClick={() => navigate(`/report/${sessionId}`)}
                className="w-full py-4 rounded-xl bg-violet-600 text-white font-bold shadow-lg shadow-violet-200 hover:bg-violet-700 transition-all focus:ring-4 focus:ring-violet-100 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                View Performance Summary
              </button>
            )}

            <button
              onClick={() => navigate("/dashboard")}
              className={`w-full py-4 rounded-xl font-bold transition-all ${sessionId ? 'border-2 border-gray-200 text-gray-500 hover:bg-gray-50' : 'bg-violet-600 text-white shadow-lg shadow-violet-200 hover:bg-violet-700'}`}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default InterviewTerminated;
