import { parseProgress } from "./engine.js";

export class CloudClient {
  constructor(config, fetcher = (...args) => globalThis.fetch(...args)) {
    this.config = config;
    this.fetcher = fetcher;
    this.session = null;
    this.refreshing = null;
  }
  async request(path, body, token) {
    const response = await this.fetcher(this.config.url + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { apikey: this.config.key, "Content-Type": "application/json", ...(token ? {Authorization: `Bearer ${token}`} : {}) },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    const result = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(result?.msg || result?.message || result?.error_description || "Could not reach online progress.");
      error.code = result?.code;
      throw error;
    }
    return result;
  }
  setSession(session) {
    this.session = {...session, expiresAt: Date.now() + session.expires_in * 1000};
  }
  async signIn(email, password) {
    this.setSession(await this.request("/auth/v1/token?grant_type=password", {email, password}));
  }
  async token() {
    if (!this.session) throw Error("Sign in to access online progress.");
    if (this.session.expiresAt < Date.now() + 60000) {
      this.refreshing ||= this.request("/auth/v1/token?grant_type=refresh_token", {refresh_token: this.session.refresh_token})
        .then(session => this.setSession(session)).finally(() => {this.refreshing = null;});
      await this.refreshing;
    }
    return this.session.access_token;
  }
  async rpc(name, body = {}) { return this.request(`/rest/v1/rpc/${name}`, body, await this.token()); }
  async students() {
    const rows = await this.request("/rest/v1/fact_pop_students?select=*&order=nickname.asc", undefined, await this.token());
    return rows.map(row => ({...row, progress: parseProgress(JSON.stringify(row.progress))}));
  }
  async signOut() {
    const token = this.session?.access_token;
    this.session = null;
    if (token) { try { await this.request("/auth/v1/logout?scope=local", {}, token); } catch { /* Local credentials are already removed. */ } }
  }
}

// A failed/ambiguous write blocks subsequent writes. Reload is explicit, never an
// automatic overwrite. Each success updates the revision before the next write.
export class CloudSaves {
  constructor(client, notify = () => {}) { this.client = client; this.notify = notify; this.entries = new Map(); }
  register(row) { this.entries.set(row.id, {revision: row.revision, pending: 0, error: null, tail: Promise.resolve()}); }
  save(id, progress) {
    const entry = this.entries.get(id);
    if (!entry) throw Error("Online student not loaded.");
    const snapshot = JSON.parse(JSON.stringify(progress));
    entry.pending++;
    this.notify();
    entry.tail = entry.tail.then(async () => {
      if (entry.error) return;
      try {
        const row = await this.client.rpc("fact_pop_save_progress", {p_student_id: id, p_revision: entry.revision, p_progress: snapshot});
        entry.revision = row.revision;
        entry.pending--;
      } catch (error) { entry.error = error; }
      this.notify();
    });
    return entry.tail;
  }
  async flush() { await Promise.all([...this.entries.values()].map(e => e.tail)); return !this.dirty; }
  get dirty() { return [...this.entries.values()].some(e => e.pending > 0 || e.error); }
  get failed() { return [...this.entries.values()].some(e => e.error); }
}
