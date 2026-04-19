import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import useJob from "../hooks/useJob";
import { getUser } from "../utils/auth";
import CompanyLogo from "../components/CompanyLogo";
import Navbar from "../components/Navbar";
import api from "../utils/api";

const JobDescription = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { job, loading: jobLoading, error: jobError } = useJob(jobId);
  const user = getUser();

  const [extractedSkills, setExtractedSkills] = useState(null);

  useEffect(() => {
    const fetchUserSkills = async () => {
      try {
        const { data } = await api.get('/user/me');
        if (data.user && data.user.resumeUrl) {
          setExtractedSkills(data.user.resumeSkills || []);
        } else {
          setExtractedSkills(null);
        }
      } catch (err) {
        console.error("Failed to fetch user skills", err);
        setExtractedSkills(null);
      }
    };
    fetchUserSkills();
  }, []);

  const missingSkills = useMemo(() => {
    if (!job || !extractedSkills) return [];
    const extractedLower = new Set(extractedSkills.map((s) => s.toLowerCase()));
    return job.tags.filter((tag) => !extractedLower.has(tag.toLowerCase()));
  }, [job, extractedSkills]);

  if (jobLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <p className="text-gray-500">Loading job details…</p>
      </div>
    );
  }

  if (jobError || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <div className="text-center">
          <p className="text-red-600">Job not found.</p>
          <p className="text-gray-500">{jobError || 'Check the API connection.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <Navbar />

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
          <button onClick={() => navigate('/dashboard')} className="hover:text-gray-900 transition-colors">Dashboard</button>
          <span className="mx-1">/</span>
          <span className="text-gray-900">Job Description Preview</span>
        </div>

        <div className="bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden">

          {/* Banner */}
          <div className="h-48 w-full bg-white flex items-center justify-center p-8 relative overflow-hidden border-b border-gray-50">
            <CompanyLogo
              logoUrl={job.logoUrl}
              companyName={job.company}
              className="h-32 max-w-full object-contain hover:scale-105 transition-transform duration-500 ease-out drop-shadow-sm"
              fallbackClass="w-32 h-32 rounded-full text-5xl shadow-sm"
            />
          </div>

          <div className="p-10">
            {/* Header tags */}
            <p className="text-[#8338ec] text-xs font-bold tracking-widest uppercase mb-1">
              Position Overview
            </p>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">
              {job.title}
            </h1>
            <p className="text-sm text-gray-500 mt-2 flex items-center gap-2 font-medium">
              <span className="flex items-center gap-1">
                At {job.company}
              </span>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                Bangalore, India
              </span>
            </p>

            {/* Job Description */}
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-[#8338ec]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h2 className="text-lg font-bold text-gray-900">Job Description</h2>
              </div>

              {job.summary && job.summary.trim() !== "" && (
                <div className="mb-6">
                  <p className="text-sm text-gray-600 leading-relaxed" style={{ whiteSpace: "pre-line" }}>
                    {job.summary}
                  </p>
                </div>
              )}

              <div className="text-sm text-gray-600 leading-relaxed" style={{ whiteSpace: "pre-line" }}>
                {Array.isArray(job.description) ? job.description.join('\n') : job.description}
              </div>
            </div>

            {/* Skills Section — only shown if admin defined key skills */}
            {job.tags && job.tags.length > 0 && (
              <>
                {/* Key Skills */}
                <div className="mt-8">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-5 h-5 text-[#8338ec]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <h2 className="text-lg font-bold text-gray-900">Key Skills</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {job.tags.map(tag => (
                      <span key={tag} className="px-3 py-1.5 bg-[#f3e8ff] text-[#8338ec] rounded-full text-xs font-semibold">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Missing Skills — only if user has resume skills for comparison */}
                {extractedSkills !== null && (
                  <div className="mt-8">
                    <div className="flex items-center gap-2 mb-4">
                      <svg className="w-5 h-5 text-[#8338ec]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h2 className="text-lg font-bold text-gray-900">Missing Skills</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {missingSkills.length > 0 ? (
                        missingSkills.map(skill => (
                          <span key={skill} className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-full text-xs font-semibold capitalize">
                            {skill}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 font-medium">You have all the required skills!</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Footer Buttons */}
            <div className="mt-10 pt-6 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => navigate('/dashboard')}
                className="text-gray-600 text-sm font-semibold flex items-center gap-2 hover:text-gray-900 transition-colors"
              >
                <span>&larr;</span> Back to Dashboard
              </button>
              <button
                onClick={() => {
                  localStorage.setItem("jobMissingSkills", JSON.stringify(missingSkills));
                  navigate(`/interview/${job.id}`);
                }}
                className="bg-[#8338ec] hover:bg-violet-700 text-white px-8 py-3 rounded-lg text-sm font-semibold transition-colors shadow-md hover:shadow-lg flex items-center gap-2"
              >
                Start Interview <span>&rarr;</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default JobDescription;
