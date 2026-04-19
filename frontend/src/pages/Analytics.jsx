import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import Navbar from "../components/Navbar";

const Analytics = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [skills, setSkills] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get("/analytics");
      const { summary: _summary, history: _history, skill_trends: _skills } = response.data;
      setSummary(_summary);
      setHistory(_history);
      setPagination({ total: _history.length, pages: Math.ceil(_history.length / 5) });
      setSkills(_skills);
    } catch (err) {
      console.error(err);
      setError("Failed to load analytics data.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const getScoreColor = (score) => {
    if (score >= 85) return "bg-emerald-100 text-emerald-700";
    if (score >= 70) return "bg-amber-100 text-amber-700";
    return "bg-rose-100 text-rose-700";
  };

  if (loading && !summary) {
    return (
      <div className="min-h-screen bg-[#F3F5FB]">
        <Navbar />
        <div className="flex items-center justify-center p-20">
          <div className="w-12 h-12 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F3F5FB]">
        <Navbar />
        <div className="p-20 text-center text-red-500">{error}</div>
      </div>
    );
  }

  const pageHistory = history.slice((page - 1) * 5, page * 5);

  return (
    <div className="min-h-screen bg-[#F3F5FB] font-sans pb-20">
      <Navbar />

      <div className="max-w-6xl mx-auto px-10 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-black text-slate-800">Analytics &amp; History</h1>
          <p className="text-gray-500 text-sm mt-2">An overview of your performance trends and session history.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-gray-400 text-xs font-semibold capitalize mb-2">Readiness Score</h3>
            <div className="text-3xl font-black text-slate-800 mb-4">{Math.round(summary?.readiness_score || 0)}%</div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-violet-600 h-1.5 rounded-full" style={{ width: `${summary?.readiness_score || 0}%` }} />
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <h3 className="text-gray-400 text-xs font-semibold capitalize mb-2">Total Sessions</h3>
            <div className="text-3xl font-black text-slate-800 mb-2">{summary?.total_interviews || 0}</div>
            <div className="flex gap-3 mt-auto">
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                ✓ {summary?.completed_interviews || 0} Completed
              </span>
              {(summary?.terminated_interviews || 0) > 0 && (
                <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded-full">
                  ✕ {summary.terminated_interviews} Terminated
                </span>
              )}
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <h3 className="text-gray-400 text-xs font-semibold capitalize mb-2">Avg. Technical Score</h3>
            <div className="text-3xl font-black text-slate-800 mb-2">
              {(summary?.avg_technical_score || 0).toFixed(1)}<span className="text-lg text-gray-400">/100</span>
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-auto">TECHNICAL PROFICIENCY</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <h3 className="text-gray-400 text-xs font-semibold capitalize mb-2">Practice Hours</h3>
            <div className="text-3xl font-black text-slate-800 mb-2">{(summary?.practice_hours || 0).toFixed(1)}h</div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-auto">TOTAL ACTIVE TIME</p>
          </div>
        </div>

        {/* Interview History Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-10">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-bold text-slate-800">Interview History</h2>
            <p className="text-sm text-gray-500">Review your past performance and full feedback reports</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] text-gray-400 uppercase tracking-widest bg-gray-50/50">
                  <th className="py-4 px-6 font-semibold">DATE</th>
                  <th className="py-4 px-6 font-semibold">ROLE</th>
                  <th className="py-4 px-6 font-semibold">SCORE</th>
                  <th className="py-4 px-6 font-semibold">TECHNICAL</th>
                  <th className="py-4 px-6 font-semibold">COMM.</th>
                  <th className="py-4 px-6 font-semibold">STRUCTURE</th>
                  <th className="py-4 px-6 font-semibold text-right">REPORT</th>
                </tr>
              </thead>
              <tbody>
                {pageHistory.map((session) => {
                  const [datePart, timePart] = formatDate(session.date_raw).split(', ');
                  return (
                    <tr key={session.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="py-5 px-6">
                        <div className="font-semibold text-slate-800 text-sm">{datePart}</div>
                        <div className="text-xs text-gray-400 uppercase mt-0.5">{timePart}</div>
                      </td>
                      <td className="py-5 px-6 text-sm text-slate-700 font-medium">{session.role}</td>
                      {session.pending ? (
                        <td colSpan="4" className="py-5 px-6">
                           <div className="flex items-center gap-3 bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-2 w-full max-w-sm">
                             <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100">
                               <svg className="w-3 h-3 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v2m0 12v2m8-8h-2M6 12H4m15.364-6.364l-1.414 1.414M7.05 16.95l-1.414 1.414M16.95 16.95l1.414 1.414M7.05 7.05L5.636 5.636"></path></svg>
                             </div>
                             <div>
                               <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 block leading-none">Interview Under Review</span>
                               <span className="text-[9px] text-blue-400 font-bold mt-1 block">AI evaluation results will appear shortly...</span>
                             </div>
                           </div>
                        </td>
                      ) : (
                        <>
                          <td className="py-5 px-6">
                            {session.terminated ? (
                              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">—</span>
                            ) : (
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${getScoreColor(parseFloat(session.score))}`}>
                                {session.score}%
                              </span>
                            )}
                          </td>
                          <td className="py-5 px-6 text-sm text-gray-600">{session.terminated ? '—' : `${session.technical}/100`}</td>
                          <td className="py-5 px-6 text-sm text-gray-600">{session.terminated ? '—' : `${session.communication}/100`}</td>
                          <td className="py-5 px-6 text-sm text-gray-600">{session.terminated ? '—' : `${session.structure}/100`}</td>
                        </>
                      )}
                      <td className="py-5 px-6 text-right">
                        <button
                          onClick={() => navigate(session.report_link)}
                          className="font-bold text-sm hover:underline"
                          style={{ color: '#8338ec' }}
                        >
                          View Report
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {history.length === 0 && (
                  <tr>
                    <td colSpan="7" className="py-10 text-center text-gray-400 text-sm">No interviews completed yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pagination.total > 0 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/30">
              <span className="text-xs text-gray-500 font-medium ml-2">
                Showing {Math.min(page * 5, history.length)} of {pagination.total} entries
              </span>
              <div className="flex gap-2 mr-2">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  &lsaquo;
                </button>
                <button onClick={() => setPage(Math.min(pagination.pages, page + 1))} disabled={page === pagination.pages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  &rsaquo;
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Skill Trends */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="mb-8">
            <h2 className="text-lg font-bold text-slate-800">Skill Trends</h2>
            <p className="text-sm text-gray-500">Aggregated performance across core skill domains (completed sessions only)</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-10">
            {skills && [
              { label: "Technical Skill Proficiency", score: skills.technical, color: "bg-blue-600", text: "text-blue-600" },
              { label: "JD Alignment (Role Relevance)", score: skills.jd_alignment, color: "bg-indigo-500", text: "text-indigo-500" },
              { label: "Communication (Tone & Clarity)", score: skills.communication, color: "bg-emerald-500", text: "text-emerald-500" },
              { label: "Structure (Logic & Flow)", score: skills.structure, color: "bg-amber-500", text: "text-amber-500" },
            ].map((skill, idx) => (
              <div key={idx} className="flex flex-col">
                <div className="flex justify-between items-end mb-3">
                  <span className="text-sm font-semibold text-slate-700">{skill.label}</span>
                  <span className={`text-sm font-black ${skill.text}`}>{Math.round(skill.score)} <span className="text-[10px] text-gray-400 font-bold uppercase ml-0.5">/ 100</span></span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className={`${skill.color} h-2 rounded-full transition-all duration-1000 ease-out`} style={{ width: `${skill.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Analytics;
