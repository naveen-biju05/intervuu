import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getUser } from '../utils/auth';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const initial = user?.name?.[0]?.toUpperCase() || '?';

  const isActive = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname.startsWith('/job/');
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="bg-white border-b border-gray-100 px-10 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-10">
        <div className="flex items-center gap-2.5 py-4 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7B2FF7, #9B4DFF)' }}
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg">Intervuu</span>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigate('/dashboard')}
            className={`px-4 py-[18px] text-sm transition-colors border-b-2 ${isActive('/dashboard') ? 'font-semibold text-purple-600 border-purple-600' : 'text-gray-400 hover:text-gray-700 border-transparent'}`}
          >
            Dashboard
          </button>
          {user?.role === 'user' && (
            <button 
              onClick={() => navigate('/analytics')}
              className={`px-4 py-[18px] text-sm transition-colors border-b-2 ${isActive('/analytics') ? 'font-semibold text-purple-600 border-purple-600' : 'text-gray-400 hover:text-gray-700 border-transparent'}`}
            >
              Analytics
            </button>
          )}
          {user?.role === 'admin' && (
            <>
              <button 
                onClick={() => navigate('/admin/performance')}
                className={`px-4 py-[18px] text-sm transition-colors border-b-2 flex items-center gap-1.5 ${isActive('/admin/performance') ? 'font-semibold text-purple-600 border-purple-600' : 'text-gray-400 hover:text-gray-700 border-transparent'}`}
              >
                User Performance
              </button>
              <button
                onClick={() => navigate('/admin/jobs')}
                className={`px-4 py-[18px] text-sm transition-colors border-b-2 flex items-center gap-1 ${isActive('/admin/jobs') ? 'font-semibold text-purple-600 border-purple-600' : 'text-gray-400 hover:text-gray-700 border-transparent'}`}
              >
                Job Management
              </button>
            </>
          )}
        </div>
      </div>

      <button
        onClick={() => navigate('/profile')}
        className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm hover:opacity-90 transition-opacity shadow-lg my-1"
        style={{ background: 'linear-gradient(135deg, #7B2FF7, #9B4DFF)' }}
        title="Profile"
      >
        {initial}
      </button>
    </nav>
  );
};

export default Navbar;
