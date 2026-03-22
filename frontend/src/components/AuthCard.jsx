import React from 'react';

const IntervuuLogo = () => (
  <div className="flex items-center gap-2">
    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #7B2FF7, #9B4DFF)' }}>
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    </div>
    <span className="font-semibold text-gray-800 text-base tracking-tight">Intervuu</span>
  </div>
);

const AuthCard = ({ children, pageTitle }) => {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#F6F6F8' }}
    >
      {/* Top nav bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center">
        <IntervuuLogo />
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-8 py-8">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthCard;
