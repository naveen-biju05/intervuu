import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser, clearAuth } from '../utils/auth';

const Dashboard = () => {
  const navigate = useNavigate();
  const user = getUser();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const initial = user?.name?.[0]?.toUpperCase() || '?';

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#0B1A2B' }}
    >
      {/* Navbar */}
      <nav className="bg-white/5 border-b border-white/10 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7B2FF7, #9B4DFF)' }}
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <span className="font-semibold text-white text-base tracking-tight">Intervuu</span>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #7B2FF7, #9B4DFF)' }}
          >
            {initial}
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-lg">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #7B2FF7, #9B4DFF)' }}
          >
            <span className="text-white text-3xl font-bold">{initial}</span>
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome back, {user?.name?.split(' ')[0]}! 🎉
          </h1>
          <p className="text-white/50 text-sm mb-8">{user?.email}</p>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left mb-6">
            <p className="text-white/70 text-sm leading-relaxed">
              You're successfully authenticated with <strong className="text-white">Intervuu</strong> — your AI-powered interview coach. Your dashboard is ready. Start practicing interviews, review feedback, and track your progress.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {['Practice Interview', 'Review Feedback', 'Track Progress'].map((item) => (
              <div
                key={item}
                className="bg-white/5 border border-white/10 rounded-xl p-4 text-center cursor-pointer hover:bg-white/10 transition-all"
              >
                <p className="text-white text-xs font-medium">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
