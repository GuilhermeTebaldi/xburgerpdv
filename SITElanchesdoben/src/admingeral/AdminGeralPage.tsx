import React, { useEffect, useMemo, useState } from 'react';

type UserRole = 'ADMIN' | 'OPERATOR' | 'AUDITOR';

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

interface ManagedUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

const ADMIN_GERAL_TOKEN_KEY = 'xburger_admingeral_token';
const DEFAULT_API_BASE_URL = 'https://xburger-saas-backend.onrender.com';
type NewUserRole = 'OPERATOR' | 'ADMIN';

const resolveApiBaseUrl = (): string => {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const normalized = raw ? raw.replace(/\/+$/, '') : '';
  return normalized || DEFAULT_API_BASE_URL;
};

const extractApiError = async (response: Response): Promise<string | null> => {
  try {
    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
    if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
    return null;
  } catch {
    return null;
  }
};

const loadStoredToken = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return (window.sessionStorage.getItem(ADMIN_GERAL_TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
};

const storeToken = (token: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ADMIN_GERAL_TOKEN_KEY, token);
  } catch {
    // ignore
  }
};

const clearStoredToken = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ADMIN_GERAL_TOKEN_KEY);
  } catch {
    // ignore
  }
};

const formatRoleLabel = (role: UserRole): string => {
  if (role === 'ADMIN') return 'ADMGERENTE';
  if (role === 'OPERATOR') return 'OPERADOR';
  return 'AUDITOR';
};

const AdminGeralPage: React.FC = () => {
  const apiBaseUrl = useMemo(() => resolveApiBaseUrl(), []);
  const [token, setToken] = useState<string>(() => loadStoredToken());
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<NewUserRole>('OPERATOR');
  const [newIsActive, setNewIsActive] = useState(true);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const resetMessages = () => {
    setLoginError('');
    setCreateError('');
    setCreateSuccess('');
  };

  const loadSession = async (activeToken: string): Promise<boolean> => {
    const meResponse = await fetch(`${apiBaseUrl}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${activeToken}`,
      },
    });

    if (!meResponse.ok) {
      const apiError = await extractApiError(meResponse);
      throw new Error(apiError || 'Falha ao validar sessão do administrador.');
    }

    const mePayload = (await meResponse.json()) as AuthUser;
    if (mePayload.role !== 'ADMIN') {
      throw new Error('Somente usuários ADMIN podem acessar o /admingeral.');
    }

    setAuthUser(mePayload);
    return true;
  };

  const loadUsers = async (activeToken: string) => {
    setIsLoadingUsers(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/users?includeInactive=true`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
      });

      if (!response.ok) {
        const apiError = await extractApiError(response);
        throw new Error(apiError || 'Falha ao carregar usuários.');
      }

      const payload = (await response.json()) as ManagedUser[];
      setUsers(Array.isArray(payload) ? payload : []);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        await loadSession(token);
        await loadUsers(token);
      } catch {
        clearStoredToken();
        setToken('');
        setAuthUser(null);
        setUsers([]);
      }
    })();
  }, [token]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    resetMessages();

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      if (!response.ok) {
        const apiError = await extractApiError(response);
        setLoginError(apiError || 'Credenciais inválidas.');
        return;
      }

      const payload = (await response.json()) as { token?: unknown };
      const issuedToken = typeof payload.token === 'string' ? payload.token.trim() : '';
      if (!issuedToken) {
        setLoginError('Resposta inválida do servidor de autenticação.');
        return;
      }

      await loadSession(issuedToken);
      await loadUsers(issuedToken);
      storeToken(issuedToken);
      setToken(issuedToken);
      setPassword('');
    } catch {
      setLoginError('Falha de conexão com o backend.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || isCreating) return;
    setIsCreating(true);
    setCreateError('');
    setCreateSuccess('');

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/users`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          password: newPassword,
          name: newName.trim() || undefined,
          role: newRole,
          isActive: newIsActive,
        }),
      });

      if (!response.ok) {
        const apiError = await extractApiError(response);
        setCreateError(apiError || 'Falha ao criar usuário.');
        return;
      }

      setCreateSuccess('Usuário criado com sucesso.');
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('OPERATOR');
      setNewIsActive(true);
      await loadUsers(token);
    } catch {
      setCreateError('Falha de conexão com o backend.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = () => {
    clearStoredToken();
    setToken('');
    setAuthUser(null);
    setUsers([]);
    resetMessages();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        <header className="bg-white border border-slate-200 rounded-3xl p-6">
          <h1 className="text-3xl font-black tracking-tight">Admin Geral</h1>
          <p className="text-sm text-slate-500 mt-1">
            Rota: <span className="font-semibold text-slate-700">/admingeral</span>
          </p>
        </header>

        {!token || !authUser ? (
          <section className="bg-white border border-slate-200 rounded-3xl p-6">
            <h2 className="text-xl font-black mb-4">Entrar como ADMGERENTE</h2>
            <form className="space-y-4" onSubmit={handleLogin}>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                placeholder="admin@xburgerpdv.com.br"
              />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                placeholder="Senha"
              />
              {loginError && (
                <p className="text-sm font-semibold text-red-600">{loginError}</p>
              )}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="px-6 py-3 rounded-2xl bg-red-600 text-white font-bold disabled:opacity-60"
              >
                {isLoggingIn ? 'Validando...' : 'Entrar'}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="bg-white border border-slate-200 rounded-3xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">Sessão ativa</h2>
                  <p className="text-sm text-slate-600">
                    {authUser.name || 'Administrador'} ({authUser.email}) - {formatRoleLabel(authUser.role)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-5 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Sair
                </button>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-3xl p-6">
              <h2 className="text-xl font-black mb-4">Cadastrar usuário</h2>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleCreateUser}>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                  placeholder="novo.usuario@xburgerpdv.com.br"
                />
                <input
                  type="text"
                  autoComplete="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                  placeholder="Nome (opcional)"
                />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                  placeholder="Senha (mín. 6)"
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as NewUserRole)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                >
                  <option value="OPERATOR">OPERADOR</option>
                  <option value="ADMIN">ADMGERENTE</option>
                </select>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={newIsActive}
                    onChange={(e) => setNewIsActive(e.target.checked)}
                  />
                  Usuário ativo
                </label>
                <div className="md:col-span-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-6 py-3 rounded-2xl bg-red-600 text-white font-bold disabled:opacity-60"
                  >
                    {isCreating ? 'Criando...' : 'Criar usuário'}
                  </button>
                  {createSuccess && <p className="text-sm font-semibold text-emerald-700">{createSuccess}</p>}
                  {createError && <p className="text-sm font-semibold text-red-600">{createError}</p>}
                </div>
              </form>
            </section>

            <section className="bg-white border border-slate-200 rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black">Usuários cadastrados</h2>
                <button
                  type="button"
                  onClick={() => void loadUsers(token)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                >
                  Atualizar
                </button>
              </div>

              {isLoadingUsers ? (
                <p className="text-sm text-slate-500">Carregando...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-3">Nome</th>
                        <th className="py-2 pr-3">E-mail</th>
                        <th className="py-2 pr-3">Role</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Criado em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b border-slate-100">
                          <td className="py-2 pr-3">{user.name || '-'}</td>
                          <td className="py-2 pr-3">{user.email}</td>
                          <td className="py-2 pr-3">{formatRoleLabel(user.role)}</td>
                          <td className="py-2 pr-3">{user.isActive ? 'Ativo' : 'Inativo'}</td>
                          <td className="py-2 pr-3">
                            {new Date(user.createdAt).toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminGeralPage;
