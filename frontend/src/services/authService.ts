import {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  ChangePasswordCredentials,
  SSOConfig,
} from '../types';
import { apiPost, apiGet } from '../utils/fetchInterceptor';
import { getToken, setToken, removeToken } from '../utils/interceptors';

// Export token management functions
export { getToken, setToken, removeToken };

// Get SSO configuration
export const getSSOConfig = async (): Promise<SSOConfig> => {
  try {
    const response = await apiGet<{ success: boolean; data: SSOConfig }>('/auth/sso/config');
    if (response.success && response.data) {
      return response.data;
    }
    return { enabled: false, providers: [], allowLocalAuth: true };
  } catch (error) {
    console.error('Get SSO config error:', error);
    return { enabled: false, providers: [], allowLocalAuth: true };
  }
};

// Initiate SSO login (redirects to provider)
export const initiateSSOLogin = (providerId: string, returnUrl?: string): void => {
  const basePath = import.meta.env.VITE_API_BASE_PATH || '';
  let url = `${basePath}/api/auth/sso/${providerId}`;
  if (returnUrl) {
    url += `?returnUrl=${encodeURIComponent(returnUrl)}`;
  }
  window.location.href = url;
};

// Handle SSO callback token (called from SSO callback page)
export const handleSSOToken = (token: string): void => {
  setToken(token);
};

// Login user
export const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
  try {
    const response = await apiPost<AuthResponse>('/auth/login', credentials);

    // The auth API returns data directly, not wrapped in a data field
    if (response.success && response.token) {
      setToken(response.token);
      return response;
    }

    return {
      success: false,
      message: response.message || 'Login failed',
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An error occurred during login',
    };
  }
};

// Register user
export const register = async (credentials: RegisterCredentials): Promise<AuthResponse> => {
  try {
    const response = await apiPost<AuthResponse>('/auth/register', credentials);

    if (response.success && response.token) {
      setToken(response.token);
      return response;
    }

    return {
      success: false,
      message: response.message || 'Registration failed',
    };
  } catch (error) {
    console.error('Register error:', error);
    return {
      success: false,
      message: 'An error occurred during registration',
    };
  }
};

// Get current user
export const getCurrentUser = async (): Promise<AuthResponse> => {
  const token = getToken();

  if (!token) {
    return {
      success: false,
      message: 'No authentication token',
    };
  }

  try {
    const response = await apiGet<AuthResponse>('/auth/user');
    return response;
  } catch (error) {
    console.error('Get current user error:', error);
    return {
      success: false,
      message: 'An error occurred while fetching user data',
    };
  }
};

// Change password
export const changePassword = async (
  credentials: ChangePasswordCredentials,
): Promise<AuthResponse> => {
  const token = getToken();

  if (!token) {
    return {
      success: false,
      message: 'No authentication token',
    };
  }

  try {
    const response = await apiPost<AuthResponse>('/auth/change-password', credentials);
    return response;
  } catch (error) {
    console.error('Change password error:', error);
    return {
      success: false,
      message: 'An error occurred while changing password',
    };
  }
};

// Logout user
export const logout = (): void => {
  removeToken();
};
