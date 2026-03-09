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
  companyName: string | null;
  stateOwnerUserId: string | null;
  billingBlocked: boolean;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

interface CompanyUsersGroup {
  key: string;
  companyName: string;
  stateOwnerUserId: string | null;
  manager: ManagedUser | null;
  operator: ManagedUser | null;
  latestCreatedAtMs: number;
}

const ADMIN_GERAL_TOKEN_KEY = 'xburger_admingeral_token';
const DEFAULT_API_BASE_URL = 'https://xburger-saas-backend.onrender.com';
const ADMIN_GERAL_EMAIL = 'xburger.admin@geral.com';

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

  const [email, setEmail] = useState(ADMIN_GERAL_EMAIL);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [operatorEmail, setOperatorEmail] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [operatorPassword, setOperatorPassword] = useState('');
  const [newIsActive, setNewIsActive] = useState(true);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [companyActionError, setCompanyActionError] = useState('');
  const [companyActionSuccess, setCompanyActionSuccess] = useState('');
  const [pendingCompanyKey, setPendingCompanyKey] = useState<string | null>(null);
  const [linkCompanyName, setLinkCompanyName] = useState('');
  const [linkManagerEmail, setLinkManagerEmail] = useState('');
  const [linkOperatorEmail, setLinkOperatorEmail] = useState('');
  const [isLinkingCompany, setIsLinkingCompany] = useState(false);
  const [linkCompanyError, setLinkCompanyError] = useState('');
  const [linkCompanySuccess, setLinkCompanySuccess] = useState('');

  const groupedCompanies = useMemo<CompanyUsersGroup[]>(() => {
    const groups = new Map<string, CompanyUsersGroup>();

    users.forEach((user) => {
      const key =
        user.stateOwnerUserId?.trim() ||
        user.companyName?.trim().toLowerCase() ||
        user.id;

      const existing = groups.get(key);
      const createdAtMs = Number.isFinite(Date.parse(user.createdAt))
        ? Date.parse(user.createdAt)
        : 0;

      const group: CompanyUsersGroup = existing || {
        key,
        companyName: user.companyName?.trim() || 'Empresa sem nome',
        stateOwnerUserId: user.stateOwnerUserId,
        manager: null,
        operator: null,
        latestCreatedAtMs: createdAtMs,
      };

      if (!group.companyName || group.companyName === 'Empresa sem nome') {
        group.companyName = user.companyName?.trim() || group.companyName;
      }
      if (!group.stateOwnerUserId && user.stateOwnerUserId) {
        group.stateOwnerUserId = user.stateOwnerUserId;
      }
      if (createdAtMs > group.latestCreatedAtMs) {
        group.latestCreatedAtMs = createdAtMs;
      }

      if (user.role === 'ADMIN') {
        group.manager = user;
      } else if (user.role === 'OPERATOR') {
        group.operator = user;
      }

      groups.set(key, group);
    });

    return Array.from(groups.values()).sort((a, b) => b.latestCreatedAtMs - a.latestCreatedAtMs);
  }, [users]);

  const resetMessages = () => {
    setLoginError('');
    setCreateError('');
    setCreateSuccess('');
    setCompanyActionError('');
    setCompanyActionSuccess('');
    setLinkCompanyError('');
    setLinkCompanySuccess('');
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
    if (mePayload.email.trim().toLowerCase() !== ADMIN_GERAL_EMAIL) {
      throw new Error('Acesso restrito ao Admin Geral da gestão.');
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
      const filteredUsers = (Array.isArray(payload) ? payload : []).filter(
        (user) => user.email.trim().toLowerCase() !== ADMIN_GERAL_EMAIL
      );
      setUsers(filteredUsers);
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
      const response = await fetch(`${apiBaseUrl}/api/v1/users/company`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          companyName: companyName.trim(),
          manager: {
            email: managerEmail.trim().toLowerCase(),
            password: managerPassword,
            name: managerName.trim() || undefined,
          },
          operator: {
            email: operatorEmail.trim().toLowerCase(),
            password: operatorPassword,
            name: operatorName.trim() || undefined,
          },
          isActive: newIsActive,
        }),
      });

      if (!response.ok) {
        const apiError = await extractApiError(response);
        setCreateError(apiError || 'Falha ao criar usuário.');
        return;
      }

      setCreateSuccess('Empresa vinculada com ADMGERENTE + OPERADOR criada com sucesso.');
      setCompanyName('');
      setManagerEmail('');
      setManagerName('');
      setManagerPassword('');
      setOperatorEmail('');
      setOperatorName('');
      setOperatorPassword('');
      setNewIsActive(true);
      await loadUsers(token);
    } catch {
      setCreateError('Falha de conexão com o backend.');
    } finally {
      setIsCreating(false);
    }
  };

  const updateCompanyBilling = async (stateOwnerUserId: string, blocked: boolean) => {
    if (!token || !stateOwnerUserId || pendingCompanyKey) return;
    setPendingCompanyKey(stateOwnerUserId);
    setCompanyActionError('');
    setCompanyActionSuccess('');
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/users/company/${encodeURIComponent(stateOwnerUserId)}/billing`,
        {
          method: 'PATCH',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ blocked }),
        }
      );

      if (!response.ok) {
        const apiError = await extractApiError(response);
        setCompanyActionError(apiError || 'Falha ao atualizar bloqueio financeiro.');
        return;
      }

      setCompanyActionSuccess(
        blocked ? 'Empresa bloqueada por inadimplência.' : 'Empresa liberada após regularização.'
      );
      await loadUsers(token);
    } catch {
      setCompanyActionError('Falha de conexão com o backend.');
    } finally {
      setPendingCompanyKey(null);
    }
  };

  const updateCompanyStatus = async (stateOwnerUserId: string, isActive: boolean) => {
    if (!token || !stateOwnerUserId || pendingCompanyKey) return;
    setPendingCompanyKey(stateOwnerUserId);
    setCompanyActionError('');
    setCompanyActionSuccess('');
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/users/company/${encodeURIComponent(stateOwnerUserId)}/status`,
        {
          method: 'PATCH',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isActive }),
        }
      );

      if (!response.ok) {
        const apiError = await extractApiError(response);
        setCompanyActionError(apiError || 'Falha ao atualizar status da empresa.');
        return;
      }

      setCompanyActionSuccess(
        isActive ? 'Empresa reativada com sucesso.' : 'Empresa excluída (desativada) com sucesso.'
      );
      await loadUsers(token);
    } catch {
      setCompanyActionError('Falha de conexão com o backend.');
    } finally {
      setPendingCompanyKey(null);
    }
  };

  const handleLinkExistingCompanyUsers = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || isLinkingCompany) return;
    setIsLinkingCompany(true);
    setLinkCompanyError('');
    setLinkCompanySuccess('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/users/company/link`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          companyName: linkCompanyName.trim(),
          managerEmail: linkManagerEmail.trim().toLowerCase(),
          operatorEmail: linkOperatorEmail.trim().toLowerCase(),
        }),
      });

      if (!response.ok) {
        const apiError = await extractApiError(response);
        setLinkCompanyError(apiError || 'Falha ao vincular usuários existentes.');
        return;
      }

      setLinkCompanySuccess('Usuários existentes vinculados com sucesso na mesma empresa.');
      setLinkCompanyName('');
      setLinkManagerEmail('');
      setLinkOperatorEmail('');
      await loadUsers(token);
    } catch {
      setLinkCompanyError('Falha de conexão com o backend.');
    } finally {
      setIsLinkingCompany(false);
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
                readOnly
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-100 text-slate-600"
                placeholder={ADMIN_GERAL_EMAIL}
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
              <h2 className="text-xl font-black mb-2">Cadastrar empresa vinculada</h2>
              <p className="text-sm text-slate-500 mb-4">
                Este cadastro cria/atualiza dois acessos da mesma empresa: <strong>ADMGERENTE</strong> e <strong>OPERADOR</strong>.
              </p>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleCreateUser}>
                <input
                  type="text"
                  required
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 md:col-span-2"
                  placeholder="Nome da empresa (ex.: Lanches São Paulo)"
                />

                <div className="md:col-span-2 mt-2">
                  <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">ADMGERENTE</h3>
                </div>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={managerEmail}
                  onChange={(e) => setManagerEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                  placeholder="admgerente@empresa.com"
                />
                <input
                  type="text"
                  autoComplete="name"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                  placeholder="Nome do ADMGERENTE (opcional)"
                />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={managerPassword}
                  onChange={(e) => setManagerPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                  placeholder="Senha do ADMGERENTE (mín. 6)"
                />

                <div className="md:col-span-2 mt-2">
                  <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">OPERADOR</h3>
                </div>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={operatorEmail}
                  onChange={(e) => setOperatorEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                  placeholder="operador@empresa.com"
                />
                <input
                  type="text"
                  autoComplete="name"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                  placeholder="Nome do OPERADOR (opcional)"
                />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={operatorPassword}
                  onChange={(e) => setOperatorPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                  placeholder="Senha do OPERADOR (mín. 6)"
                />
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
                    {isCreating ? 'Vinculando...' : 'Criar empresa vinculada'}
                  </button>
                  {createSuccess && <p className="text-sm font-semibold text-emerald-700">{createSuccess}</p>}
                  {createError && <p className="text-sm font-semibold text-red-600">{createError}</p>}
                </div>
              </form>
            </section>

            <section className="bg-white border border-slate-200 rounded-3xl p-6">
              <h2 className="text-xl font-black mb-2">Vincular usuários já existentes</h2>
              <p className="text-sm text-slate-500 mb-4">
                Use este bloco para unir dois cadastros antigos (ADMGERENTE + OPERADOR) na mesma empresa.
              </p>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleLinkExistingCompanyUsers}>
                <input
                  type="text"
                  required
                  autoComplete="organization"
                  value={linkCompanyName}
                  onChange={(e) => setLinkCompanyName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 md:col-span-2"
                  placeholder="Nome da empresa"
                />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={linkManagerEmail}
                  onChange={(e) => setLinkManagerEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                  placeholder="E-mail do ADMGERENTE"
                />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={linkOperatorEmail}
                  onChange={(e) => setLinkOperatorEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50"
                  placeholder="E-mail do OPERADOR"
                />
                <div className="md:col-span-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isLinkingCompany}
                    className="px-6 py-3 rounded-2xl bg-slate-900 text-white font-bold disabled:opacity-60"
                  >
                    {isLinkingCompany ? 'Vinculando...' : 'Vincular existentes'}
                  </button>
                  {linkCompanySuccess && (
                    <p className="text-sm font-semibold text-emerald-700">{linkCompanySuccess}</p>
                  )}
                  {linkCompanyError && (
                    <p className="text-sm font-semibold text-red-600">{linkCompanyError}</p>
                  )}
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
                        <th className="py-2 pr-3">Empresa</th>
                        <th className="py-2 pr-3">ADMGERENTE</th>
                        <th className="py-2 pr-3">OPERADOR</th>
                        <th className="py-2 pr-3">Vínculo</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Cobrança</th>
                        <th className="py-2 pr-3">Criado em</th>
                        <th className="py-2 pr-3">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedCompanies.map((group) => {
                        const ownerKey =
                          group.stateOwnerUserId || group.manager?.id || group.operator?.id || null;
                        const managerLabel = group.manager
                          ? `${group.manager.name || '-'} (${group.manager.email})`
                          : 'Não cadastrado';
                        const operatorLabel = group.operator
                          ? `${group.operator.name || '-'} (${group.operator.email})`
                          : 'Não cadastrado';
                        const managerActive = group.manager?.isActive ?? false;
                        const operatorActive = group.operator?.isActive ?? false;
                        const isBillingBlocked =
                          (group.manager?.billingBlocked ?? false) || (group.operator?.billingBlocked ?? false);
                        const isCompanyDisabled =
                          !managerActive && !operatorActive && (group.manager !== null || group.operator !== null);
                        const isBusy = Boolean(ownerKey && pendingCompanyKey === ownerKey);

                        const statusLabel =
                          group.manager && group.operator
                            ? managerActive && operatorActive
                              ? 'Ativos'
                              : isCompanyDisabled
                                ? 'Inativos'
                                : 'Parcial'
                            : 'Incompleto';

                        return (
                          <tr key={group.key} className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-semibold">{group.companyName}</td>
                            <td className="py-2 pr-3">{managerLabel}</td>
                            <td className="py-2 pr-3">{operatorLabel}</td>
                            <td className="py-2 pr-3">
                              {group.stateOwnerUserId ? group.stateOwnerUserId.slice(0, 8) : '-'}
                            </td>
                            <td className="py-2 pr-3">{statusLabel}</td>
                            <td className="py-2 pr-3">
                              {isBillingBlocked ? 'Bloqueada' : 'Em dia'}
                            </td>
                            <td className="py-2 pr-3">
                              {group.latestCreatedAtMs
                                ? new Date(group.latestCreatedAtMs).toLocaleString('pt-BR')
                                : '-'}
                            </td>
                            <td className="py-2 pr-3">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={!ownerKey || isBusy}
                                  onClick={() => {
                                    if (!ownerKey) return;
                                    void updateCompanyBilling(ownerKey, !isBillingBlocked);
                                  }}
                                  className="px-3 py-1 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-50"
                                >
                                  {isBillingBlocked ? 'Liberar' : 'Bloquear'}
                                </button>
                                <button
                                  type="button"
                                  disabled={!ownerKey || isBusy}
                                  onClick={() => {
                                    if (!ownerKey) return;
                                    void updateCompanyStatus(ownerKey, isCompanyDisabled);
                                  }}
                                  className="px-3 py-1 rounded-lg border border-red-300 text-red-700 text-xs font-semibold disabled:opacity-50"
                                >
                                  {isCompanyDisabled ? 'Reativar' : 'Excluir'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {companyActionSuccess && (
                <p className="text-sm font-semibold text-emerald-700 mt-3">{companyActionSuccess}</p>
              )}
              {companyActionError && (
                <p className="text-sm font-semibold text-red-600 mt-3">{companyActionError}</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminGeralPage;
