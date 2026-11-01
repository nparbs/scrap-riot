import type { GarageAction, HistoryEntry, LeaderboardEntry, OnlineStatus, Profile } from './protocol';

const TOKEN_KEY = 'scrap-riot.session';
const TIMEOUT_MS = 6000;

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with status ${status}`);
  }
}

/** Talks to the game server's REST API, and keeps the session token for this browser. */
export class Api {
  private readonly base: string;
  token: string | null = null;

  constructor(serverUrl: string, private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null) {
    this.base = serverUrl.replace(/^ws/, 'http').replace(/\/$/, '');
    try {
      this.token = storage?.getItem(TOKEN_KEY) ?? null;
    } catch {
      this.token = null;
    }
  }

  private setToken(token: string | null): void {
    this.token = token;
    try {
      if (token) this.storage?.setItem(TOKEN_KEY, token);
      else this.storage?.removeItem(TOKEN_KEY);
    } catch {
      // The session then lasts only until this page closes.
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new ApiError(response.status);
    return (await response.json()) as T;
  }

  /** Resumes this browser's account, or creates a guest if it has none. */
  async start(): Promise<Profile> {
    if (this.token) {
      try {
        return (await this.request<{ profile: Profile }>('GET', '/api/me')).profile;
      } catch (error) {
        // Only an expired session means starting over. A network failure must not lose the account.
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        this.setToken(null);
      }
    }
    return this.newGuest();
  }

  private async newGuest(): Promise<Profile> {
    const { token, profile } = await this.request<{ token: string; profile: Profile }>('POST', '/api/guest');
    this.setToken(token);
    return profile;
  }

  async googleClientId(): Promise<string | null> {
    return (await this.request<{ googleClientId: string | null }>('GET', '/api/config')).googleClientId;
  }

  async signInWithGoogle(credential: string): Promise<Profile> {
    const { token, profile } = await this.request<{ token: string; profile: Profile }>('POST', '/api/auth/google', { credential });
    this.setToken(token);
    return profile;
  }

  async me(): Promise<Profile> {
    return (await this.request<{ profile: Profile }>('GET', '/api/me')).profile;
  }

  async garage(action: GarageAction): Promise<Profile> {
    return (await this.request<{ profile: Profile }>('POST', '/api/garage', { action })).profile;
  }

  async history(): Promise<HistoryEntry[]> {
    return (await this.request<{ history: HistoryEntry[] }>('GET', '/api/history')).history;
  }

  async leaderboard(): Promise<LeaderboardEntry[]> {
    return (await this.request<{ leaderboard: LeaderboardEntry[] }>('GET', '/api/leaderboard')).leaderboard;
  }

  online(): Promise<OnlineStatus> {
    return this.request<OnlineStatus>('GET', '/api/online');
  }

  /** Signing out of a Google account leaves this browser on a new, empty guest. */
  async signOut(): Promise<Profile> {
    await this.request('POST', '/api/logout');
    this.setToken(null);
    return this.newGuest();
  }

  async deleteAccount(): Promise<Profile> {
    await this.request('DELETE', '/api/me');
    this.setToken(null);
    return this.newGuest();
  }
}
