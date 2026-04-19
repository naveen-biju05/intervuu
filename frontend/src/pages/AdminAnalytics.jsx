import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../utils/api";
import Navbar from "../components/Navbar";

const AdminAnalytics = () => {
  const navigate = useNavigate();
  const [usersData, setUsersData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedUsers, setExpandedUsers] = useState({});
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [sortBy, setSortBy] = useState("none"); // "none", "highest", "lowest"

  useEffect(() => {
    // Admin Analytics Dashboard
    // Displays all aggregated metrics from interview sessions formatted as performance
    // User maps out -> /admin/performance directly using exact data mapping format
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      const res = await api.get("/admin/interviews");
      setUsersData(res.data.users);
    } catch (err) {
      console.error(err);
      setError("Failed to load admin performance dashboard. Are you sure you're an admin?");
    } finally {
      setLoading(false);
    }
  };

  const toggleUserExpanded = (userId) => {
    setExpandedUsers(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

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

  if (error) {
    return (
      <div className="min-h-screen bg-[#F3F5FB]">
        <Navbar />
        <div className="p-20 text-center text-red-500">{error}</div>
      </div>
    );
  }

  // Get unique roles for filtering
  const allRoles = Array.from(new Set(
    usersData.flatMap(u => (u.sessions || []).map(s => s.role))
  )).filter(Boolean).sort();

  // Process data for display
  const processedData = usersData.map(userData => {
    // Filter sessions by role if applicable
    const sessions = userData.sessions || [];
    const filteredSessions = roleFilter === "All Roles" 
      ? sessions 
      : sessions.filter(s => s.role === roleFilter);
    
    // Calculate metrics for these filtered sessions
    const validSessions = filteredSessions.filter(s => !s.terminated);
    const terminatedSessionsCount = filteredSessions.filter(s => s.terminated).length;
    const totalValidInterviews = validSessions.length;
    const avgScore = totalValidInterviews > 0 
        ? Math.round(validSessions.reduce((acc, s) => acc + (s.overall_percentage || 0), 0) / totalValidInterviews)
        : null;

    return {
      ...userData,
      displaySessions: filteredSessions,
      displayAvgScore: avgScore,
      displayValidCount: totalValidInterviews,
      displayTerminatedCount: terminatedSessionsCount,
      matchCount: filteredSessions.length,
      totalSessionsCount: sessions.length
    };
  }).filter(u => u.matchCount > 0); // Only show users who have matches

  // Apply sorting
  if (sortBy === "highest") {
    processedData.sort((a, b) => (b.displayAvgScore || 0) - (a.displayAvgScore || 0));
  } else if (sortBy === "lowest") {
    processedData.sort((a, b) => {
      // Move nulls (no valid sessions) to the end or treat as 0 for "lowest" usually means users with scores
      const scoreA = a.displayAvgScore === null ? 101 : a.displayAvgScore;
      const scoreB = b.displayAvgScore === null ? 101 : b.displayAvgScore;
      return scoreA - scoreB;
    });
  }

  return (
    <div className="min-h-screen bg-[#F3F5FB] font-sans pb-20">
      <Navbar />

      <div className="max-w-6xl mx-auto px-10 py-12">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
               <span className="px-2.5 py-1 bg-[#8338ec]/10 text-[#8338ec] rounded uppercase tracking-widest text-[10px] font-bold">Admin Portal</span>
            </div>
            <h1 className="text-3xl font-black text-slate-800">Platform Performance</h1>
            <p className="text-gray-500 text-sm mt-2">Monitor interview scores and trends across all registered users.</p>
          </div>
        </div>

        {/* Filter and Sort Controls */}
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Role Perspective</span>
            <div className="h-4 w-[1px] bg-gray-200" />
            <select 
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer pr-2"
            >
              <option value="All Roles">All Roles</option>
              {allRoles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Performance Ranking</span>
            <div className="h-4 w-[1px] bg-gray-200" />
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer pr-2"
            >
              <option value="none">Overall Standings</option>
              <option value="highest">Highest Score</option>
              <option value="lowest">Lowest Score</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {processedData.map((userData, idx) => {
            const userEmail = userData.user?.email || String(idx);
            const sessions = userData.displaySessions || [];
            const totalInterviews = sessions.length;
            const totalValidInterviews = userData.displayValidCount;
            const terminatedCount = userData.displayTerminatedCount;
            const avgScore = userData.displayAvgScore;

            const isExpanded = expandedUsers[userEmail] || false;

            return (
              <div key={idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Collapsible Header */}
                <div 
                  onClick={() => toggleUserExpanded(userEmail)}
                  className="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-lg">
                      {userData.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{userData.user.name}</h3>
                      <p className="text-sm text-gray-500">{userData.user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="text-center">
                      <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                        {roleFilter === "All Roles" ? "Total" : "Matches"}
                      </div>
                      <div className="text-lg font-black text-slate-800">{totalInterviews}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Completed</div>
                      <div className="text-lg font-black text-emerald-600">{totalValidInterviews}</div>
                    </div>
                    {terminatedCount > 0 && (
                      <div className="text-center">
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Ended Early</div>
                        <div className="text-lg font-black text-rose-500">{terminatedCount}</div>
                      </div>
                    )}
                    <div className="text-center">
                      <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                        {roleFilter === "All Roles" ? "Avg Score" : `${roleFilter} Avg`}
                      </div>
                      <div className="text-lg font-black text-slate-800">{avgScore !== null ? `${avgScore}%` : '—'}</div>
                    </div>
                    <button className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-400 hover:text-violet-600 transition-colors ml-4">
                      {isExpanded ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Session Table */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/30">
                    {sessions.length === 0 ? (
                      <div className="p-6 text-center text-sm text-gray-400">No sessions recorded yet.</div>
                    ) : (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-gray-100 text-[10px] text-gray-400 uppercase tracking-widest bg-gray-100/50">
                            <th className="py-3 px-6 font-semibold">Date</th>
                            <th className="py-3 px-6 font-semibold">Role</th>
                            <th className="py-3 px-6 font-semibold">Overall</th>
                            <th className="py-3 px-6 font-semibold">Technical</th>
                            <th className="py-3 px-6 font-semibold">Communication</th>
                            <th className="py-3 px-6 font-semibold">Structure</th>
                            <th className="py-3 px-6 font-semibold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessions.map((session, sIdx) => (
                            <tr key={sIdx} className="border-b border-gray-50 hover:bg-white transition-colors">
                              <td className="py-4 px-6 text-sm text-slate-700">{formatDate(session.date)}</td>
                              <td className="py-4 px-6 text-sm font-medium text-slate-700">{session.role}</td>
                              <td className="py-4 px-6">
                                {session.terminated ? (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                                    N/A
                                  </span>
                                ) : (
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${session.overall_percentage >= 85 ? 'bg-emerald-100 text-emerald-700' : session.overall_percentage >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {Math.round(session.overall_percentage)}%
                                  </span>
                                )}
                              </td>
                              <td className="py-4 px-6 text-sm text-gray-600">{session.terminated ? "N/A" : `${Math.round(session.technical_score)}/100`}</td>
                              <td className="py-4 px-6 text-sm text-gray-600">{session.terminated ? "N/A" : `${Math.round(session.communication_score)}/100`}</td>
                              <td className="py-4 px-6 text-sm text-gray-600">{session.terminated ? "N/A" : `${Math.round(session.structure_score)}/100`}</td>
                              <td className="py-4 px-6 text-right">
                                <Link
                                  to={`/report/${session.id}`}
                                  className="text-xs font-bold hover:underline inline-block"
                                  style={{ color: '#8338ec' }}
                                >
                                  View Report
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          
          {processedData.length === 0 && (
            <div className="bg-white p-10 rounded-2xl border border-gray-100 text-center text-gray-500">
               No user data found matching the selected criteria.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminAnalytics;
