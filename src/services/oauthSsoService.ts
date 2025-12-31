/**
 * OAuth SSO Service
 *
 * Handles OAuth 2.0 / OIDC SSO authentication for user login.
 * Supports Google, Microsoft, GitHub, and custom OIDC providers.
 */

import * as client from 'openid-client';
import crypto from 'crypto';
import { getSystemConfigDao, getUserDao } from '../dao/index.js';
import { IUser, OAuthSsoProviderConfig, OAuthSsoConfig } from '../types/index.js';

// In-memory store for OAuth state (code verifier, state, etc.)
// In production, consider using Redis or database for multi-instance deployments
interface OAuthStateEntry {
  codeVerifier: string;
  providerId: string;
  returnUrl?: string;
  createdAt: number;
}

const stateStore = new Map<string, OAuthStateEntry>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cleanup old state entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, entry] of stateStore.entries()) {
    if (now - entry.createdAt > STATE_TTL_MS) {
      stateStore.delete(state);
    }
  }
}, 60 * 1000); // Cleanup every minute

// Provider configurations cache
const providerConfigsCache = new Map<
  string,
  {
    config: client.Configuration;
    provider: OAuthSsoProviderConfig;
  }
>();

/**
 * Get OAuth SSO configuration from system config
 */
export async function getOAuthSsoConfig(): Promise<OAuthSsoConfig | undefined> {
  const systemConfigDao = getSystemConfigDao();
  const systemConfig = await systemConfigDao.get();
  return systemConfig?.oauthSso;
}

/**
 * Check if OAuth SSO is enabled
 */
export async function isOAuthSsoEnabled(): Promise<boolean> {
  const config = await getOAuthSsoConfig();
  return config?.enabled === true && (config.providers?.length ?? 0) > 0;
}

/**
 * Get enabled OAuth SSO providers
 */
export async function getEnabledProviders(): Promise<OAuthSsoProviderConfig[]> {
  const config = await getOAuthSsoConfig();
  if (!config?.enabled || !config.providers) {
    return [];
  }
  return config.providers.filter((p) => p.enabled !== false);
}

/**
 * Get a specific provider by ID
 */
export async function getProviderById(providerId: string): Promise<OAuthSsoProviderConfig | undefined> {
  const providers = await getEnabledProviders();
  return providers.find((p) => p.id === providerId);
}

/**
 * Get default scopes for a provider type
 */
function getDefaultScopes(type: OAuthSsoProviderConfig['type']): string[] {
  switch (type) {
    case 'google':
      return ['openid', 'email', 'profile'];
    case 'microsoft':
      return ['openid', 'email', 'profile', 'User.Read'];
    case 'github':
      return ['read:user', 'user:email'];
    case 'oidc':
    default:
      return ['openid', 'email', 'profile'];
  }
}

/**
 * Get provider discovery URL
 */
