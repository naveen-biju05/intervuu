import React, { useState } from 'react';

const CompanyLogo = ({ logoUrl, companyName, className, fallbackClass }) => {
  const [hasError, setHasError] = useState(false);
  const initial = companyName ? companyName.charAt(0).toUpperCase() : '?';

  const isValidUrl = logoUrl && typeof logoUrl === 'string' && logoUrl.trim() !== '';

  const handleError = () => {
    setHasError(true);
  };

  if (!isValidUrl || hasError) {
    return (
      <div className={`flex items-center justify-center bg-[#8338ec] text-white font-bold uppercase ${fallbackClass}`}>
        {initial}
      </div>
    );
  }

  // Handle local vs relative URLs smoothly
  const formattedUrl = (logoUrl && !logoUrl.startsWith('http') && !logoUrl.startsWith('/') && !logoUrl.includes(':\\')) 
    ? '/' + logoUrl 
    : logoUrl;

  return (
    <img
      src={formattedUrl}
      alt={`${companyName} logo`}
      className={className}
      onError={handleError}
    />
  );
};

export default CompanyLogo;
