import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { saveAuth } from '../utils/auth';

const AuthCallback = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    const user = JSON.parse(decodeURIComponent(params.get('user')));

    if (token && user) {
      saveAuth(token, user);
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: '#F6F6F8' }}
    >
      <p>Signing you in...</p>
    </div>
  );
};

export default AuthCallback;