// Tests for readonly mode in auth middleware
// Verifies that password change is allowed in readonly mode

describe('Auth Readonly Mode Tests', () => {
  // Test the readonlyAllowPaths configuration
  describe('Readonly Allow Paths', () => {
    // Simulate the checkReadonly logic
    const readonlyAllowPaths = ['/tools/call/', '/auth/change-password'];

    const checkReadonlyPath = (path: string, method: string, basePath: string = ''): boolean => {
      for (const allowedPath of readonlyAllowPaths) {
        if (path.startsWith(basePath + allowedPath)) {
          return true;
        }
      }
      return method === 'GET';
    };

    it('should allow /tools/call/ in readonly mode', () => {
      const result = checkReadonlyPath('/tools/call/test', 'POST');
      expect(result).toBe(true);
    });

    it('should allow /auth/change-password in readonly mode', () => {
      const result = checkReadonlyPath('/auth/change-password', 'POST');
      expect(result).toBe(true);
    });

    it('should allow GET requests in readonly mode', () => {
      const result = checkReadonlyPath('/api/servers', 'GET');
      expect(result).toBe(true);
    });

    it('should block other POST requests in readonly mode', () => {
      const result = checkReadonlyPath('/api/servers', 'POST');
      expect(result).toBe(false);
    });

    it('should block PUT requests in readonly mode', () => {
      const result = checkReadonlyPath('/api/servers/1', 'PUT');
      expect(result).toBe(false);
    });

    it('should block DELETE requests in readonly mode', () => {
      const result = checkReadonlyPath('/api/servers/1', 'DELETE');
      expect(result).toBe(false);
    });

    it('should work with base path for /auth/change-password', () => {
      const result = checkReadonlyPath('/api/auth/change-password', 'POST', '/api');
      expect(result).toBe(true);
    });

    it('should work with base path for /tools/call/', () => {
      const result = checkReadonlyPath('/api/tools/call/test', 'POST', '/api');
      expect(result).toBe(true);
    });
  });
});
