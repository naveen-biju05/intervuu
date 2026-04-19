import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser, getToken } from '../utils/auth';
import Navbar from '../components/Navbar';
import CompanyLogo from '../components/CompanyLogo';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const user = getUser();
  const initial = user?.name?.[0]?.toUpperCase() || 'A';

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [jobToDelete, setJobToDelete] = useState(null);

  useEffect(() => {
    let timer;
    if (feedback?.type === 'success') {
      timer = setTimeout(() => {
        setFeedback(null);
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [feedback]);

  // Form State
  const [formData, setFormData] = useState({
    company: '',
    logo: '',
    title: '',
    location: '',
    experience: '',
    summary: '',
    description: '',
    skillInput: '',
    skills: [],
    job_type: ''
  });

  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs`);
      const data = await res.json();
      if (data.success) {
        setJobs(data.data);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddSkill = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = formData.skillInput.trim();
      if (val && !formData.skills.includes(val)) {
        setFormData((prev) => ({
          ...prev,
          skills: [...prev.skills, val],
          skillInput: ''
        }));
      }
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skillToRemove)
    }));
  };

  const handleAddJob = async () => {
    setFeedback(null);
    if (!formData.title || !formData.company || !formData.description) {
      setFeedback({ type: 'error', message: 'Company name, Job title, and Job description are required.' });
      return;
    }

    setLoading(true);
    try {
      // payload matches our backend Mongoose Job model explicitly
      const payload = {
        title: formData.title,
        company: formData.company,
        logo: formData.logo,
        location: formData.location,
        experience: formData.experience,
        summary: formData.summary,
        description: formData.description,
        skills: formData.skills,
        required_skills: formData.skills,
        job_type: formData.job_type
      };

      const isEditing = !!editingJobId;
      const url = isEditing ? `${API_BASE}/api/jobs/${editingJobId}` : `${API_BASE}/api/jobs`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setFormData({
          company: '',
          logo: '',
          title: '',
          location: '',
          experience: '',
          summary: '',
          description: '',
          skillInput: '',
          skills: [],
          job_type: ''
        });
        setEditingJobId(null);
        fetchJobs(); // refresh the list
        setFeedback({ type: 'success', message: `Job ${isEditing ? 'updated' : 'added'} successfully.` });
      } else {
        setFeedback({ type: 'error', message: `Failed to ${isEditing ? 'update' : 'add'} job: ` + data.message });
      }
    } catch (err) {
      console.error('Error adding job:', err);
      setFeedback({ type: 'error', message: 'Error adding job' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteJob = (id) => {
    setFeedback(null);
    setJobToDelete(id);
  };

  const confirmDeleteJob = async () => {
    if (!jobToDelete) return;
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${jobToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });
      const data = await res.json();
      if (data.success) {
        fetchJobs();
        setFeedback({ type: 'success', message: 'Job deleted successfully.' });
      } else {
        setFeedback({ type: 'error', message: 'Failed to delete job: ' + data.message });
      }
    } catch (err) {
      console.error('Error deleting job:', err);
      setFeedback({ type: 'error', message: 'Error deleting job' });
    } finally {
      setJobToDelete(null);
    }
  };

  const handleEditJob = (job) => {
    setEditingJobId(job.id);
    setFormData({
      company: job.company || '',
      logo: job.logoUrl || '',
      title: job.title || '',
      location: job.location || '',
      experience: job.experience || '',
      summary: job.summary || '',
      description: Array.isArray(job.description) ? job.description.join('\n') : (job.description || ''),
      skillInput: '',
      skills: job.tags || [],
      job_type: job.job_type || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Preview Job logic
  const mockPreviewJob = {
    ...formData,
    tags: formData.skills,
    logoUrl: formData.logo || (formData.company ? `https://ui-avatars.com/api/?name=${formData.company}&background=random` : '')
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#ECEDF1' }}>
      <Navbar />

      {/* Toast Notification */}
      {feedback && (
        <div className="fixed top-8 left-0 right-0 z-[100] flex justify-center pointer-events-none">
          <div className={`animate-fade-in-down px-8 py-3 rounded-full flex items-center gap-3 text-sm font-bold shadow-lg border ${feedback.type === 'error' ? 'bg-white text-red-600 border-red-100' : 'bg-[#8338ec] text-white border-transparent'} pointer-events-auto`}>
            {feedback.type === 'error' ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            )}
            {feedback.message}
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-5xl mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-10">

        {/* Main Admin Card */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-8">
          <div className="mb-6 pb-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#f3e8ff]">
              <svg className="w-5 h-5 text-[#8338ec]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{editingJobId ? 'Edit Job Description' : 'Add Job Description'}</h2>
              <p className="text-sm text-gray-500 mt-1">{editingJobId ? 'Update details for this job posting.' : 'Create a new job posting for users to practice interviews.'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Company Name</label>
              <input type="text" name="company" value={formData.company} onChange={handleInputChange} placeholder="e.g. Google" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#8338ec] focus:border-transparent transition-all" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Company Logo URL</label>
              <input type="text" name="logo" value={formData.logo} onChange={handleInputChange} placeholder="https://...logo.png" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#8338ec] focus:border-transparent transition-all" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Job Title</label>
              <input type="text" name="title" value={formData.title} onChange={handleInputChange} placeholder="e.g. Senior Frontend Engineer" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#8338ec] focus:border-transparent transition-all" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Location</label>
              <input type="text" name="location" value={formData.location} onChange={handleInputChange} placeholder="e.g. Bangalore, India" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#8338ec] focus:border-transparent transition-all" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Experience Required</label>
              <input type="text" name="experience" value={formData.experience} onChange={handleInputChange} placeholder="e.g. 3-5 Years" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#8338ec] focus:border-transparent transition-all" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Job Type</label>
              <input type="text" name="job_type" value={formData.job_type} onChange={handleInputChange} placeholder="e.g. Full-time, Remote" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#8338ec] focus:border-transparent transition-all" />
            </div>
          </div>

          <div className="space-y-1 mb-6">
            <label className="text-sm font-semibold text-gray-700">Summary / Short Overview</label>
            <textarea
              name="summary"
              value={formData.summary}
              onChange={handleInputChange}
              placeholder="Brief summary of the role..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#8338ec] focus:border-transparent transition-all text-sm"
              rows="2"
            ></textarea>
          </div>

          <div className="space-y-1 mb-6">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              Job Description
              <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Supports multi-line text</span>
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Detailed responsibilities. Use new lines for bullet points."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#8338ec] focus:border-transparent transition-all text-sm h-32"
            ></textarea>
          </div>

          <div className="space-y-2 mb-8">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              Key Skills
              <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Type and press Enter</span>
            </label>
            <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-xl min-h-[50px] items-center bg-gray-50 focus-within:ring-2 focus-within:ring-[#8338ec] focus-within:border-transparent focus-within:bg-white transition-all">
              {formData.skills.map((skill) => (
                <span key={skill} className="px-3 py-1 flex items-center gap-1.5 bg-white border border-gray-200 shadow-sm text-gray-700 rounded-full text-xs font-semibold">
                  {skill}
                  <button type="button" onClick={() => handleRemoveSkill(skill)} className="text-gray-400 hover:text-red-500 font-bold">&times;</button>
                </span>
              ))}
              <input
                type="text"
                name="skillInput"
                value={formData.skillInput}
                onChange={handleInputChange}
                onKeyDown={handleAddSkill}
                placeholder={formData.skills.length === 0 ? "Add a skill (e.g. React)..." : ""}
                className="flex-1 min-w-[120px] bg-transparent outline-none px-2 text-sm text-gray-700"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
            <button
              onClick={handleAddJob}
              disabled={loading}
              className={`px-8 py-3 rounded-xl text-white font-semibold transition-all shadow-md flex items-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-lg hover:scale-[1.02]'}`}
              style={{ background: 'linear-gradient(135deg, #7B2FF7, #9B4DFF)' }}
            >
              {loading ? (
                <span className="animate-pulse">Saving...</span>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {editingJobId ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    )}
                  </svg>
                  {editingJobId ? 'Update Job' : 'Add Job'}
                </>
              )}
            </button>
            {editingJobId && (
              <button
                onClick={() => {
                  setEditingJobId(null);
                  setFormData({
                    company: '',
                    logo: '',
                    title: '',
                    location: '',
                    experience: '',
                    summary: '',
                    description: '',
                    skillInput: '',
                    skills: [],
                    job_type: ''
                  });
                }}
                className="px-6 py-3 rounded-xl font-semibold transition-all border border-gray-200 text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-6 py-3 rounded-xl font-semibold transition-all border-2 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {showPreview ? 'Hide Preview' : 'Preview Job Card'}
            </button>
          </div>
        </div>

        {/* Live Preview Section */}
        {showPreview && (
          <div className="animate-fade-in-up">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-2 h-6 bg-[#8338ec] rounded-full inline-block"></span>
              Live Preview
            </h3>

            <div className="bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden max-w-4xl mx-auto">
              {/* Similar to JobDescription.jsx banner */}
              <div className="h-48 w-full bg-white flex items-center justify-center p-8 relative overflow-hidden border-b border-gray-50">
                <CompanyLogo
                  logoUrl={mockPreviewJob.logoUrl}
                  companyName={mockPreviewJob.company || 'Company'}
                  className="h-32 max-w-full object-contain drop-shadow-sm"
                  fallbackClass="w-32 h-32 rounded-full text-5xl shadow-sm"
                />
              </div>

              <div className="p-10">
                <p className="text-[#8338ec] text-xs font-bold tracking-widest uppercase mb-1">Position Overview</p>
                <h1 className="text-3xl font-bold text-gray-900 leading-tight">
                  {mockPreviewJob.title || 'Job Title Placeholder'}
                </h1>
                <p className="text-sm text-gray-500 mt-2 flex items-center gap-2 font-medium">
                  <span>At {mockPreviewJob.company || 'Company'}</span>
                  <span className="text-gray-300">|</span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    {mockPreviewJob.location || 'Location Placeholder'}
                  </span>
                </p>

                <div className="mt-8">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-[#8338ec]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h2 className="text-lg font-bold text-gray-900">Job Description</h2>
                  </div>
                  
                  {mockPreviewJob.summary && mockPreviewJob.summary.trim() !== "" && (
                    <div className="mb-6">
                      <p className="text-sm text-gray-600 leading-relaxed" style={{ whiteSpace: "pre-line" }}>
                        {mockPreviewJob.summary}
                      </p>
                    </div>
                  )}

                  {mockPreviewJob.description && (
                    <div className="text-sm text-gray-600 leading-relaxed" style={{ whiteSpace: "pre-line" }}>
                      {mockPreviewJob.description}
                    </div>
                  )}
                </div>

                <div className="mt-8">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-bold text-gray-900">Skills</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mockPreviewJob.tags.length > 0 ? mockPreviewJob.tags.map(tag => (
                      <span key={tag} className="px-3 py-1.5 bg-[#f3e8ff] text-[#8338ec] rounded-full text-xs font-semibold">
                        {tag}
                      </span>
                    )) : (
                      <span className="text-xs text-gray-400">No skills added</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Admin Jobs Table */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <h3 className="text-lg font-bold text-gray-900">Manage Job Descriptions</h3>
            <span className="text-sm font-semibold text-[#8338ec] bg-[#f3e8ff] px-3 py-1 rounded-full">{jobs.length} Total</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white text-xs uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="px-8 py-4 font-semibold">Company</th>
                  <th className="px-8 py-4 font-semibold">Job Title</th>
                  <th className="px-8 py-4 font-semibold">Location</th>
                  <th className="px-8 py-4 font-semibold">Created Date</th>
                  <th className="px-8 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50/80 transition-colors group">
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white border border-gray-100 shadow-sm p-1 overflow-hidden">
                          <CompanyLogo
                            logoUrl={job.logoUrl}
                            companyName={job.company}
                            className="max-w-full max-h-full object-contain"
                            fallbackClass="w-full h-full text-lg rounded-lg"
                          />
                        </div>
                        <span className="font-semibold text-gray-900">{job.company}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-sm font-medium text-gray-700">{job.title}</td>
                    <td className="px-8 py-4 text-sm text-gray-500">{job.location || '—'}</td>
                    <td className="px-8 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-8 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditJob(job)}
                          className="p-2 text-gray-400 hover:text-blue-600 bg-white hover:bg-blue-50 border border-transparent hover:border-blue-100 rounded-lg transition-all" title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          className="p-2 text-gray-400 hover:text-red-600 bg-white hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg transition-all" title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-8 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        <p className="text-base font-medium text-gray-600">No jobs found</p>
                        <p className="text-sm mt-1">Add a job posting above to get started.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Delete Confirmation Modal */}
      {jobToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in-up" onClick={() => setJobToDelete(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 w-full max-w-sm transform transition-all" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-5 mx-auto">
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">Delete Job</h3>
            <p className="text-sm text-center text-gray-500 mb-8 font-medium">Are you sure you want to delete this job?</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setJobToDelete(null)}
                className="flex-1 px-4 py-3 rounded-xl font-semibold border-2 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteJob}
                className="flex-1 px-4 py-3 rounded-xl text-white font-semibold transition-all shadow-md hover:shadow-lg hover:scale-[1.02] text-sm bg-red-500 hover:bg-red-600 border border-transparent"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Style for fade animation */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.4s ease-out forwards;
        }
        .animate-fade-in-down {
          animation: fadeInDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
    </div>
  );
};

export default AdminDashboard;
