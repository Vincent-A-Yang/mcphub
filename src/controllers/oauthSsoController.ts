/**
 * OAuth SSO Controller
 *
 * Handles OAuth SSO authentication endpoints.
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  generateAuthorizationUrl,
  handleCallback,
  getPublicProviderInfo,
  isLocalAuthAllowed,
  isOAuthSsoEnabled,
} from '../services/oauthSsoService.js';
import { JWT_SECRET } from '../config/jwt.js';
import config from '../config/index.js';

const TOKEN_EXPIRY = '24h';

/**
 * Get OAuth SSO configuration for frontend
 * Returns enabled providers and whether local auth is allowed
 */
export const getOAuthSsoConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const enabled = await isOAuthSsoEnabled();
    const providers = await getPublicProviderInfo();
    const localAuthAllowed = await isLocalAuthAllowed();

    res.json({
      success: true,
      data: {
        enabled,
        providers,
        localAuthAllowed,
      },
    });
  } catch (error) {
    console.error('Error getting OAuth SSO config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get OAuth SSO configuration',
    });
  }
};

/**
 * Initiate OAuth SSO login
 * Redirects user to the OAuth provider's authorization page
 */
export const initiateOAuthLogin = async (req: Request, res: Response): Promise<void> => {
  const t = (req as any).t || ((key: string) => key);

  try {
    const { providerId } = req.params;
    const { returnUrl } = req.query;

    if (!providerId) {
      res.status(400).json({
        success: false,
        message: t('oauthSso.errors.providerIdRequired'),
      });
      return;
    }

    // Build callback URL
    const baseUrl =
      req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
        ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
        : `${req.protocol}://${req.get('host')}`;

    const callbackUrl = `${baseUrl}${config.basePath}/api/auth/sso/${providerId}/callback`;

    // Generate authorization URL
    const { url } = await generateAuthorizationUrl(
      providerId,
      callbackUrl,
      typeof returnUrl === 'string' ? returnUrl : undefined,
    );

    // Redirect to OAuth provider
    res.redirect(url);
  } catch (error) {
    console.error('Error initiating OAuth login:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to initiate OAuth login';
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

/**
 * Handle OAuth callback from provider
 * Exchanges code for tokens and creates/updates user
 */
export const handleOAuthCallback = async (req: Request, res: Response): Promise<void> => {
  const t = (req as any).t || ((key: string) => key);

  try {
    const { providerId } = req.params;
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error(`OAuth error from provider ${providerId}:`, error, error_description);
      const errorUrl = buildErrorRedirectUrl(String(error_description || error), req);
      return res.redirect(errorUrl);
    }

    // Validate required parameters
    if (!state) {
      const errorUrl = buildErrorRedirectUrl(t('oauthSso.errors.missingState'), req);
      return res.redirect(errorUrl);
    }

    if (!code) {
      const errorUrl = buildErrorRedirectUrl(t('oauthSso.errors.missingCode'), req);
      return res.redirect(errorUrl);
    }

    // Build callback URL (same as used in initiate)
    const baseUrl =
      req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
        ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
        : `${req.protocol}://${req.get('host')}`;

    const callbackUrl = `${baseUrl}${config.basePath}/api/auth/sso/${providerId}/callback`;

    // Full current URL with query params
    const currentUrl = `${callbackUrl}?${new URLSearchParams(req.query as Record<string, string>).toString()}`;

    // Exchange code for tokens and get user
    const { user, returnUrl } = await handleCallback(
      callbackUrl,
      currentUrl,
      String(state),
    );

    // Generate JWT token
    const payload = {
      user: {
        username: user.username,
        isAdmin: user.isAdmin || false,
      },
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    // Redirect to frontend with token
    const redirectUrl = buildSuccessRedirectUrl(token, returnUrl, req);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Authentication failed';
    const errorUrl = buildErrorRedirectUrl(errorMessage, req);
    res.redirect(errorUrl);
  }
};

/**
 * Get list of available OAuth providers
 */
export const listOAuthProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    const providers = await getPublicProviderInfo();
    res.json({
      success: true,
      data: providers,
    });
  } catch (error) {
    console.error('Error listing OAuth providers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list OAuth providers',
    });
  }
};

/**
 * Build redirect URL for successful authentication
 */
function buildSuccessRedirectUrl(token: string, returnUrl: string | undefined, req: Request): string {
  const baseUrl = getBaseUrl(req);
  const targetPath = returnUrl || '/';
  
  // Use a special OAuth callback page that stores the token
  const callbackPath = `${config.basePath}/oauth-callback`;
  const params = new URLSearchParams({
    token,
    returnUrl: targetPath,
  });

  return `${baseUrl}${callbackPath}?${params.toString()}`;
}

/**
 * Build redirect URL for authentication errors
 */
function buildErrorRedirectUrl(error: string, req: Request): string {
  const baseUrl = getBaseUrl(req);
  const loginPath = `${config.basePath}/login`;
  const params = new URLSearchParams({
    error: 'oauth_failed',
    message: error,
  });

  return `${baseUrl}${loginPath}?${params.toString()}`;
}

/**
 * Get base URL from request
 */
function getBaseUrl(req: Request): string {
  if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']) {
    return `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`;
  }
  return `${req.protocol}://${req.get('host')}`;
}
