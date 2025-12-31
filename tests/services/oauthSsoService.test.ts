// Mock openid-client before importing services
jest.mock('openid-client', () => ({
  discovery: jest.fn(),
  Configuration: jest.fn(),
  randomPKCECodeVerifier: jest.fn(() => 'test-verifier'),
  calculatePKCECodeChallenge: jest.fn(() => Promise.resolve('test-challenge')),
  buildAuthorizationUrl: jest.fn(() => new URL('https://example.com/authorize')),
  authorizationCodeGrant: jest.fn(),
  fetchUserInfo: jest.fn(),
  skipSubjectCheck: Symbol('skipSubjectCheck'),
}));

// Mock the DAO module
jest.mock('../../src/dao/index.js', () => ({
  getSystemConfigDao: jest.fn(),
  getUserDao: jest.fn(),
}));

import * as daoModule from '../../src/dao/index.js';
import {
  isOAuthSsoEnabled,
  getEnabledProviders,
  getProviderById,
  isLocalAuthAllowed,
  getPublicProviderInfo,
  clearProviderCache,
} from '../../src/services/oauthSsoService.js';

describe('OAuth SSO Service', () => {
  const mockGetSystemConfigDao = daoModule.getSystemConfigDao as jest.MockedFunction<
    typeof daoModule.getSystemConfigDao
  >;
  const mockGetUserDao = daoModule.getUserDao as jest.MockedFunction<typeof daoModule.getUserDao>;

  const defaultSsoConfig = {
    enabled: true,
    allowLocalAuth: true,
    providers: [
      {
        id: 'google',
        type: 'google' as const,
        name: 'Google',
        enabled: true,
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        scopes: ['openid', 'email', 'profile'],
      },
      {
        id: 'github',
        type: 'github' as const,
        name: 'GitHub',
        enabled: true,
        clientId: 'test-github-client',
        clientSecret: 'test-github-secret',
      },
      {
        id: 'disabled-provider',
        type: 'oidc' as const,
        name: 'Disabled',
        enabled: false,
        clientId: 'disabled-client',
        clientSecret: 'disabled-secret',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clearProviderCache();

    mockGetSystemConfigDao.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        oauthSso: defaultSsoConfig,
      }),
    } as any);

    mockGetUserDao.mockReturnValue({
      findByUsername: jest.fn().mockResolvedValue(null),
      createWithHashedPassword: jest.fn().mockResolvedValue({
        username: 'google:12345',
        password: 'hashed',
        isAdmin: false,
      }),
      update: jest.fn().mockImplementation((username: string, data: any) =>
        Promise.resolve({
          username,
          password: 'hashed',
          isAdmin: false,
          ...data,
        })
      ),
    } as any);
  });

  describe('isOAuthSsoEnabled', () => {
    it('should return true when OAuth SSO is enabled with providers', async () => {
      const enabled = await isOAuthSsoEnabled();
      expect(enabled).toBe(true);
    });

    it('should return false when OAuth SSO is disabled', async () => {
      mockGetSystemConfigDao.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          oauthSso: { ...defaultSsoConfig, enabled: false },
        }),
      } as any);

      const enabled = await isOAuthSsoEnabled();
      expect(enabled).toBe(false);
    });

    it('should return false when no providers are configured', async () => {
      mockGetSystemConfigDao.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          oauthSso: { ...defaultSsoConfig, providers: [] },
        }),
      } as any);

      const enabled = await isOAuthSsoEnabled();
      expect(enabled).toBe(false);
    });
  });

  describe('getEnabledProviders', () => {
    it('should return only enabled providers', async () => {
      const providers = await getEnabledProviders();
      expect(providers).toHaveLength(2);
      expect(providers.map((p) => p.id)).toContain('google');
      expect(providers.map((p) => p.id)).toContain('github');
      expect(providers.map((p) => p.id)).not.toContain('disabled-provider');
    });

    it('should return empty array when SSO is disabled', async () => {
      mockGetSystemConfigDao.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          oauthSso: { ...defaultSsoConfig, enabled: false },
        }),
      } as any);

      const providers = await getEnabledProviders();
      expect(providers).toHaveLength(0);
    });
  });

  describe('getProviderById', () => {
    it('should return the correct provider by ID', async () => {
      const provider = await getProviderById('google');
      expect(provider).toBeDefined();
      expect(provider?.id).toBe('google');
      expect(provider?.type).toBe('google');
      expect(provider?.name).toBe('Google');
    });

    it('should return undefined for non-existent provider', async () => {
      const provider = await getProviderById('non-existent');
      expect(provider).toBeUndefined();
    });

    it('should return undefined for disabled provider', async () => {
      const provider = await getProviderById('disabled-provider');
      expect(provider).toBeUndefined();
    });
  });

  describe('isLocalAuthAllowed', () => {
    it('should return true when local auth is allowed', async () => {
      const allowed = await isLocalAuthAllowed();
      expect(allowed).toBe(true);
    });

    it('should return false when local auth is disabled', async () => {
      mockGetSystemConfigDao.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          oauthSso: { ...defaultSsoConfig, allowLocalAuth: false },
        }),
      } as any);

      const allowed = await isLocalAuthAllowed();
      expect(allowed).toBe(false);
    });

    it('should return true when SSO is disabled (fallback)', async () => {
      mockGetSystemConfigDao.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          oauthSso: undefined,
        }),
      } as any);

      const allowed = await isLocalAuthAllowed();
      expect(allowed).toBe(true);
    });
  });

  describe('getPublicProviderInfo', () => {
    it('should return public info for enabled providers only', async () => {
      const info = await getPublicProviderInfo();
      expect(info).toHaveLength(2);

      const googleInfo = info.find((p) => p.id === 'google');
      expect(googleInfo).toBeDefined();
      expect(googleInfo?.name).toBe('Google');
      expect(googleInfo?.type).toBe('google');
      expect(googleInfo?.icon).toBe('google');

      // Ensure sensitive data is not exposed
      expect((googleInfo as any)?.clientSecret).toBeUndefined();
      expect((googleInfo as any)?.clientId).toBeUndefined();
    });

    it('should include buttonText when specified', async () => {
      mockGetSystemConfigDao.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          oauthSso: {
            ...defaultSsoConfig,
            providers: [
              {
                ...defaultSsoConfig.providers[0],
                buttonText: 'Login with Google',
              },
            ],
          },
        }),
      } as any);

      const info = await getPublicProviderInfo();
      expect(info[0].buttonText).toBe('Login with Google');
    });
  });
});
