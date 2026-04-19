import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import { getUser, clearAuth, saveAuth, getToken } from "../utils/auth";
import Navbar from "../components/Navbar";

const Profile = () => {
  const navigate = useNavigate();
  const localUser = getUser();
  const initial = localUser?.name?.[0]?.toUpperCase() || "?";
  const fileInputRef = useRef(null);

  const [profileData, setProfileData] = useState({
    name: localUser?.name || "",
    email: localUser?.email || "",
    age: "",
    gender: "",
    currentCompany: "",
    experience: "",
    preferredRole: "",
    role: "",
    location: "",
    education: "",
  });

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [resume, setResume] = useState(null);
  const [dragging, setDragging] = useState(false);

  // Extracted skills state
  const [resumeSkills, setResumeSkills] = useState([]);
  const [newSkill, setNewSkill] = useState("");
  const [editingSkillIdx, setEditingSkillIdx] = useState(null);
  const [editingSkillValue, setEditingSkillValue] = useState("");
  const [skillsSaving, setSkillsSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data } = await api.get("/user/me");
      const u = data.user;
      setProfileData({
        name: u.name || "",
        email: u.email || "",
        age: u.age || "",
        gender: u.gender || "",
        currentCompany: u.currentCompany || "N/A",
        experience: u.experience || "0",
        currentRole: u.currentRole || "Student",
        preferredRole: u.preferredRole || "",
        location: u.location || "",
        education: u.education || "",
      });
      if (u.resumeUrl) {
        setResume({
          name: u.resumeName,
          url: u.resumeUrl,
        });
      } else {
        setResume(null);
      }
      setResumeSkills(u.resumeSkills || []);
    } catch (err) {
      console.error("Failed to load profile", err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = () => {
    setEditForm({ ...profileData });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/user/profile", {
        name: editForm.name,
        age: editForm.age,
        gender: editForm.gender,
        currentCompany: editForm.currentCompany,
        experience: editForm.experience,
        currentRole: editForm.currentRole,
        preferredRole: editForm.preferredRole,
        location: editForm.location,
        education: editForm.education,
      });
      setProfileData({ ...editForm });
      const token = getToken();
      saveAuth(token, { ...localUser, name: editForm.name });
      setEditing(false);
    } catch (err) {
      console.error("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/login");
  };

  const uploadResume = async (file) => {
    try {
      const formData = new FormData();
      formData.append("resume", file);

      const { data } = await api.post("/user/upload-resume", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log("Resume uploaded successfully");

      // Update resume skills from response
      if (data.resumeSkills) {
        setResumeSkills(data.resumeSkills);
      }
      if (data.resumeUrl) {
        setResume({
          name: file.name,
          url: data.resumeUrl,
        });
      }
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  const handleDeleteResume = async () => {
    try {
      await api.delete("/user/delete-resume");
      setResume(null);
      setUploadedFile(null);
      setResumeSkills([]);
      console.log("Resume deleted successfully");
    } catch (err) {
      console.error("Failed to delete resume", err);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);

    const file = e.dataTransfer.files[0];

    if (file) {
      setUploadedFile(file);
      await uploadResume(file);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];

    if (file) {
      setUploadedFile(file);
      await uploadResume(file);
    }
  };

  // ── Skill editing handlers ──
  const saveSkills = async (updatedSkills) => {
    setSkillsSaving(true);
    try {
      const { data } = await api.put("/user/update-skills", {
        resumeSkills: updatedSkills,
      });
      setResumeSkills(data.resumeSkills || updatedSkills);
    } catch (err) {
      console.error("Failed to update skills", err);
    } finally {
      setSkillsSaving(false);
    }
  };

  const handleAddSkill = async () => {
    const trimmed = newSkill.trim();
    if (!trimmed) return;
    const updated = [...resumeSkills, trimmed.toLowerCase()];
    setResumeSkills(updated);
    setNewSkill("");
    await saveSkills(updated);
  };

  const handleRemoveSkill = async (idx) => {
    const updated = resumeSkills.filter((_, i) => i !== idx);
    setResumeSkills(updated);
    await saveSkills(updated);
  };

  const handleStartEditSkill = (idx) => {
    setEditingSkillIdx(idx);
    setEditingSkillValue(resumeSkills[idx]);
  };

  const handleSaveEditSkill = async () => {
    const trimmed = editingSkillValue.trim();
    if (!trimmed) return;
    const updated = [...resumeSkills];
    updated[editingSkillIdx] = trimmed.toLowerCase();
    setResumeSkills(updated);
    setEditingSkillIdx(null);
    setEditingSkillValue("");
    await saveSkills(updated);
  };

  const handleCancelEditSkill = () => {
    setEditingSkillIdx(null);
    setEditingSkillValue("");
  };

  const detailFields = [
    { label: "AGE", value: profileData.age || "—", key: "age" },
    { label: "GENDER", value: profileData.gender || "—", key: "gender" },
    {
      label: localUser?.role === 'admin' ? "DEPARTMENT" : "CURRENT COMPANY",
      value: (localUser?.role === 'admin' ? profileData.department : profileData.currentCompany) || "N/A",
      key: localUser?.role === 'admin' ? "department" : "currentCompany",
    },
    {
      label: localUser?.role === 'admin' ? "SERVICE YEARS" : "YEARS OF EXPERIENCE",
      value: profileData.experience || "0",
      key: "experience",
    },
    {
      label: "CURRENT ROLE",
      value: profileData.currentRole || (localUser?.role === 'admin' ? 'Admin' : '—'),
      key: "currentRole",
    },
    { 
      label: localUser?.role === 'admin' ? "OFFICE LOCATION" : "PREFERRED ROLE", 
      value: (localUser?.role === 'admin' ? profileData.location : profileData.preferredRole) || "—", 
      key: localUser?.role === 'admin' ? "location" : "preferredRole" 
    },
    { label: "LOCATION", value: profileData.location || "—", key: "location", hide: localUser?.role === 'admin' },
    {
      label: "EDUCATION",
      value: profileData.education || "—",
      key: "education",
    },
  ].filter(f => !f.hide);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#ECEDF1" }}>
      {/* Navbar */}
      <Navbar />

      {/* Page content */}
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-5">
        {/* ── Profile Header Card ── */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            {/* Avatar + name */}
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl flex-shrink-0 shadow-md"
                style={{
                  background: "linear-gradient(135deg, #7B2FF7, #9B4DFF)",
                }}
              >
                {initial}
              </div>
              <div>
                {editing ? (
                  <input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                    className="font-bold text-gray-900 text-xl border-b-2 border-purple-400 outline-none bg-transparent mb-1 w-48"
                  />
                ) : (
                  <h2 className="font-bold text-gray-900 text-xl">
                    {profileData.name}
                  </h2>
                )}
                <p className="text-purple-500 text-sm font-medium">
                  {localUser?.role === 'admin' ? 'Platform Administrator' : (profileData.currentRole || 'Member')}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <svg
                    className="w-3.5 h-3.5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-gray-400 text-xs">
                    {profileData.email}
                  </span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
                    style={{
                      background: "linear-gradient(135deg, #7B2FF7, #9B4DFF)",
                    }}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleEditClick}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Edit Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-red-500 border border-red-100 hover:bg-red-50 transition-all"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {localUser?.role !== 'admin' && (
          <>
            {/* ── Resume Management Card ── */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 text-base mb-1">
                Resume Management
              </h3>
              <p className="text-gray-400 text-sm mb-5">
                Update your professional profile with your latest experience.
              </p>

              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-10 gap-3 transition-all cursor-pointer ${dragging
                  ? "border-purple-400 bg-purple-50"
                  : "border-gray-200 bg-gray-50"
                  }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-purple-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <p className="text-gray-600 text-sm font-medium">
                  Drag and drop your resume
                </p>
                <p className="text-gray-400 text-xs">PDF or DOCX Only (Max 5MB)</p>
                <button
                  className="mt-1 px-6 py-2 rounded-lg text-white text-sm font-semibold"
                  style={{
                    background: "linear-gradient(135deg, #7B2FF7, #9B4DFF)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Browse files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Uploaded file */}
              {(uploadedFile || resume) ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    RESUMES
                  </p>
                  <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: "#E5383B" }}
                      >
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <a
                          href={`http://localhost:5000${resume?.url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-gray-800 hover:underline"
                        >
                          {uploadedFile?.name || resume?.name}
                        </a>
                        <p className="text-xs text-gray-400">
                          {uploadedFile
                            ? `${(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB · Uploaded just now`
                            : "Saved resume"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleDeleteResume}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
                      title="Delete resume"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-gray-400 font-medium">No resume uploaded</p>
                </div>
              )}
            </div>

            {/* ── Extracted Skills Card ── */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-gray-900 text-base">
                  Extracted Skills
                </h3>
                {skillsSaving && (
                  <span className="text-xs text-purple-500 font-medium">Saving...</span>
                )}
              </div>
              <p className="text-gray-400 text-sm mb-5">
                Skills detected from your uploaded resume. You can add, edit, or remove skills.
              </p>

              {/* Skill chips */}
              {resumeSkills.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-5">
                  {resumeSkills.map((skill, idx) => (
                    <div key={idx} className="group relative">
                      {editingSkillIdx === idx ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={editingSkillValue}
                            onChange={(e) => setEditingSkillValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEditSkill();
                              if (e.key === "Escape") handleCancelEditSkill();
                            }}
                            className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold outline-none bg-purple-50 text-purple-700 w-32"
                            autoFocus
                          />
                          <button
                            onClick={handleSaveEditSkill}
                            className="w-6 h-6 flex items-center justify-center text-green-600 hover:bg-green-50 rounded-full transition-all"
                            title="Save"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={handleCancelEditSkill}
                            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full transition-all"
                            title="Cancel"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-semibold capitalize cursor-default">
                          {skill}
                          <button
                            onClick={() => handleStartEditSkill(idx)}
                            className="w-4 h-4 flex items-center justify-center text-green-500 hover:text-purple-600 rounded-full transition-all opacity-0 group-hover:opacity-100"
                            title="Edit skill"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleRemoveSkill(idx)}
                            className="w-4 h-4 flex items-center justify-center text-green-500 hover:text-red-500 rounded-full transition-all opacity-0 group-hover:opacity-100"
                            title="Remove skill"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 font-medium mb-5">
                  No skills extracted yet. Upload a resume or add skills manually.
                </p>
              )}

              {/* Add skill input */}
              <div className="flex items-center gap-2">
                <input
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddSkill();
                  }}
                  placeholder="Add a skill..."
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                />
                <button
                  onClick={handleAddSkill}
                  disabled={!newSkill.trim()}
                  className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-40"
                  style={{
                    background: "linear-gradient(135deg, #7B2FF7, #9B4DFF)",
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Personal Details Card (Visible & Editable by all) ── */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 className="font-bold text-gray-900 text-base">
              {localUser?.role === 'admin' ? 'Administrative Profile' : 'Personal Details'}
            </h3>
          </div>

          {loading ? (
            <p className="text-gray-400 text-sm text-center py-6">
              Loading details...
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-10 gap-y-6">
              {detailFields.map(({ label, value, key }) => (
                <div key={key}>
                  <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    {label}
                  </p>
                  {editing ? (
                    <input
                      value={editForm[key] || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, [key]: e.target.value })
                      }
                      className="text-gray-900 text-sm font-semibold border-b border-purple-200 outline-none bg-transparent w-full pb-0.5 focus:border-purple-500 transition-colors"
                    />
                  ) : (
                    <p className="text-gray-900 text-sm font-semibold">{value}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>        {localUser?.role === 'admin' && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 text-base mb-4">Admin Quick Actions</h3>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: 'Manage Job Listings', desc: 'Add, edit, or remove interview roles', path: '/admin', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                  { label: 'Platform Analytics', desc: 'View all user interview sessions and scores', path: '/admin/performance', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
                ].map(({ label, desc, path, icon }) => (
                  <button
                    key={label}
                    onClick={() => navigate(path)}
                    className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-violet-200 hover:bg-violet-50/40 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-violet-100 group-hover:bg-violet-200 flex items-center justify-center flex-shrink-0 transition-colors">
                      <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-violet-400 ml-auto transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
