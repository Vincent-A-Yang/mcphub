import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { handleSSOToken, getCurrentUser } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';

/**
 * SSO Callback Page
 * Handles the redirect from OAuth SSO callback, extracts token, and redirects to destination
 */
const SSOCallbackPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { auth } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(location.search);
      const token = params.get('token');
      const returnUrl = params.get('returnUrl') || '/';
      const errorParam = params.get('error');

      // Handle OAuth errors
      if (errorParam) {
        setError(errorParam);
        setTimeout(() => {
          navigate('/login');
        }, 3000);
        return;
      }

      // Handle successful SSO login
      if (token) {
        try {
          // Store the token
          handleSSOToken(token);

          // Verify the token by fetching current user
          const response = await getCurrentUser();
          if (response.success) {
            // Redirect to the return URL or dashboard
            if (returnUrl.startsWith('/oauth/authorize')) {
              // For OAuth authorize flow, pass the token
              const url = new URL(returnUrl, window.location.origin);
              url.searchParams.set('token', token);
              window.location.assign(`${url.pathname}${url.search}`);
            } else {
              navigate(returnUrl);
            }
          } else {
            setError(t('auth.ssoTokenInvalid'));
            setTimeout(() => {
              navigate('/login');
            }, 3000);
          }
        } catch (err) {
          console.error('SSO callback error:', err);
          setError(t('auth.ssoCallbackError'));
          setTimeout(() => {
            navigate('/login');
          }, 3000);
        }
      } else {
        // No token provided
        setError(t('auth.ssoNoToken'));
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      }
    };

    // Only handle callback if not already authenticated
    if (!auth.isAuthenticated) {
      handleCallback();
    } else {
      // Already authenticated, redirect to home
      navigate('/');
    }
  }, [location.search, navigate, auth.isAuthenticated, t]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        {error ? (
          <div className="space-y-4">
            <div className="text-red-600 dark:text-red-400 text-lg font-medium">
              {error}
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {t('auth.redirectingToLogin')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="text-gray-600 dark:text-gray-300 text-lg">
              {t('auth.ssoProcessing')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SSOCallbackPage;
