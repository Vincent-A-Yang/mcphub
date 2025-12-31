import { Request, Response } from 'express';
import { loadSettings } from '../config/index.js';
import {
  isOAuthSSOEnabled,
  isLocalAuthAllowed,
  getEnabledProviders,
  getProviderById,
  generateAuthorizationUrl,
  handleOAuthCallback as handleCallback,
} from '../services/oauthSSOService.js';

/**
 * Get OAuth SSO configuration for frontend
 * Returns list of enabled providers and whether local auth is allowed
 */
export const getSSOConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const enabled = isOAuthSSOEnabled();
    const providers = getEnabledProviders();
    const allowLocalAuth = isLocalAuthAllowed();

    res.json({
      success: true,
      data: {
        enabled,
        providers,
        allowLocalAuth,
      },
    });
  } catch (error) {
    console.error('Error getting SSO config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SSO configuration',
    });
  }
};

/**
 * Initiate OAuth SSO flow for a specific provider
 * Redirects user to the OAuth provider's authorization page
 */
export const initiateSSOLogin = async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;

  try {
    // Check if SSO is enabled
    if (!isOAuthSSOEnabled()) {
      res.status(400).json({
        success: false,
        message: 'OAuth SSO is not enabled',
      });
      return;
    }

    // Check if provider exists
    const providerConfig = getProviderById(provider);
    if (!providerConfig) {
      res.status(404).json({
        success: false,
        message: `OAuth provider '${provider}' not found or disabled`,
      });
      return;
    }

    // Build redirect URI
    const settings = loadSettings();
    const callbackBaseUrl =
      settings.systemConfig?.oauthSSO?.callbackBaseUrl ||
      `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${callbackBaseUrl}/api/auth/sso/${provider}/callback`;

    // Generate authorization URL
    const result = generateAuthorizationUrl(provider, redirectUri);
    if (!result) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate authorization URL',
      });
      return;
    }

    // Store the return URL in a cookie if provided (for after-login redirect)
    const returnUrl = req.query.returnUrl as string;
    if (returnUrl) {
      res.cookie('sso_return_url', returnUrl, {
        httpOnly: true,
        secure: req.secure,
        maxAge: 10 * 60 * 1000, // 10 minutes
        sameSite: 'lax',
      });
    }

    // Redirect to OAuth provider
    res.redirect(result.url);
  } catch (error) {
    console.error(`Error initiating SSO login for ${provider}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate SSO login',
    });
  }
};

/**
 * Handle OAuth callback from provider
 * Exchanges code for tokens, gets user info, creates/updates user, returns JWT
 */
export const handleSSOCallback = async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const { code, state, error: oauthError, error_description } = req.query;

  try {
    // Check for OAuth error from provider
    if (oauthError) {
      console.error(`OAuth SSO error from ${provider}:`, oauthError, error_description);
      res.redirect(`/login?error=${encodeURIComponent(String(error_description || oauthError))}`);
      return;
    }

    // Validate required parameters
    if (!code || !state) {
      res.redirect('/login?error=missing_oauth_parameters');
      return;
    }

    // Build redirect URI (must match the one used in initiation)
    const settings = loadSettings();
    const callbackBaseUrl =
      settings.systemConfig?.oauthSSO?.callbackBaseUrl ||
      `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${callbackBaseUrl}/api/auth/sso/${provider}/callback`;

    // Handle the callback
    const result = await handleCallback(String(state), String(code), redirectUri);

    if (!result.success) {
      console.error(`OAuth SSO callback failed for ${provider}:`, result.error);
      res.redirect(`/login?error=${encodeURIComponent(result.error || 'sso_failed')}`);
      return;
    }

    // Get the return URL from cookie
    const returnUrl = req.cookies?.sso_return_url || '/';
    res.clearCookie('sso_return_url');

    // Build redirect URL with token
    // Note: For security, we use a short-lived token in URL and the frontend
    // should immediately exchange it and store in localStorage
    const redirectUrl = new URL(returnUrl, `${req.protocol}://${req.get('host')}`);

    // For OAuth authorize flow, append token as query param
    if (returnUrl.startsWith('/oauth/authorize')) {
      redirectUrl.searchParams.set('token', result.token!);
      res.redirect(redirectUrl.pathname + redirectUrl.search);
    } else {
      // For normal login, redirect to a special callback page that handles the token
      res.redirect(`/sso-callback?token=${encodeURIComponent(result.token!)}&returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  } catch (error) {
    console.error(`Error handling SSO callback for ${provider}:`, error);
    res.redirect('/login?error=sso_callback_error');
  }
};
