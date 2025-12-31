import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setToken } from '../services/authService';

/**
 * OAuth Callback Page
 * 
 * This page handles the callback from OAuth SSO providers.
 * It receives the JWT token as a query parameter, stores it, and redirects to the app.
 */
const OAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    const returnUrl = searchParams.get('returnUrl') || '/';

    if (token) {
      // Store the token
      setToken(token);
      
      // Redirect to the return URL
      navigate(returnUrl, { replace: true });
    } else {
      // No token - redirect to login with error
      navigate('/login?error=oauth_failed&message=No+token+received', { replace: true });
    }
  }, [searchParams, navigate]);

  // Show loading state while processing
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Completing authentication...</p>
      </div>
    </div>
  );
};

export default OAuthCallbackPage;
