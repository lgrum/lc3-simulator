import type { Viewer } from "@/server/access";

/** Why a sign-in failed, for the login dialog. */
export type SignInProblem = "wrong" | "rate-limited" | "unreachable";

/** How the store reaches the server; replaced in tests. */
export type AccountBackend = {
  fetchViewer: () => Promise<Viewer | null>;
  signIn: (username: string, password: string) => Promise<SignInProblem | null>;
  signOut: () => Promise<void>;
};

export type AccountState = {
  /** Who is logged in, or null for anonymous use. */
  viewer: Viewer | null;
  /** False until the first check of the session cookie finishes. */
  known: boolean;
};

/**
 * Who is logged in. Everything local works without an account, so a server
 * that can't be reached just means nobody is logged in. Compatible with
 * useSyncExternalStore.
 */
export class AccountStore {
  private state: AccountState = { viewer: null, known: false };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly backend: AccountBackend) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): AccountState => this.state;

  /** Reads the session from the server. */
  async refresh(): Promise<void> {
    let viewer: Viewer | null = null;
    try {
      viewer = await this.backend.fetchViewer();
    } catch {
      // No server (e.g. a static preview): use the app anonymously.
    }
    this.publish({ viewer, known: true });
  }

  /** Logs in; returns why it failed, or null. */
  async signIn(
    username: string,
    password: string,
  ): Promise<SignInProblem | null> {
    let problem: SignInProblem | null;
    try {
      problem = await this.backend.signIn(username.trim(), password);
    } catch {
      problem = "unreachable";
    }
    if (!problem) await this.refresh();
    return problem;
  }

  async signOut(): Promise<void> {
    try {
      await this.backend.signOut();
    } finally {
      await this.refresh();
    }
  }

  private publish(state: AccountState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
