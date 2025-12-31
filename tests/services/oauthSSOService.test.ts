// Tests for OAuth SSO Service

import {
  isOAuthSSOEnabled,
  isLocalAuthAllowed,
  getEnabledProviders,
  getProviderById,
  generateAuthorizationUrl,
} from '../../src/services/oauthSSOService.js';

// Mock the config loading
jest.mock('../../src/config/index.js', () => ({
  loadSettings: jest.fn(),
}));

import { loadSettings } from '../../src/config/index.js';

const mockLoadSettings = loadSettings as jest.MockedFunction<typeof loadSettings>;

describe('OAuth SSO Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isOAuthSSOEnabled', () => {
    it('should return false when oauthSSO is not configured', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {},
      });

      expect(isOAuthSSOEnabled()).toBe(false);
    });

    it('should return false when oauthSSO.enabled is false', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: false,
            providers: [
              {
                id: 'google',
                name: 'Google',
                type: 'google',
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
              },
            ],
          },
        },
      });

      expect(isOAuthSSOEnabled()).toBe(false);
    });

    it('should return false when no providers are configured', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [],
          },
        },
      });

      expect(isOAuthSSOEnabled()).toBe(false);
    });

    it('should return true when enabled and providers exist', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [
              {
                id: 'google',
                name: 'Google',
                type: 'google',
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
              },
            ],
          },
        },
      });

      expect(isOAuthSSOEnabled()).toBe(true);
    });
  });

  describe('isLocalAuthAllowed', () => {
    it('should return true by default when not configured', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {},
      });

      expect(isLocalAuthAllowed()).toBe(true);
    });

    it('should return true when allowLocalAuth is not explicitly set', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [],
          },
        },
      });

      expect(isLocalAuthAllowed()).toBe(true);
    });

    it('should return false when allowLocalAuth is false', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            allowLocalAuth: false,
            providers: [],
          },
        },
      });

      expect(isLocalAuthAllowed()).toBe(false);
    });

    it('should return true when allowLocalAuth is true', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            allowLocalAuth: true,
            providers: [],
          },
        },
      });

      expect(isLocalAuthAllowed()).toBe(true);
    });
  });

  describe('getEnabledProviders', () => {
    it('should return empty array when SSO is not enabled', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {},
      });

      expect(getEnabledProviders()).toEqual([]);
    });

    it('should return only enabled providers', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [
              {
                id: 'google',
                name: 'Google',
                type: 'google',
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
                enabled: true,
              },
              {
                id: 'github',
                name: 'GitHub',
                type: 'github',
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
                enabled: false,
              },
              {
                id: 'microsoft',
                name: 'Microsoft',
                type: 'microsoft',
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
                // enabled is undefined, defaults to true
              },
            ],
          },
        },
      });

      const providers = getEnabledProviders();
      expect(providers).toHaveLength(2);
      expect(providers[0]).toEqual({ id: 'google', name: 'Google', type: 'google' });
      expect(providers[1]).toEqual({ id: 'microsoft', name: 'Microsoft', type: 'microsoft' });
    });
  });

  describe('getProviderById', () => {
    it('should return undefined when provider not found', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [
              {
                id: 'google',
                name: 'Google',
                type: 'google',
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
              },
            ],
          },
        },
      });

      expect(getProviderById('github')).toBeUndefined();
    });

    it('should return undefined when provider is disabled', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [
              {
                id: 'google',
                name: 'Google',
                type: 'google',
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
                enabled: false,
              },
            ],
          },
        },
      });

      expect(getProviderById('google')).toBeUndefined();
    });

    it('should return provider when found and enabled', () => {
      const provider = {
        id: 'google',
        name: 'Google',
        type: 'google' as const,
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      };

      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [provider],
          },
        },
      });

      expect(getProviderById('google')).toEqual(provider);
    });
  });

  describe('generateAuthorizationUrl', () => {
    it('should return null when provider not found', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [],
          },
        },
      });

      expect(generateAuthorizationUrl('google', 'http://localhost/callback')).toBeNull();
    });

    it('should generate authorization URL for Google provider', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [
              {
                id: 'google',
                name: 'Google',
                type: 'google',
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
              },
            ],
          },
        },
      });

      const result = generateAuthorizationUrl('google', 'http://localhost/callback');
      expect(result).not.toBeNull();
      expect(result!.url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(result!.url).toContain('client_id=test-client-id');
      expect(result!.url).toContain('redirect_uri=http%3A%2F%2Flocalhost%2Fcallback');
      expect(result!.url).toContain('response_type=code');
      expect(result!.url).toContain('scope=openid+email+profile');
      expect(result!.url).toContain('code_challenge=');
      expect(result!.state).toBeDefined();
    });

    it('should generate authorization URL for GitHub provider without PKCE', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [
              {
                id: 'github',
                name: 'GitHub',
                type: 'github',
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
              },
            ],
          },
        },
      });

      const result = generateAuthorizationUrl('github', 'http://localhost/callback');
      expect(result).not.toBeNull();
      expect(result!.url).toContain('https://github.com/login/oauth/authorize');
      expect(result!.url).not.toContain('code_challenge=');
      expect(result!.state).toBeDefined();
    });

    it('should generate authorization URL for Microsoft provider', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [
              {
                id: 'microsoft',
                name: 'Microsoft',
                type: 'microsoft',
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
              },
            ],
          },
        },
      });

      const result = generateAuthorizationUrl('microsoft', 'http://localhost/callback');
      expect(result).not.toBeNull();
      expect(result!.url).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      expect(result!.url).toContain('code_challenge=');
      expect(result!.state).toBeDefined();
    });

    it('should include custom scopes when configured', () => {
      mockLoadSettings.mockReturnValue({
        mcpServers: {},
        systemConfig: {
          oauthSSO: {
            enabled: true,
            providers: [
              {
                id: 'google',
                name: 'Google',
                type: 'google',
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
                scopes: ['custom-scope', 'another-scope'],
              },
            ],
          },
        },
      });

      const result = generateAuthorizationUrl('google', 'http://localhost/callback');
      expect(result).not.toBeNull();
      expect(result!.url).toContain('scope=custom-scope+another-scope');
    });
  });
});
