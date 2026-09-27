import React, { useState } from 'react';
import { fetchApi, setToken } from '../api/client';

export interface SessionUser {
  username: string;
  role: string;
}

export const LoginPage: React.FC<{ onLogin: (user: SessionUser) => void }> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetchApi<{ access_token: string; username: string; role: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(res.access_token);
      onLogin({ username: res.username, role: res.role });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
            360
          </div>
          <div>
            <div className="text-sm font-bold text-white">Customer360</div>
            <div className="text-[11px] text-slate-500">Sign in to continue</div>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-300" htmlFor="login-user">
            Username
          </label>
          <input
            id="login-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="mt-1 w-full px-3 py-1.5 text-sm bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-300" htmlFor="login-pass">
            Password
          </label>
          <input
            id="login-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full px-3 py-1.5 text-sm bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2.5" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="text-[11px] text-slate-500 text-center">
          Roles: Admin manages users and pipelines. Analyst explores and exports. Viewer reads dashboards.
        </p>
      </form>
    </div>
  );
};
