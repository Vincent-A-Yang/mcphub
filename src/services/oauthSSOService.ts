import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { loadSettings } from '../config/index.js';
import { JWT_SECRET } from '../config/jwt.js';
import { OAuthSSOConfig, OAuthSSOProvider, IUser, IOAuthLink } from '../types/index.js';
import { getUserDao } from '../dao/index.js';
import { getDataService } from './services.js';

// Built-in provider configurations for Google, GitHub, Microsoft
const BUILTIN_PROVIDERS: Record<string, Omit<OAuthSSOProvider, 'clientId' | 'clientSecret' | 'id' | 'name'>> = {
  google: {
    type: 'google',
    issuerUrl: 'https://accounts.google.com',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: ['openid', 'email', 'profile'],
    attributeMapping: {
      username: 'email',
      email: 'email',
      name: 'name',
    },
  },
  github: {
    type: 'github',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
    attributeMapping: {
      username: 'login',
      email: 'email',
      name: 'name',
    },
  },
  microsoft: {
    type: 'microsoft',
    issuerUrl: 'https://login.microsoftonline.com/common/v2.0',
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
    scopes: ['openid', 'email', 'profile'],
    attributeMapping: {
      username: 'email',
      email: 'email',
      name: 'name',
    },
  },
};

// In-memory store for OAuth state (should be replaced with Redis/DB in production)
const pendingStates = new Map<string, { provider: string; expiresAt: number; codeVerifier?: string }>();

// JWT token expiry for SSO logins
const TOKEN_EXPIRY = '24h';

/**
 * Get OAuth SSO configuration from settings
 */
export function getOAuthSSOConfig(): OAuthSSOConfig | undefined {
  const settings = loadSettings();
  return settings.systemConfig?.oauthSSO;
}

/**
 * Check if OAuth SSO is enabled
 */
export function isOAuthSSOEnabled(): boolean {
  const config = getOAuthSSOConfig();
  return config?.enabled === true && (config.providers?.length ?? 0) > 0;
}

/**
 * Check if local authentication is allowed alongside SSO
 */
export function isLocalAuthAllowed(): boolean {
  const config = getOAuthSSOConfig();
  // Default to true - allow local auth unless explicitly disabled
  return config?.allowLocalAuth !== false;
}

/**
 * Get list of enabled SSO providers for frontend display
 */
export function getEnabledProviders(): Array<{ id: string; name: string; type: string }> {
  const config = getOAuthSSOConfig();
  if (!config?.enabled || !config.providers) {
    return [];
  }

  return config.providers
    .filter((p) => p.enabled !== false)
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
    }));
}

/**
 * Get provider configuration by ID
 */
export function getProviderById(providerId: string): OAuthSSOProvider | undefined {
  const config = getOAuthSSOConfig();
  if (!config?.enabled || !config.providers) {
    return undefined;
  }

  return config.providers.find((p) => p.id === providerId && p.enabled !== false);
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Build the complete provider configuration (merge with built-in defaults)
 */
function buildProviderConfig(provider: OAuthSSOProvider): OAuthSSOProvider {
  const builtin = BUILTIN_PROVIDERS[provider.type];
  if (builtin && provider.type !== 'oidc') {
    return {
      ...builtin,
      ...provider,
      scopes: provider.scopes ?? builtin.scopes,
      attributeMapping: { ...builtin.attributeMapping, ...provider.attributeMapping },
    };
  }
  return provider;
}

/**
 * Generate OAuth authorization URL for a provider
 */
export function generateAuthorizationUrl(
  providerId: string,
  redirectUri: string,
): { url: string; state: string } | null {
  const provider = getProviderById(providerId);
  if (!provider) {
    return null;
  }

  const config = buildProviderConfig(provider);
  const authUrl = config.authorizationUrl;
  if (!authUrl) {
    console.error(`OAuth SSO: No authorization URL configured for provider ${providerId}`);
    return null;
  }

  // Generate state and PKCE
  const state = crypto.randomBytes(16).toString('hex');
  const { codeVerifier, codeChallenge } = generatePKCE();

  // Store state for validation (expires in 10 minutes)
  pendingStates.set(state, {
    provider: providerId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    codeVerifier,
  });

  // Clean up expired states periodically
  cleanupExpiredStates();

  // Build authorization URL
  const url = new URL(authUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);

  // Add scopes
  const scopes = config.scopes ?? ['openid', 'email', 'profile'];
  url.searchParams.set('scope', scopes.join(' '));

  // Add PKCE if not GitHub (GitHub doesn't support PKCE)
  if (config.type !== 'github') {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }

  return { url: url.toString(), state };
}

/**
 * Cleanup expired OAuth states
 */
function cleanupExpiredStates(): void {
  const now = Date.now();
  for (const [state, data] of pendingStates.entries()) {
    if (data.expiresAt < now) {
      pendingStates.delete(state);
    }
  }
}

/**
 * Validate OAuth state and get stored data
 */
function validateState(state: string): { provider: string; codeVerifier?: string } | null {
  const data = pendingStates.get(state);
  if (!data) {
    return null;
  }

  // Remove state to prevent replay
  pendingStates.delete(state);

  // Check expiration
  if (data.expiresAt < Date.now()) {
    return null;
  }

  return { provider: data.provider, codeVerifier: data.codeVerifier };
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  provider: OAuthSSOProvider,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<{ accessToken: string; idToken?: string } | null> {
  const config = buildProviderConfig(provider);
  const tokenUrl = config.tokenUrl;
  if (!tokenUrl) {
    console.error(`OAuth SSO: No token URL configured for provider ${provider.id}`);
    return null;
  }

  const params = new URLSearchParams();
  params.set('grant_type', 'authorization_code');
  params.set('code', code);
  params.set('redirect_uri', redirectUri);
  params.set('client_id', config.clientId);
  params.set('client_secret', config.clientSecret);

  // Add PKCE verifier if available (not for GitHub)
  if (codeVerifier && config.type !== 'github') {
    params.set('code_verifier', codeVerifier);
  }

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OAuth SSO: Token exchange failed for ${provider.id}:`, errorText);
      return null;
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      idToken: data.id_token,
    };
  } catch (error) {
    console.error(`OAuth SSO: Token exchange error for ${provider.id}:`, error);
    return null;
  }
}

/**
 * Get user info from the OAuth provider
 */
async function getUserInfo(
  provider: OAuthSSOProvider,
  accessToken: string,
): Promise<Record<string, unknown> | null> {
  const config = buildProviderConfig(provider);
  const userInfoUrl = config.userInfoUrl;
  if (!userInfoUrl) {
    console.error(`OAuth SSO: No userinfo URL configured for provider ${provider.id}`);
    return null;
  }

  try {
    const response = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OAuth SSO: UserInfo request failed for ${provider.id}:`, errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`OAuth SSO: UserInfo error for ${provider.id}:`, error);
    return null;
  }
}

