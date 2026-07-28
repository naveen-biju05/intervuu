import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import api from "../utils/api";
import Navbar from "../components/Navbar";

const InterviewReport = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [session, setSession] = useState(location.state?.sessionData || null);
  const [loading, setLoading] = useState(!session);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
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
      // Try immediately, then every 10 seconds
      handleRetry();
      timer = setInterval(handleRetry, 10000);
    }
    return () => clearInterval(timer);
  }, [session?.status, retrying]);

  const reportRef = useRef();

  // ── Actual PDF generation using jsPDF ──
  const handleDownload = async () => {
    if (!session || downloading) return;
    setDownloading(true);

    try {
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = 20;

      // Helper — add new page if needed
      const checkPage = (needed = 20) => {
        if (y + needed > 270) {
          doc.addPage();
          y = 20;
        }
      };

      // ── Header ──
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 32, 41);
      doc.text("Performance Summary", margin, y);
      y += 10;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 130);
      const d = new Date(session.end_time);
      const dateStr = d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
      doc.text(`Session #${session._id.substring(18).toUpperCase()}  •  ${dateStr}  •  ${session.role}`, margin, y);
      y += 12;

      // ── Divider ──
      doc.setDrawColor(230, 230, 235);
      doc.setLineWidth(0.4);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      // ── Overall Score ──
      const scoreStr = Math.round(session.overall_score).toString();
      let label = "Needs Improvement";
      let labelR = 239, labelG = 68, labelB = 68;
      if (session.overall_score >= 85) {
        label = "Strong Candidate";
        labelR = 139; labelG = 92; labelB = 246;
      } else if (session.overall_score >= 70) {
        label = "Good Potential";
        labelR = 59; labelG = 130; labelB = 246;
      }

      // Score circle background
      doc.setFillColor(245, 243, 255);
      doc.roundedRect(margin, y, contentWidth, 40, 4, 4, "F");

      if (session.proctoring?.terminated) {
        doc.setFillColor(254, 242, 242);
        doc.roundedRect(margin, y, contentWidth, 40, 4, 4, "F");

        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(220, 38, 38);
        doc.text("Session Terminated", margin + 10, y + 16);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(153, 27, 27);
        const reason = session.proctoring?.termination_reason || "Session Terminated due to Proctoring Violations";
        const summaryLines = doc.splitTextToSize(`Reason: ${reason}`, contentWidth - 20);
        doc.text(summaryLines, margin + 10, y + 26);
        y += 50;

        // Scores should be N/A
        checkPage(30);
        const scores = [
          { name: "TECHNICAL", sub: "Skill Proficiency", value: "—", color: [200, 200, 210] },
          { name: "JD ALIGNMENT", sub: "Role Relevance", value: "—", color: [200, 200, 210] },
          { name: "COMMUNICATION", sub: "Tone & Clarity", value: "—", color: [200, 200, 210] },
          { name: "STRUCTURE", sub: "Logic & Flow", value: "—", color: [200, 200, 210] },
        ];

        const cardW = (contentWidth - 12) / 4;
        scores.forEach((s, i) => {
          const cx = margin + i * (cardW + 4);
          doc.setFillColor(250, 250, 252);
          doc.setDrawColor(235, 235, 240);
          doc.roundedRect(cx, y, cardW, 28, 3, 3, "FD");

          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(180, 180, 190);
          doc.text(s.value, cx + cardW / 2 - 2, y + 14);

          doc.setFontSize(6);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(130, 130, 140);
          doc.text(s.name, cx + 4, y + 21);
        });
        y += 38;
      } else {
        // Score text
        doc.setFontSize(36);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 32, 41);
        doc.text(scoreStr, margin + 18, y + 26);

        doc.setFontSize(10);
        doc.setTextColor(140, 140, 150);
        doc.text("/100  OVERALL SCORE", margin + 38, y + 26);

        // Label
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(labelR, labelG, labelB);
        doc.text(label, margin + 90, y + 16);

        // Summary text
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 90);
        let summaryText;
        if (session.overall_score >= 85) {
          summaryText = "You demonstrated strong alignment with expectations showing solid technical reasoning.";
        } else if (session.overall_score >= 70) {
          summaryText = "Good effort! Keep refining your technical foundations and communication flow.";
        } else {
          summaryText = "You'll need more practice. Focus on structure and clear reasoning for your next attempt.";
        }
        const summaryLines = doc.splitTextToSize(summaryText, contentWidth - 95);
        doc.text(summaryLines, margin + 90, y + 24);
        y += 50;

        // ── Score Cards ──
        checkPage(30);
        const scores = [
          { name: "TECHNICAL", sub: "Skill Proficiency", value: Math.round(session.technical), color: [59, 130, 246] },
          { name: "JD ALIGNMENT", sub: "Role Relevance", value: Math.round(session.jd_alignment), color: [139, 92, 246] },
          { name: "COMMUNICATION", sub: "Tone & Clarity", value: Math.round(session.communication), color: [16, 185, 129] },
          { name: "STRUCTURE", sub: "Logic & Flow", value: Math.round(session.structure), color: [245, 158, 11] },
        ];

        const cardW = (contentWidth - 12) / 4;
        scores.forEach((s, i) => {
          const cx = margin + i * (cardW + 4);

          // Card background
          doc.setFillColor(250, 250, 252);
          doc.setDrawColor(235, 235, 240);
          doc.roundedRect(cx, y, cardW, 28, 3, 3, "FD");

          // Score
          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 32, 41);
          doc.text(s.value.toString(), cx + 4, y + 12);

          doc.setFontSize(7);
          doc.setTextColor(160, 160, 170);
          doc.text("/100", cx + 16, y + 12);

          // Label
          doc.setFontSize(6);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(130, 130, 140);
          doc.text(s.name, cx + 4, y + 19);

          // Progress bar
          const barY = y + 23;
          doc.setFillColor(235, 235, 240);
          doc.roundedRect(cx + 4, barY, cardW - 8, 2, 1, 1, "F");
          doc.setFillColor(...s.color);
          doc.roundedRect(cx + 4, barY, (cardW - 8) * (s.value / 100), 2, 1, 1, "F");
        });
        y += 38;
      }

      // ── AI Detailed Feedback ──
      checkPage(30);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 32, 41);
      doc.text("AI Detailed Feedback", margin, y);
      y += 10;

      if (session.proctoring?.terminated) {
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(254, 202, 202);
        doc.roundedRect(margin, y, contentWidth, 38, 3, 3, "FD");

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(185, 28, 28);
        doc.text("Session Proctoring Evaluation", margin + 10, y + 10);

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(153, 27, 27);
        const termMsg = "This interview session was terminated early due to proctoring irregularities. As a result, a complete skill-based feedback report could not be generated. To ensure a valid score in your next attempt, please maintain a stable, distraction-free environment and avoid looking away from the screen, switching browser tabs, having multiple people or voices in frame, or using external devices.";
        const msgLines = doc.splitTextToSize(termMsg, contentWidth - 20);
        doc.text(msgLines, margin + 10, y + 18);
        y += 48;
      } else {
        // Strengths
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(16, 185, 129);
        doc.text("Key Strengths", margin, y);
        y += 7;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 50, 60);

        if (session.strengths?.length) {
          session.strengths.forEach((s) => {
            checkPage(12);
            doc.setFillColor(16, 185, 129);
            doc.circle(margin + 2, y - 1.2, 1.2, "F");
            const lines = doc.splitTextToSize(s, contentWidth - 10);
            doc.text(lines, margin + 7, y);
            y += lines.length * 5 + 3;
          });
        } else {
          doc.setTextColor(160, 160, 170);
          doc.text("No specific strengths recorded.", margin + 7, y);
          y += 8;
        }

        y += 5;

        // Improvements
        checkPage(20);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(245, 158, 11);
        doc.text("Areas for Improvement", margin, y);
        y += 7;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 50, 60);

        if (session.improvements?.length) {
          session.improvements.forEach((imp) => {
            checkPage(12);
            doc.setFillColor(245, 158, 11);
            doc.circle(margin + 2, y - 1.2, 1.2, "F");
            const lines = doc.splitTextToSize(imp, contentWidth - 10);
            doc.text(lines, margin + 7, y);
            y += lines.length * 5 + 3;
          });
        } else {
          doc.setTextColor(160, 160, 170);
          doc.text("No specific areas for improvement recorded.", margin + 7, y);
          y += 8;
        }
      }

      y += 8;

      // ── Question-level breakdown (if available) ──
      if (session.questions_answers?.length) {
        checkPage(20);
        doc.setDrawColor(230, 230, 235);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;

        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 32, 41);
        doc.text("Question-by-Question Breakdown", margin, y);
        y += 10;

        session.questions_answers.map((qa, idx) => {
          checkPage(60);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(131, 56, 236);
          doc.text(`Question ${(idx + 1).toString()}`, margin, y);
          y += 6;

          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 32, 41);
          const qLines = doc.splitTextToSize(qa.question || "", contentWidth);
          doc.text(qLines, margin, y);
          y += qLines.length * 5 + 4;

          if (qa.score !== undefined && !session.proctoring?.terminated) {
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(131, 56, 236);
            doc.text(`Score: ${Math.round(qa.score)}/100`, margin, y);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(150, 150, 160);
            doc.text(` • Tech: ${Math.round((qa.concept_score || 0) * 100)}  • Rel: ${Math.round((qa.semantic_score || 0) * 100)}`, margin + 30, y);
            y += 6;
          }

          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(100, 100, 110);
          doc.text("Feedback:", margin, y);
          y += 4;
          doc.setFont("helvetica", "normal");
          doc.setTextColor(60, 60, 70);
          const feedbackLines = doc.splitTextToSize(qa.feedback || "No specific feedback available.", contentWidth);
          doc.text(feedbackLines, margin, y);
          y += feedbackLines.length * 4.5 + 4;

          if (qa.matched_keywords?.length || qa.missing_keywords?.length) {
            doc.setFontSize(7);
            doc.setFont("helvetica", "bold");
            if (qa.matched_keywords?.length) {
              doc.setTextColor(16, 185, 129);
              doc.text(`Matched: ${qa.matched_keywords.join(", ")}`, margin, y);
              y += 4;
            }
            if (qa.missing_keywords?.length) {
              doc.setTextColor(245, 158, 11);
              doc.text(`Missing: ${qa.missing_keywords.join(", ")}`, margin, y);
              y += 4;
            }
          }
          y += 4;
          doc.setDrawColor(245, 245, 247);
          doc.line(margin, y, pageWidth - margin, y);
          y += 8;
        });
      }

      // ── Footer ──
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(180, 180, 190);
        doc.text(`Intervuu Performance Report  •  Generated ${new Date().toLocaleDateString()}`, margin, 287);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 20, 287);
      }

      // ── Save the PDF ──
      const filename = `Interview_Report_${session.role?.replace(/\s+/g, "_") || "Report"}_${dateStr.replace(/[\s,]+/g, "_")}.pdf`;
      doc.save(filename);

    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (!session) {
      const fetchSession = async () => {
        try {
          const res = await api.get(`/interviews/${sessionId}`);
          setSession(res.data.data);
        } catch (err) {
          setError("Failed to load interview report.");
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

  const d = new Date(session.end_time);
  const dateStr = d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const scoreStr = Math.round(session.overall_score).toString();
  const jdScore = Math.round(session.jd_alignment);
  const commScore = Math.round(session.communication);
  const structScore = Math.round(session.structure);
  const techScore = Math.round(session.technical);

  let label = "Needs Improvement";
  let ringColor = "#ef4444"; // red
  let tagColor = "bg-rose-50 text-rose-600";

  if (session.proctoring?.terminated) {
    label = "Session Terminated";
    ringColor = "#ef4444";
    tagColor = "bg-rose-50 text-rose-600";
  } else if (session.overall_score >= 85) {
    label = "Strong Candidate";
    ringColor = "#8b5cf6"; // violet
    tagColor = "bg-violet-50 text-violet-600";
  } else if (session.overall_score >= 70) {
    label = "Good Potential";
    ringColor = "#3b82f6"; // blue
    tagColor = "bg-blue-50 text-blue-600";
  }

  return (
    <div className="min-h-screen bg-[#F3F5FB] font-sans pb-20">
      <Navbar />

      <div className="max-w-4xl mx-auto px-6 py-12" ref={reportRef}>
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-10 print:shadow-none print:border-none">

          {/* Header */}
          <div className="flex items-center justify-between mb-8 pb-8 border-b border-gray-100">
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">Performance Summary</h1>
              <p className="text-sm text-gray-500 mt-1.5 flex items-center gap-2">
                <span>Session #{session._id.substring(18).toUpperCase()}</span>
                <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                <span>{dateStr}</span>
                <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                <span className="font-medium text-slate-600">{session.role}</span>
              </p>
            </div>
            <button
              onClick={handleDownload}
              disabled={downloading || session.status === 'pending_evaluation'}
              className={`flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold transition-colors print:hidden ${downloading || session.status === 'pending_evaluation' ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {downloading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-violet-500 animate-spin"></div>
                  Generating...
                </>
              ) : session.status === 'pending_evaluation' ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                  Under Review
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  Download PDF
                </>
              )}
            </button>
          </div>

          {/* AI Banner Score and Text */}
          {session.status === 'pending_evaluation' ? (
            <div className="relative rounded-2xl overflow-hidden mb-8 bg-blue-50 border border-blue-100 p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center shadow-inner">
                <svg className="w-8 h-8 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v2m0 12v2m8-8h-2M6 12H4m15.364-6.364l-1.414 1.414M7.05 16.95l-1.414 1.414M16.95 16.95l1.414 1.414M7.05 7.05L5.636 5.636"></path></svg>
              </div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Evaluation is under process.</h2>
              <p className="text-blue-700 font-medium text-sm max-w-lg mb-2 leading-relaxed">
                Results will be updated shortly.
              </p>
            </div>
          ) : session.proctoring?.terminated ? (
            <div className="relative rounded-2xl overflow-hidden mb-8 bg-rose-50 border border-rose-100 p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center">
                <span className="font-black text-2xl">!</span>
              </div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Session Terminated</h2>
              <p className="text-rose-600 font-medium text-lg">
                Reason: {session.proctoring?.termination_reason || "Session Terminated due to Proctoring Violations"}
              </p>
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden mb-8 shadow-[0_4px_20px_rgba(139,92,246,0.08)] bg-gradient-to-r from-violet-50/50 via-white to-white border border-violet-100 p-8 flex flex-col sm:flex-row items-center gap-8">
              <div className="relative flex-shrink-0 flex items-center justify-center">
                <svg className="w-32 h-32" viewBox="0 0 36 36">
                  <path
                    className="text-gray-100"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                  <path
                    className="transition-all duration-1000 ease-out"
                    strokeDasharray={`${session.overall_score}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-slate-800 tabular-nums tracking-tighter">
                    {session.proctoring?.terminated ? "—" : scoreStr}
                  </span>
                  <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 mt-0.5">OVERALL SCORE</span>
                </div>
              </div>

              <div className="flex-1 text-center sm:text-left">
                <div className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-widest mb-3 ${tagColor}`}>
                  {label}
                </div>
                <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                  {session.overall_score >= 85 ? "You demonstrated strong alignment with expectations showing solid technical reasoning." : session.overall_score >= 70 ? "Good effort! Keep refining your technical foundations and communication flow." : "You'll need more practice. Focus on structure and clear reasoning for your next attempt."}
                </p>
              </div>
            </div>
          )}

          {/* 4 Score Cards (Sub-categories) */}
          {session.status !== 'pending_evaluation' && (
            session.proctoring?.terminated ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              {['TECHNICAL', 'JD ALIGNMENT', 'COMMUNICATION', 'STRUCTURE'].map((label) => (
                <div key={label} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden group opacity-60">
                  <div className="text-lg font-black text-gray-300 mb-4">—</div>
                  <div className="relative z-10 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</div>
                  <div className="w-full bg-gray-50 rounded-full h-1.5 mt-4"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                  </div>
                  <div className="text-lg font-black text-slate-800">{techScore}<span className="text-xs text-gray-400 font-bold">/100</span></div>
                </div>
                <div className="relative z-10 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">TECHNICAL</div>
                <div className="relative z-10 text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-3 max-w-[90%] truncate">SKILL PROFICIENCY</div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 relative z-10">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${techScore}%` }}></div>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className="w-8 h-8 rounded-full bg-violet-50 flex items-center justify-center text-violet-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                  </div>
                  <div className="text-lg font-black text-slate-800">{jdScore}<span className="text-xs text-gray-400 font-bold">/100</span></div>
                </div>
                <div className="relative z-10 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">JD ALIGNMENT</div>
                <div className="relative z-10 text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-3 max-w-[90%] truncate">ROLE RELEVANCE</div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 relative z-10">
                  <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: `${jdScore}%` }}></div>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"></path></svg>
                  </div>
                  <div className="text-lg font-black text-slate-800">{commScore}<span className="text-xs text-gray-400 font-bold">/100</span></div>
                </div>
                <div className="relative z-10 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">COMMUNICATION</div>
                <div className="relative z-10 text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-3 max-w-[90%] truncate">TONE & CLARITY</div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 relative z-10">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${commScore}%` }}></div>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                  </div>
                  <div className="text-lg font-black text-slate-800">{structScore}<span className="text-xs text-gray-400 font-bold">/100</span></div>
                </div>
                <div className="relative z-10 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">STRUCTURE</div>
                <div className="relative z-10 text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-3 max-w-[90%] truncate">LOGIC & FLOW</div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 relative z-10">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${structScore}%` }}></div>
                </div>
              </div>
            </div>
          ))}

          {/* AI Detailed Feedback section */}
          <div className="border border-gray-100 rounded-2xl overflow-hidden mb-10">
            <div className="bg-gray-50/50 px-6 py-4 flex items-center gap-2 border-b border-gray-100">
              <svg className="w-4 h-4 text-[#8338ec]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              <h3 className="font-bold text-slate-800 text-sm">AI Detailed Feedback</h3>
            </div>

            {session.status === 'pending_evaluation' ? (
              <div className="p-10 bg-white flex flex-col items-center">
                <div className="w-full max-w-2xl flex flex-col items-center p-10 bg-gray-50 border border-gray-100 rounded-[20px] text-center">
                  <h4 className="text-slate-800 font-bold text-lg mb-2 underline underline-offset-4 decoration-violet-200">Interview Under Review</h4>
                  <p className="text-gray-500 text-sm italic">AI evaluation is in progress. Results will be updated automatically in a few moments.</p>
                </div>
              </div>
            ) : session.proctoring?.terminated ? (
              <div className="p-10 bg-white flex flex-col items-center">
                <div className="w-full max-w-2xl flex flex-col items-center p-10 bg-rose-50 border border-rose-100 rounded-[20px] text-center shadow-sm">
                  <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 mb-6 shrink-0 shadow-inner">
                    <span className="font-black text-2xl">!</span>
                  </div>
                  <h4 className="text-slate-800 font-black text-xl mb-3 tracking-tight">Session Proctoring Evaluation</h4>
                  <p className="text-rose-700/80 text-sm leading-relaxed max-w-lg font-semibold">
                    This interview session was terminated early due to proctoring irregularities. As a result, a complete skill-based feedback report could not be generated. To ensure a valid score in your next attempt, please maintain a stable, distraction-free environment and avoid looking away from the screen, switching browser tabs, having multiple people or voices in frame, or using external devices.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                <div className="p-8">
                  <div className="flex items-center gap-2 mb-6 text-emerald-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <h4 className="font-bold text-sm uppercase tracking-wider">Key Strengths</h4>
                  </div>
                  
                  <div className="space-y-6">
                    {session.strengths?.map((s, idx) => (
                      <div key={idx} className="flex gap-3">
                        <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 leading-relaxed">{s}</p>
                        </div>
                      </div>
                    ))}
                    {!session.strengths?.length && <p className="text-xs text-gray-400 italic">No specific strengths recorded.</p>}
                  </div>
                </div>

                <div className="p-8">
                  <div className="flex items-center gap-2 mb-6 text-amber-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    <h4 className="font-bold text-sm uppercase tracking-wider">Areas for Improvement</h4>
                  </div>
                  
                  <div className="space-y-6">
                    {session.improvements?.map((i, idx) => (
                      <div key={idx} className="flex gap-3">
                        <div className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-amber-600 font-extrabold text-[10px]">!</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 leading-relaxed">{i}</p>
                        </div>
                      </div>
                    ))}
                    {!session.improvements?.length && <p className="text-xs text-gray-400 italic">No specific areas for improvement recorded.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Question Breakdown UI */}
          {session.status !== 'pending_evaluation' && !session.proctoring?.terminated && session.questions_answers?.length > 0 && (
            <div className="mt-12 pt-12 border-t border-gray-100">
              <div className="flex items-center gap-3 mb-10">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 shadow-sm border border-violet-100/50">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Question Analysis</h3>
                  <p className="text-xs text-gray-500 font-medium">Deep dive into your interview responses</p>
                </div>
              </div>

              <div className="space-y-6">
                {session.questions_answers.map((qa, idx) => (
                  <div key={idx} className="bg-white border border-gray-100 rounded-[20px] p-8 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
                      <div className="flex-1">
                        <span className="text-[10px] font-black text-violet-500 uppercase tracking-[0.2em] mb-3 block">Question {idx + 1}</span>
                        <h4 className="text-slate-800 font-bold leading-relaxed text-lg">{qa.question}</h4>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <div className="text-3xl font-black text-slate-800 tracking-tighter leading-none">
                          {Math.round(qa.score)}<span className="text-xs text-gray-400 ml-1">/100</span>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <span className="px-2 py-1 bg-gray-50 text-[9px] font-bold text-gray-500 rounded-md uppercase tracking-wider border border-gray-100">
                            Tech: {Math.round((qa.concept_score || 0) * 100)}%
                          </span>
                          <span className="px-2 py-1 bg-gray-50 text-[9px] font-bold text-gray-500 rounded-md uppercase tracking-wider border border-gray-100">
                            Rel: {Math.round((qa.semantic_score || 0) * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 pt-8 border-t border-gray-50">
                      <div className="space-y-4">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                          Gap Analysis
                        </p>
                        <div className="text-sm text-slate-700 leading-relaxed font-medium bg-violet-50/20 p-5 rounded-2xl border border-violet-100/30">
                          {qa.feedback}
                        </div>
                      </div>

                      <div className="space-y-6">
                        {(qa.matched_keywords?.length > 0 || qa.missing_keywords?.length > 0) ? (
                          <div className="space-y-5">
                            {qa.matched_keywords?.length > 0 && (
                              <div>
                                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3">Matched Keywords</p>
                                <div className="flex flex-wrap gap-2">
                                  {qa.matched_keywords.map((kw, kidx) => (
                                    <span key={kidx} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-100/50">{kw}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {qa.missing_keywords?.length > 0 && (
                              <div>
                                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3">Missing Points</p>
                                <div className="flex flex-wrap gap-2">
                                  {qa.missing_keywords.map((kw, kidx) => (
                                    <span key={kidx} className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-bold border border-amber-100/50">{kw}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 p-6">
                            <p className="text-[11px] text-gray-400 font-medium italic">Keyword analysis not available</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12 bg-gray-50/50 p-6 rounded-2xl border border-gray-100/50 print:hidden">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full sm:w-auto px-8 py-3.5 border border-gray-200 bg-white hover:bg-gray-50 text-slate-700 text-sm font-bold rounded-xl transition-colors shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
              Back to Dashboard
            </button>
            <button
              onClick={() => navigate(`/interview/${session.job_id}`)}
              className="w-full sm:w-auto px-8 py-3.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-all shadow-[0_4px_15px_rgba(124,58,237,0.3)] hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              Retake Interview
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default InterviewReport;