function getDiscoveryUrl(provider: OAuthSsoProviderConfig): string | undefined {
  if (provider.issuerUrl) {
    return provider.issuerUrl;
  }

  switch (provider.type) {
    case 'google':
      return 'https://accounts.google.com';
    case 'microsoft':
      // Using common endpoint for multi-tenant
      return 'https://login.microsoftonline.com/common/v2.0';
    case 'github':
      // GitHub doesn't support OIDC discovery, we'll use explicit endpoints
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Get explicit OAuth endpoints for providers without OIDC discovery
 */
function getExplicitEndpoints(provider: OAuthSsoProviderConfig): {
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
} | undefined {
  if (provider.type === 'github') {
    return {
      authorizationUrl: provider.authorizationUrl || 'https://github.com/login/oauth/authorize',
      tokenUrl: provider.tokenUrl || 'https://github.com/login/oauth/access_token',
      userInfoUrl: provider.userInfoUrl || 'https://api.github.com/user',
    };
  }

  // For custom providers with explicit endpoints
  if (provider.authorizationUrl && provider.tokenUrl && provider.userInfoUrl) {
    return {
      authorizationUrl: provider.authorizationUrl,
      tokenUrl: provider.tokenUrl,
      userInfoUrl: provider.userInfoUrl,
    };
  }

  return undefined;
}

/**
 * Initialize and cache openid-client configuration for a provider
 */
async function getClientConfig(
  provider: OAuthSsoProviderConfig,
  _callbackUrl: string,
): Promise<client.Configuration> {
  const cacheKey = provider.id;
  const cached = providerConfigsCache.get(cacheKey);
  if (cached) {
    return cached.config;
  }

  let config: client.Configuration;

  const discoveryUrl = getDiscoveryUrl(provider);

  if (discoveryUrl) {
    // Use OIDC discovery
    config = await client.discovery(new URL(discoveryUrl), provider.clientId, provider.clientSecret);
  } else {
    // Use explicit endpoints for providers like GitHub
    const endpoints = getExplicitEndpoints(provider);
    if (!endpoints) {
      throw new Error(
        `Provider ${provider.id} requires either issuerUrl for OIDC discovery or explicit endpoints`,
      );
    }

    // Create a manual server metadata configuration
    const serverMetadata: client.ServerMetadata = {
      issuer: provider.issuerUrl || `https://${provider.type}.oauth`,
      authorization_endpoint: endpoints.authorizationUrl,
      token_endpoint: endpoints.tokenUrl,
      userinfo_endpoint: endpoints.userInfoUrl,
    };

    config = new client.Configuration(serverMetadata, provider.clientId, provider.clientSecret);
  }

  providerConfigsCache.set(cacheKey, { config, provider });
  return config;
}

/**
 * Generate the authorization URL for a provider
 */
export async function generateAuthorizationUrl(
  providerId: string,
  callbackUrl: string,
  returnUrl?: string,
): Promise<{ url: string; state: string }> {
  const provider = await getProviderById(providerId);
  if (!provider) {
    throw new Error(`OAuth SSO provider not found: ${providerId}`);
  }

  const config = await getClientConfig(provider, callbackUrl);
  const scopes = provider.scopes || getDefaultScopes(provider.type);

  // Generate PKCE code verifier and challenge
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  // Generate state
  const state = crypto.randomBytes(32).toString('base64url');

  // Store state for callback verification
  stateStore.set(state, {
    codeVerifier,
    providerId,
    returnUrl,
    createdAt: Date.now(),
  });

  // Build authorization URL parameters
  const parameters: Record<string, string> = {
    redirect_uri: callbackUrl,
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  };

  // GitHub-specific: request user email access
  if (provider.type === 'github') {
    // GitHub doesn't use PKCE, but we'll still store the state
    delete parameters.code_challenge;
    delete parameters.code_challenge_method;
  }

  const url = client.buildAuthorizationUrl(config, parameters);

  return { url: url.toString(), state };
}

/**
 * Exchange authorization code for tokens and user info
 */
export async function handleCallback(
  callbackUrl: string,
  currentUrl: string,
  state: string,
): Promise<{
  user: IUser;
  isNewUser: boolean;
  returnUrl?: string;
}> {
  // Verify and retrieve state
  const stateEntry = stateStore.get(state);
  if (!stateEntry) {
    throw new Error('Invalid or expired OAuth state');
  }

  // Remove used state
  stateStore.delete(state);

  const provider = await getProviderById(stateEntry.providerId);
  if (!provider) {
    throw new Error(`OAuth SSO provider not found: ${stateEntry.providerId}`);
  }

  const config = await getClientConfig(provider, callbackUrl);

  // Exchange code for tokens
  let tokens: client.TokenEndpointResponse;

  if (provider.type === 'github') {
    // GitHub doesn't use PKCE
    tokens = await client.authorizationCodeGrant(config, new URL(currentUrl), {
      expectedState: state,
    });
  } else {
    // OIDC providers with PKCE
    tokens = await client.authorizationCodeGrant(config, new URL(currentUrl), {
      pkceCodeVerifier: stateEntry.codeVerifier,
      expectedState: state,
    });
  }

  // Get user info
  const userInfo = await getUserInfo(provider, config, tokens);

  // Find or create user
  const { user, isNewUser } = await findOrCreateUser(provider, userInfo);

  return {
    user,
    isNewUser,
    returnUrl: stateEntry.returnUrl,
  };
}

/**
 * Fetch user info from the provider
 */
async function getUserInfo(
  provider: OAuthSsoProviderConfig,
  config: client.Configuration,
  tokens: client.TokenEndpointResponse,
): Promise<{
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  groups?: string[];
  roles?: string[];
  [key: string]: unknown;
}> {
  if (provider.type === 'github') {
    // GitHub uses a different API for user info
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch GitHub user info: ${response.statusText}`);
    }

    const data = await response.json();

    // Fetch email separately if not public
    let email = data.email;
    if (!email) {
      const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: 'application/json',
        },
      });

      if (emailResponse.ok) {
        const emails = await emailResponse.json();
        const primaryEmail = emails.find((e: any) => e.primary);
        email = primaryEmail?.email || emails[0]?.email;
      }
    }

    return {
      sub: String(data.id),
      email,
      name: data.name || data.login,
      picture: data.avatar_url,
    };
  }

  // Standard OIDC userinfo endpoint
  const userInfoResponse = await client.fetchUserInfo(config, tokens.access_token!, client.skipSubjectCheck);

  return {
    sub: userInfoResponse.sub,
    email: userInfoResponse.email as string | undefined,
    name: userInfoResponse.name as string | undefined,
    picture: userInfoResponse.picture as string | undefined,
    groups: userInfoResponse.groups as string[] | undefined,
    roles: userInfoResponse.roles as string[] | undefined,
  };
}

/**
 * Find existing user or create new one based on OAuth profile
 */
async function findOrCreateUser(
  provider: OAuthSsoProviderConfig,
  userInfo: {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
    groups?: string[];
    roles?: string[];
    [key: string]: unknown;
  },
): Promise<{ user: IUser; isNewUser: boolean }> {
  const userDao = getUserDao();

  // Generate a unique username based on provider and subject
  const oauthUsername = `${provider.id}:${userInfo.sub}`;

  // Try to find existing user by OAuth identity
  let user = await userDao.findByUsername(oauthUsername);

  if (user) {
    // Update user info if changed
    const updates: Partial<IUser> = {};
    if (userInfo.email && userInfo.email !== user.email) {
      updates.email = userInfo.email;
    }
    if (userInfo.name && userInfo.name !== user.displayName) {
      updates.displayName = userInfo.name;
    }
    if (userInfo.picture && userInfo.picture !== user.avatarUrl) {
      updates.avatarUrl = userInfo.picture;
    }

    // Check admin status based on claims
    const isAdmin = checkAdminClaim(provider, userInfo);
    if (isAdmin !== user.isAdmin) {
      updates.isAdmin = isAdmin;
    }

    if (Object.keys(updates).length > 0) {
      await userDao.update(oauthUsername, updates);
      user = { ...user, ...updates };
    }

    return { user, isNewUser: false };
  }

  // Check if auto-provisioning is enabled
  if (provider.autoProvision === false) {
    throw new Error(
      `User not found and auto-provisioning is disabled for provider: ${provider.name}`,
    );
  }

  // Create new user
  const isAdmin = checkAdminClaim(provider, userInfo) || provider.defaultAdmin === true;

  // Generate a random password for OAuth users (they won't use it)
  const randomPassword = crypto.randomBytes(32).toString('hex');

  const newUser = await userDao.createWithHashedPassword(oauthUsername, randomPassword, isAdmin);

  // Update with OAuth-specific fields
  const updatedUser = await userDao.update(oauthUsername, {
    oauthProvider: provider.id,
    oauthSubject: userInfo.sub,
    email: userInfo.email,
    displayName: userInfo.name,
    avatarUrl: userInfo.picture,
  });

  return { user: updatedUser || newUser, isNewUser: true };
}

/**
 * Check if user should be granted admin based on provider claims
 */
function checkAdminClaim(
  provider: OAuthSsoProviderConfig,
  userInfo: { groups?: string[]; roles?: string[]; [key: string]: unknown },
): boolean {
  if (!provider.adminClaim || !provider.adminClaimValues?.length) {
    return false;
  }

  const claimValue = userInfo[provider.adminClaim];
  if (!claimValue) {
    return false;
  }

  // Handle array claims (groups, roles)
  if (Array.isArray(claimValue)) {
    return claimValue.some((v) => provider.adminClaimValues!.includes(String(v)));
  }

  // Handle string claims
  return provider.adminClaimValues.includes(String(claimValue));
}

/**
 * Get public provider info for frontend
 */
export async function getPublicProviderInfo(): Promise<
  Array<{
    id: string;
    name: string;
    type: string;
    icon?: string;
    buttonText?: string;
  }>
> {
  const providers = await getEnabledProviders();
  return providers.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    icon: p.icon || p.type,
    buttonText: p.buttonText,
  }));
}

/**
 * Check if local auth is allowed
 */
export async function isLocalAuthAllowed(): Promise<boolean> {
  const config = await getOAuthSsoConfig();
  // Default to true if not configured or SSO is disabled
  if (!config?.enabled) {
    return true;
  }
  return config.allowLocalAuth !== false;
}

/**
 * Clear provider configuration cache
 */
export function clearProviderCache(): void {
  providerConfigsCache.clear();
}