/**
 * For GitHub, we need to make a separate request to get email if not public
 */
async function getGitHubEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const emails = (await response.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
    const primaryEmail = emails.find((e) => e.primary && e.verified);
    return primaryEmail?.email ?? emails[0]?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract user attributes from provider userinfo based on attribute mapping
 */
function extractUserAttributes(
  provider: OAuthSSOProvider,
  userInfo: Record<string, unknown>,
): { providerId: string; username: string; email?: string; name?: string } {
  const config = buildProviderConfig(provider);
  const mapping = config.attributeMapping ?? {};

  // Get provider user ID
  let providerId: string;
  if (provider.type === 'github') {
    providerId = String(userInfo.id);
  } else {
    providerId = String(userInfo.sub ?? userInfo.id);
  }

  // Get username
  const usernameField = mapping.username ?? 'email';
  let username = String(userInfo[usernameField] ?? '');
  if (!username && userInfo.email) {
    username = String(userInfo.email);
  }

  // Get email
  const emailField = mapping.email ?? 'email';
  const email = userInfo[emailField] ? String(userInfo[emailField]) : undefined;

  // Get display name
  const nameField = mapping.name ?? 'name';
  const name = userInfo[nameField] ? String(userInfo[nameField]) : undefined;

  return { providerId, username, email, name };
}

/**
 * Determine if user should be admin based on role mapping
 */
function determineAdminStatus(provider: OAuthSSOProvider, userInfo: Record<string, unknown>): boolean {
  const config = buildProviderConfig(provider);
  const roleMapping = config.roleMapping;

  if (!roleMapping) {
    return false;
  }

  // Check if admin claim is configured
  if (roleMapping.adminClaim && roleMapping.adminValues?.length) {
    const claimValue = userInfo[roleMapping.adminClaim];
    if (claimValue) {
      // Handle both single value and array claims
      const values = Array.isArray(claimValue) ? claimValue : [claimValue];
      for (const value of values) {
        if (roleMapping.adminValues.includes(String(value))) {
          return true;
        }
      }
    }
  }

  return roleMapping.defaultIsAdmin ?? false;
}

/**
 * Handle OAuth callback - exchange code, get user info, create/update user, return JWT
 */
export async function handleOAuthCallback(
  state: string,
  code: string,
  redirectUri: string,
): Promise<{
  success: boolean;
  token?: string;
  user?: { username: string; isAdmin: boolean; permissions?: string[] };
  error?: string;
}> {
  // Validate state
  const stateData = validateState(state);
  if (!stateData) {
    return { success: false, error: 'Invalid or expired OAuth state' };
  }

  // Get provider
  const provider = getProviderById(stateData.provider);
  if (!provider) {
    return { success: false, error: 'OAuth provider not found or disabled' };
  }

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(provider, code, redirectUri, stateData.codeVerifier);
  if (!tokens) {
    return { success: false, error: 'Failed to exchange authorization code for tokens' };
  }

  // Get user info
  let userInfo = await getUserInfo(provider, tokens.accessToken);
  if (!userInfo) {
    return { success: false, error: 'Failed to get user information from provider' };
  }

  // For GitHub, get email separately if not in userinfo
  if (provider.type === 'github' && !userInfo.email) {
    const email = await getGitHubEmail(tokens.accessToken);
    if (email) {
      userInfo = { ...userInfo, email };
    }
  }

  // Extract user attributes
  const { providerId, username, email, name } = extractUserAttributes(provider, userInfo);
  if (!username) {
    return { success: false, error: 'Could not determine username from OAuth provider' };
  }

  // Determine admin status
  const isAdmin = determineAdminStatus(provider, userInfo);

  // Find or create user
  const userDao = getUserDao();
  const config = buildProviderConfig(provider);

  // First, try to find user by OAuth link
  let user = await findUserByOAuthLink(provider.id, providerId);

  if (!user) {
    // Try to find by username (for linking existing accounts)
    user = await userDao.findByUsername(username);

    if (user) {
      // Existing user found - link their account if allowed
      if (config.allowLinking !== false) {
        const oauthLink: IOAuthLink = {
          provider: provider.id,
          providerId,
          email,
          name,
          linkedAt: new Date().toISOString(),
        };
        user = await linkOAuthAccount(user.username, oauthLink);
      }
    } else if (config.autoProvision !== false) {
      // Auto-provision new user
      try {
        // Generate a random secure password (user won't need it with SSO)
        const randomPassword = crypto.randomBytes(32).toString('hex');
        user = await userDao.createWithHashedPassword(username, randomPassword, isAdmin);

        // Link OAuth account
        const oauthLink: IOAuthLink = {
          provider: provider.id,
          providerId,
          email,
          name,
          linkedAt: new Date().toISOString(),
        };
        user = await linkOAuthAccount(username, oauthLink);

        console.log(`OAuth SSO: Auto-provisioned user ${username} via ${provider.id}`);
      } catch (error) {
        console.error(`OAuth SSO: Failed to create user ${username}:`, error);
        return { success: false, error: 'Failed to create user account' };
      }
    } else {
      return { success: false, error: 'User account not found and auto-provisioning is disabled' };
    }
  }

  if (!user) {
    return { success: false, error: 'Failed to find or create user account' };
  }

  // Generate JWT token
  const payload = {
    user: {
      username: user.username,
      isAdmin: user.isAdmin || false,
    },
  };

  return new Promise((resolve) => {
    jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY }, (err, token) => {
      if (err || !token) {
        console.error('OAuth SSO: Failed to generate JWT:', err);
        resolve({ success: false, error: 'Failed to generate authentication token' });
        return;
      }

      const dataService = getDataService();
      resolve({
        success: true,
        token,
        user: {
          username: user!.username,
          isAdmin: user!.isAdmin || false,
          permissions: dataService.getPermissions(user!),
        },
      });
    });
  });
}

