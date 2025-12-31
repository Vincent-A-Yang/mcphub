import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { getToken, getSSOConfig, initiateSSOLogin } from '../services/authService';
import ThemeSwitch from '@/components/ui/ThemeSwitch';
import LanguageSwitch from '@/components/ui/LanguageSwitch';
import DefaultPasswordWarningModal from '@/components/ui/DefaultPasswordWarningModal';
import { SSOProvider } from '../types';

const sanitizeReturnUrl = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  try {
    // Support both relative paths and absolute URLs on the same origin
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const url = new URL(value, origin);
    if (url.origin !== origin) {
      return null;
    }
    const relativePath = `${url.pathname}${url.search}${url.hash}`;
    return relativePath || '/';
  } catch {
    if (value.startsWith('/') && !value.startsWith('//')) {
      return value;
    }
    return null;
  }
};

// Provider icons (SVG)
const ProviderIcon: React.FC<{ type: string; className?: string }> = ({ type, className = 'w-5 h-5' }) => {
  switch (type) {
    case 'google':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      );
    case 'github':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
        </svg>
      );
    case 'microsoft':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path fill="#F25022" d="M1 1h10v10H1z"/>
          <path fill="#00A4EF" d="M1 13h10v10H1z"/>
          <path fill="#7FBA00" d="M13 1h10v10H13z"/>
          <path fill="#FFB900" d="M13 13h10v10H13z"/>
        </svg>
      );
    default:
      // Generic OAuth/OIDC icon
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      );
  }
};

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDefaultPasswordWarning, setShowDefaultPasswordWarning] = useState(false);
  const [ssoProviders, setSsoProviders] = useState<SSOProvider[]>([]);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [allowLocalAuth, setAllowLocalAuth] = useState(true);
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return sanitizeReturnUrl(params.get('returnUrl'));
  }, [location.search]);

  // Load SSO configuration on mount
  useEffect(() => {
    const loadSSOConfig = async () => {
      const config = await getSSOConfig();
      setSsoEnabled(config.enabled);
      setSsoProviders(config.providers);
      setAllowLocalAuth(config.allowLocalAuth);
    };
    loadSSOConfig();
  }, []);

  const isServerUnavailableError = useCallback((message?: string) => {
    if (!message) return false;
    const normalized = message.toLowerCase();

    return (
      normalized.includes('failed to fetch') ||
      normalized.includes('networkerror') ||
      normalized.includes('network error') ||
      normalized.includes('connection refused') ||
      normalized.includes('unable to connect') ||
      normalized.includes('fetch error') ||
      normalized.includes('econnrefused') ||
      normalized.includes('http 500') ||
      normalized.includes('internal server error') ||
      normalized.includes('proxy error')
    );
  }, []);

  const buildRedirectTarget = useCallback(() => {
    if (!returnUrl) {
      return '/';
    }

    // Only attach JWT when returning to the OAuth authorize endpoint
    if (!returnUrl.startsWith('/oauth/authorize')) {
      return returnUrl;
    }

    const token = getToken();
    if (!token) {
      return returnUrl;
    }

    try {
      const origin = window.location.origin;
      const url = new URL(returnUrl, origin);
      url.searchParams.set('token', token);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      const separator = returnUrl.includes('?') ? '&' : '?';
      return `${returnUrl}${separator}token=${encodeURIComponent(token)}`;
    }
  }, [returnUrl]);

  const redirectAfterLogin = useCallback(() => {
    if (returnUrl) {
      window.location.assign(buildRedirectTarget());
    } else {
      navigate('/');
    }
  }, [buildRedirectTarget, navigate, returnUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!username || !password) {
        setError(t('auth.emptyFields'));
        setLoading(false);
        return;
      }

      const result = await login(username, password);

      if (result.success) {
        if (result.isUsingDefaultPassword) {
          // Show warning modal instead of navigating immediately
          setShowDefaultPasswordWarning(true);
        } else {
          redirectAfterLogin();
        }
      } else {
        const message = result.message;
        if (isServerUnavailableError(message)) {
          setError(t('auth.serverUnavailable'));
        } else {
          setError(t('auth.loginFailed'));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : undefined;
      if (isServerUnavailableError(message)) {
        setError(t('auth.serverUnavailable'));
      } else {
        setError(t('auth.loginError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSSOLogin = (providerId: string) => {
    initiateSSOLogin(providerId, returnUrl || undefined);
  };

  const handleCloseWarning = () => {
    setShowDefaultPasswordWarning(false);
    redirectAfterLogin();
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Top-right controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <ThemeSwitch />
        <LanguageSwitch />
      </div>

      {/* Tech background layer */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 dark:opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(60rem 60rem at 20% -10%, rgba(99,102,241,0.25), transparent), radial-gradient(50rem 50rem at 120% 10%, rgba(168,85,247,0.15), transparent)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10">
        <svg
          className="h-full w-full opacity-[0.08] dark:opacity-[0.12]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="url(#grid)"
            className="text-gray-400 dark:text-gray-300"
          />
        </svg>
      </div>

      {/* Main content */}
      <div className="relative mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6 py-16">
        <div className="w-full space-y-16">
          {/* Centered slogan */}
          <div className="flex justify-center w-full">
            <h1 className="text-5xl sm:text-5xl font-extrabold leading-tight tracking-tight text-gray-900 dark:text-white whitespace-nowrap">
              <span className="bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                {t('auth.slogan')}
              </span>
            </h1>
          </div>

          {/* Centered login card */}
          <div className="login-card relative w-full rounded-2xl border border-white/10 bg-white/60 p-8 shadow-xl backdrop-blur-md transition dark:border-white/10 dark:bg-gray-900/60">
            <div className="absolute -top-24 right-12 h-40 w-40 -translate-y-6 rounded-full bg-indigo-500/30 blur-3xl" />
            <div className="absolute -bottom-24 -left-12 h-40 w-40 translate-y-6 rounded-full bg-cyan-500/20 blur-3xl" />

            {/* SSO Buttons */}
            {ssoEnabled && ssoProviders.length > 0 && (
              <div className="space-y-3 mb-6">
                {ssoProviders.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => handleSSOLogin(provider.id)}
                    className="sso-button group relative flex w-full items-center justify-center gap-3 rounded-md border border-gray-300/60 bg-white/80 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:border-gray-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600/60 dark:bg-gray-800/80 dark:text-gray-200 dark:hover:bg-gray-700/80"
                  >
                    <ProviderIcon type={provider.type} />
                    <span>{t('auth.continueWith', { provider: provider.name })}</span>
                  </button>
                ))}
                
                {/* Divider - only show if local auth is also allowed */}
                {allowLocalAuth && (
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300/60 dark:border-gray-600/60" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white/60 text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                        {t('auth.orContinueWith')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Local auth form - only show if allowed */}
            {allowLocalAuth && (
              <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="username" className="sr-only">
                      {t('auth.username')}
                    </label>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      className="login-input appearance-none relative block w-full rounded-md border border-gray-300/60 bg-white/70 px-3 py-3 text-gray-900 shadow-sm outline-none ring-0 transition-all placeholder:text-gray-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-700/60 dark:bg-gray-800/70 dark:text-white dark:placeholder:text-gray-400"
                      placeholder={t('auth.username')}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="sr-only">
                      {t('auth.password')}
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="login-input appearance-none relative block w-full rounded-md border border-gray-300/60 bg-white/70 px-3 py-3 text-gray-900 shadow-sm outline-none ring-0 transition-all placeholder:text-gray-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-700/60 dark:bg-gray-800/70 dark:text-white dark:placeholder:text-gray-400"
                      placeholder={t('auth.password')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <div className="error-box rounded border border-red-500/20 bg-red-500/10 p-2 text-center text-sm text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="login-button btn-primary group relative flex w-full items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading ? t('auth.loggingIn') : t('auth.login')}
                  </button>
                </div>
              </form>
            )}

            {/* Show message if only SSO is available and no providers configured */}
            {!allowLocalAuth && ssoProviders.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400">
                {t('auth.noLoginMethodsAvailable')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Default Password Warning Modal */}
      <DefaultPasswordWarningModal
        isOpen={showDefaultPasswordWarning}
        onClose={handleCloseWarning}
      />
    </div>
  );
};

export default LoginPage;
