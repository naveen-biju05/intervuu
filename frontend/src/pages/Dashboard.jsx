import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser, clearAuth } from '../utils/auth';
import { useState } from 'react';
import useJobs from '../hooks/useJobs';
import Navbar from '../components/Navbar';
import CompanyLogo from '../components/CompanyLogo';

const TagBadge = ({ label }) => (
  <span className="px-3 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-500 bg-gray-50">
    {label}
  </span>
);

const JobCard = ({ job, onSelect }) => {
  return (
    <div className="bg-white rounded-2xl p-6 flex flex-col shadow-[0_2px_10px_rgba(0,0,0,0.04)] hover:shadow-lg transition-all border border-gray-100">
      <div className="w-14 h-14 mb-4 rounded-full flex items-center justify-center bg-white shadow-sm border border-gray-50 overflow-hidden">
        <CompanyLogo logoUrl={job.logoUrl} companyName={job.company} className="w-10 h-10 object-contain" fallbackClass="w-full h-full text-2xl rounded-full" />
      </div>
      <h3 className="font-bold text-gray-900 text-lg leading-tight">{job.title}</h3>
      <p className="text-gray-400 text-sm mt-1">{job.company}</p>
      
      <div className="flex flex-wrap gap-2 mt-6 mb-6">
        {job.tags.slice(0, 3).map((tag) => (
          <TagBadge key={tag} label={tag} />
        ))}
      </div>

      <button
        onClick={() => onSelect(job)}
        className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-medium transition-all hover:bg-violet-700 bg-[#8338ec]"
      >
        View Job Description <span className="text-lg leading-none">&rsaquo;</span>
      </button>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const user = getUser();
  const initial = user?.name?.[0]?.toUpperCase() || '?';

  const [loading, setLoading] = useState(false);
  const { jobs, loading: jobsLoading, error: jobsError } = useJobs();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  // ✅ NEW FUNCTION (main logic)
  const handleJobSelect = (job) => {
    setLoading(true);
    try {
      localStorage.setItem('selectedJob', JSON.stringify(job));
      navigate(`/job/${job.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#ECEDF1' }}>
      <Navbar />

      <div className="max-w-6xl mx-auto px-10 py-14">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900">Interview Practice</h1>
          <p className="text-gray-400 text-base mt-2">
            Select a role to start your AI-powered mock interview.
          </p>
        </div>

        {(loading || jobsLoading) && <p className="text-purple-600 mb-4">Loading jobs…</p>}
        {jobsError && <p className="text-red-500 mb-4">Error loading jobs: {jobsError}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onSelect={handleJobSelect} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;