/**
 * Find user by OAuth link
 */
async function findUserByOAuthLink(providerId: string, providerUserId: string): Promise<IUser | null> {
  const userDao = getUserDao();
  const users = await userDao.findAll();

  for (const user of users) {
    if (user.oauthLinks?.some((link) => link.provider === providerId && link.providerId === providerUserId)) {
      return user;
    }
  }

  return null;
}

/**
 * Link OAuth account to existing user
 */
async function linkOAuthAccount(username: string, oauthLink: IOAuthLink): Promise<IUser | null> {
  const userDao = getUserDao();
  const user = await userDao.findByUsername(username);

  if (!user) {
    return null;
  }

  // Add or update OAuth link
  const existingLinks = user.oauthLinks ?? [];
  const linkIndex = existingLinks.findIndex((l) => l.provider === oauthLink.provider);

  if (linkIndex >= 0) {
    existingLinks[linkIndex] = oauthLink;
  } else {
    existingLinks.push(oauthLink);
  }

  return await userDao.update(username, { oauthLinks: existingLinks });
}

/**
 * Unlink OAuth account from user
 */
export async function unlinkOAuthAccount(username: string, providerId: string): Promise<IUser | null> {
  const userDao = getUserDao();
  const user = await userDao.findByUsername(username);

  if (!user || !user.oauthLinks) {
    return null;
  }

  const updatedLinks = user.oauthLinks.filter((l) => l.provider !== providerId);
  return await userDao.update(username, { oauthLinks: updatedLinks });
}

/**
 * Get OAuth links for a user
 */
export async function getUserOAuthLinks(username: string): Promise<IOAuthLink[]> {
  const userDao = getUserDao();
  const user = await userDao.findByUsername(username);
  return user?.oauthLinks ?? [];
}
