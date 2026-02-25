const TOKEN_KEY = "sfm_auth_token";
const REMEMBER_KEY = "sfm_remember_me";

export function setAuthToken(token: string, remember: boolean) {
  try {
    if (remember) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(REMEMBER_KEY, "1");
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.setItem(REMEMBER_KEY, "0");
    }
  } catch {}
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REMEMBER_KEY);
  } catch {}
}

export function getRememberMe(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}
