import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Link2,
  LogOut,
  Palette,
  PlusCircle,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

import {
  applyBrandTheme,
  BRAND_THEMES,
  type BrandThemeId,
  initializeBrandTheme,
  readStoredBrandTheme,
} from '../lib/brandTheme.ts';

type UserRole = 'ADMIN' | 'OPERATOR' | 'AUDITOR';
type AdminTab = 'companies' | 'users' | 'layout' | 'create' | 'link';

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
  billingBlockedMessage: string | null;
  billingBlockedUntil: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  layoutThemeId?: BrandThemeId | null;
  layoutCompanyName?: string | null;
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

const DEFAULT_BLOCK_DAYS = 15;
const DELETE_CONFIRMATION_PHRASE = 'EXCLUIRUSER';

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

const buildDefaultBlockMessage = (companyName: string, blockedDays: number): string =>
  `Olá! O acesso da empresa ${companyName} ao XBURGERPDV foi bloqueado por inadimplência por ${blockedDays} dia(s). Entre em contato com o financeiro para regularização e liberação do sistema.`;

const isFutureDate = (value: string | null): boolean => {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > Date.now();
};

const formatDateTime = (value: string | null): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '-';
  return parsed.toLocaleString('pt-BR');
};

const AdminGeralPage: React.FC = () => {
  const apiBaseUrl = useMemo(() => resolveApiBaseUrl(), []);

  const [token, setToken] = useState<string>(() => loadStoredToken());
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);

  const [activeTab, setActiveTab] = useState<AdminTab>('companies');
  const [companySearch, setCompanySearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [layoutSearch, setLayoutSearch] = useState('');
  const [layoutSelections, setLayoutSelections] = useState<Record<string, BrandThemeId>>({});
  const [layoutNameSelections, setLayoutNameSelections] = useState<Record<string, string>>({});
  const [layoutActionError, setLayoutActionError] = useState('');
  const [layoutActionSuccess, setLayoutActionSuccess] = useState('');
  const [pendingLayoutOwnerKey, setPendingLayoutOwnerKey] = useState<string | null>(null);
  const [expandedLayoutOwnerKey, setExpandedLayoutOwnerKey] = useState<string | null>(null);

  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  const [activeBrandTheme, setActiveBrandTheme] = useState<BrandThemeId>(() => readStoredBrandTheme());
  const [themeFeedback, setThemeFeedback] = useState('');

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
      const key = user.stateOwnerUserId?.trim() || user.companyName?.trim().toLowerCase() || user.id;
      const existing = groups.get(key);
      const createdAtMs = Number.isFinite(Date.parse(user.createdAt)) ? Date.parse(user.createdAt) : 0;

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

  const resolveGroupOwnerKey = useCallback((group: CompanyUsersGroup): string | null => {
    const ownerKey = group.stateOwnerUserId?.trim() || group.manager?.stateOwnerUserId?.trim() || group.manager?.id || group.operator?.stateOwnerUserId?.trim() || group.operator?.id || null;
    return ownerKey || null;
  }, []);

  const resolveGroupLayoutTheme = useCallback((group: CompanyUsersGroup): BrandThemeId => {
    const rawTheme = group.manager?.layoutThemeId || group.operator?.layoutThemeId || 'red';
    return Object.prototype.hasOwnProperty.call(BRAND_THEMES, rawTheme) ? (rawTheme as BrandThemeId) : 'red';
  }, []);

  const resolveGroupLayoutCompanyName = useCallback((group: CompanyUsersGroup): string => {
    const candidate = group.manager?.layoutCompanyName ?? group.operator?.layoutCompanyName ?? '';
    if (typeof candidate !== 'string') return '';
    return candidate.trim().slice(0, 120);
  }, []);

  const filteredGroupedCompanies = useMemo(() => {
    const query = companySearch.trim().toLowerCase();
    if (!query) return groupedCompanies;

    return groupedCompanies.filter((group) => {
      const manager = `${group.manager?.name || ''} ${group.manager?.email || ''}`.toLowerCase();
      const operator = `${group.operator?.name || ''} ${group.operator?.email || ''}`.toLowerCase();
      return (
        group.companyName.toLowerCase().includes(query) ||
        manager.includes(query) ||
        operator.includes(query) ||
        (group.stateOwnerUserId || '').toLowerCase().includes(query)
      );
    });
  }, [groupedCompanies, companySearch]);

  const filteredLayoutCompanies = useMemo(() => {
    const query = layoutSearch.trim().toLowerCase();
    if (!query) return groupedCompanies;

    return groupedCompanies.filter((group) => {
      const manager = `${group.manager?.name || ''} ${group.manager?.email || ''}`.toLowerCase();
      const operator = `${group.operator?.name || ''} ${group.operator?.email || ''}`.toLowerCase();
      const owner = resolveGroupOwnerKey(group) || '';
      return (
        group.companyName.toLowerCase().includes(query) ||
        manager.includes(query) ||
        operator.includes(query) ||
        owner.toLowerCase().includes(query)
      );
    });
  }, [groupedCompanies, layoutSearch, resolveGroupOwnerKey]);

  const completeCompanyGroups = useMemo(
    () => filteredGroupedCompanies.filter((group) => Boolean(group.manager && group.operator)),
    [filteredGroupedCompanies]
  );

  const incompleteCompanyGroups = useMemo(
    () => filteredGroupedCompanies.filter((group) => !group.manager || !group.operator),
    [filteredGroupedCompanies]
  );

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const details = `${user.name || ''} ${user.email} ${user.companyName || ''} ${formatRoleLabel(user.role)}`.toLowerCase();
      return details.includes(query);
    });
  }, [userSearch, users]);

  const userStats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.isActive).length,
      blockedBilling: users.filter(
        (user) => user.billingBlocked && (!user.billingBlockedUntil || isFutureDate(user.billingBlockedUntil))
      ).length,
      admins: users.filter((user) => user.role === 'ADMIN').length,
      operators: users.filter((user) => user.role === 'OPERATOR').length,
      auditors: users.filter((user) => user.role === 'AUDITOR').length,
    }),
    [users]
  );

  const resetMessages = () => {
    setLoginError('');
    setCreateError('');
    setCreateSuccess('');
    setCompanyActionError('');
    setCompanyActionSuccess('');
    setLinkCompanyError('');
    setLinkCompanySuccess('');
    setLayoutActionError('');
    setLayoutActionSuccess('');
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
      const filteredList = (Array.isArray(payload) ? payload : []).filter(
        (user) => user.email.trim().toLowerCase() !== ADMIN_GERAL_EMAIL
      );
      setUsers(filteredList);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    setActiveBrandTheme(initializeBrandTheme());
  }, []);

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

  useEffect(() => {
    setLayoutSelections((current) => {
      const next: Record<string, BrandThemeId> = {};
      groupedCompanies.forEach((group) => {
        const ownerKey = resolveGroupOwnerKey(group);
        if (!ownerKey) return;
        next[ownerKey] = current[ownerKey] || resolveGroupLayoutTheme(group);
      });
      return next;
    });
  }, [groupedCompanies, resolveGroupLayoutTheme, resolveGroupOwnerKey]);

  useEffect(() => {
    setLayoutNameSelections((current) => {
      const next: Record<string, string> = {};
      groupedCompanies.forEach((group) => {
        const ownerKey = resolveGroupOwnerKey(group);
        if (!ownerKey) return;
        next[ownerKey] =
          typeof current[ownerKey] === 'string' ? current[ownerKey] : resolveGroupLayoutCompanyName(group);
      });
      return next;
    });
  }, [groupedCompanies, resolveGroupLayoutCompanyName, resolveGroupOwnerKey]);

  useEffect(() => {
    if (!themeFeedback) return;
    const timer = window.setTimeout(() => setThemeFeedback(''), 3500);
    return () => window.clearTimeout(timer);
  }, [themeFeedback]);

  useEffect(() => {
    if (!layoutActionSuccess) return;
    const timer = window.setTimeout(() => setLayoutActionSuccess(''), 4000);
    return () => window.clearTimeout(timer);
  }, [layoutActionSuccess]);

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
      setActiveTab('companies');
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
      setActiveTab('companies');
    } catch {
      setCreateError('Falha de conexão com o backend.');
    } finally {
      setIsCreating(false);
    }
  };

  const updateCompanyBilling = async (
    stateOwnerUserId: string,
    payload: { blocked: boolean; message?: string; blockedDays?: number }
  ) => {
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
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const apiError = await extractApiError(response);
        setCompanyActionError(apiError || 'Falha ao atualizar bloqueio financeiro.');
        return;
      }

      setCompanyActionSuccess(
        payload.blocked
          ? 'Empresa bloqueada com mensagem personalizada e prazo.'
          : 'Empresa liberada após regularização.'
      );
      await loadUsers(token);
    } catch {
      setCompanyActionError('Falha de conexão com o backend.');
    } finally {
      setPendingCompanyKey(null);
    }
  };

  const deleteCompanyPermanently = async (
    stateOwnerUserId: string,
    firstConfirmation: string,
    secondConfirmation: string
  ) => {
    if (!token || !stateOwnerUserId || pendingCompanyKey) return;
    setPendingCompanyKey(stateOwnerUserId);
    setCompanyActionError('');
    setCompanyActionSuccess('');

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/users/company/${encodeURIComponent(stateOwnerUserId)}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstConfirmation,
          secondConfirmation,
        }),
      });

      if (!response.ok) {
        const apiError = await extractApiError(response);
        setCompanyActionError(apiError || 'Falha ao excluir empresa de forma definitiva.');
        return;
      }

      const result = (await response.json()) as {
        deletedUsersCount?: number;
        deletedAppStatesCount?: number;
      };

      setCompanyActionSuccess(
        `Exclusão definitiva concluída. Usuários removidos: ${result.deletedUsersCount || 0}. Estados removidos: ${
          result.deletedAppStatesCount || 0
        }.`
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
      setActiveTab('companies');
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

  const handleThemeSelection = (themeId: BrandThemeId) => {
    const applied = applyBrandTheme(themeId);
    setActiveBrandTheme(applied);
    setThemeFeedback(`Tema ${BRAND_THEMES[applied].label} aplicado no site e no /sistema.`);
  };

  const applyCompanyLayoutTheme = async (
    ownerKey: string,
    layoutThemeId: BrandThemeId,
    layoutCompanyNameInput: string
  ) => {
    if (!token || !ownerKey || pendingLayoutOwnerKey) return;
    setPendingLayoutOwnerKey(ownerKey);
    setLayoutActionError('');
    setLayoutActionSuccess('');
    const normalizedLayoutCompanyName = layoutCompanyNameInput.trim().slice(0, 120);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/users/company/${encodeURIComponent(ownerKey)}/layout-theme`,
        {
          method: 'PATCH',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            layoutThemeId,
            layoutCompanyName: normalizedLayoutCompanyName || null,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          setLayoutActionError(
            'Backend desatualizado: rota de Layout Cor por empresa não encontrada. Publique o backend mais recente.'
          );
          return;
        }
        const apiError = await extractApiError(response);
        setLayoutActionError(apiError || 'Falha ao atualizar layout do sistema da empresa selecionada.');
        return;
      }

      const companyLabel = normalizedLayoutCompanyName || 'XBURGER PDV';
      setLayoutActionSuccess(`Layout atualizado para ${BRAND_THEMES[layoutThemeId].label}. Nome exibido: ${companyLabel}.`);
      setExpandedLayoutOwnerKey(null);
      await loadUsers(token);
    } catch {
      setLayoutActionError('Falha de conexão com o backend.');
    } finally {
      setPendingLayoutOwnerKey(null);
    }
  };

  const renderCompanyRows = (groups: CompanyUsersGroup[]) =>
    groups.map((group) => {
      const ownerKey = group.stateOwnerUserId || group.manager?.id || group.operator?.id || null;
      const managerLabel = group.manager
        ? `${group.manager.name || '-'} (${group.manager.email})`
        : 'Não cadastrado';
      const operatorLabel = group.operator
        ? `${group.operator.name || '-'} (${group.operator.email})`
        : 'Não cadastrado';

      const managerActive = group.manager?.isActive ?? false;
      const operatorActive = group.operator?.isActive ?? false;
      const managerBillingBlocked = Boolean(
        group.manager?.billingBlocked &&
          (!group.manager?.billingBlockedUntil || isFutureDate(group.manager.billingBlockedUntil))
      );
      const operatorBillingBlocked = Boolean(
        group.operator?.billingBlocked &&
          (!group.operator?.billingBlockedUntil || isFutureDate(group.operator.billingBlockedUntil))
      );
      const blockedUser = managerBillingBlocked ? group.manager : operatorBillingBlocked ? group.operator : null;
      const isBillingBlocked = Boolean(blockedUser);
      const billingBlockedUntil = blockedUser?.billingBlockedUntil || null;
      const billingBlockedMessage = blockedUser?.billingBlockedMessage?.trim() || '';
      const billingMessageLabel =
        billingBlockedMessage.length > 80 ? `${billingBlockedMessage.slice(0, 80)}...` : billingBlockedMessage;
      const isCompanyDisabled =
        !managerActive && !operatorActive && (group.manager !== null || group.operator !== null);
      const isBusy = Boolean(ownerKey && pendingCompanyKey === ownerKey);
      const hasPair = Boolean(group.manager && group.operator);

      const statusLabel = hasPair
        ? managerActive && operatorActive
          ? 'Ativos'
          : isCompanyDisabled
            ? 'Inativos'
            : 'Parcial'
        : 'Incompleto';

      return (
        <tr key={group.key} className="border-b border-slate-100 align-top">
          <td className="px-4 py-3 font-semibold">{group.companyName}</td>
          <td className={`px-4 py-3 text-sm ${group.manager ? 'text-slate-700' : 'text-amber-700 font-semibold'}`}>
            {managerLabel}
          </td>
          <td className={`px-4 py-3 text-sm ${group.operator ? 'text-slate-700' : 'text-amber-700 font-semibold'}`}>
            {operatorLabel}
          </td>
          <td className="px-4 py-3 text-xs font-mono text-slate-500">
            {group.stateOwnerUserId ? group.stateOwnerUserId.slice(0, 8) : '-'}
          </td>
          <td className="px-4 py-3 text-sm">{statusLabel}</td>
          <td className="px-4 py-3">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                hasPair ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {hasPair ? 'VINCULADO' : 'SOLTO'}
            </span>
          </td>
          <td className="px-4 py-3">
            <div className="space-y-1 text-xs">
              <p
                className={`inline-flex rounded-full px-2.5 py-1 font-black uppercase tracking-[0.1em] ${
                  isBillingBlocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {isBillingBlocked ? 'Bloqueada' : 'Em dia'}
              </p>
              {isBillingBlocked && <p className="text-slate-500">Até: {formatDateTime(billingBlockedUntil)}</p>}
              {isBillingBlocked && billingMessageLabel && (
                <p className="max-w-[280px] text-slate-500">{billingMessageLabel}</p>
              )}
            </div>
          </td>
          <td className="px-4 py-3 text-xs text-slate-500">
            {group.latestCreatedAtMs ? new Date(group.latestCreatedAtMs).toLocaleString('pt-BR') : '-'}
          </td>
          <td className="px-4 py-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!ownerKey || isBusy}
                onClick={() => {
                  if (!ownerKey) return;

                  if (isBillingBlocked) {
                    const releaseConfirmed = window.confirm(`Liberar o acesso da empresa "${group.companyName}" agora?`);
                    if (!releaseConfirmed) return;
                    void updateCompanyBilling(ownerKey, { blocked: false });
                    return;
                  }

                  const blockedDaysRaw = window.prompt('Bloquear por quantos dias?', String(DEFAULT_BLOCK_DAYS));
                  if (blockedDaysRaw === null) return;

                  const blockedDays = Number.parseInt(blockedDaysRaw.trim(), 10);
                  if (!Number.isInteger(blockedDays) || blockedDays < 1 || blockedDays > 3650) {
                    setCompanyActionError('Dias inválidos. Informe um número entre 1 e 3650.');
                    return;
                  }

                  const defaultMessage = buildDefaultBlockMessage(group.companyName, blockedDays);
                  const customMessageRaw = window.prompt(
                    'Mensagem que o usuário verá na tela de bloqueio:',
                    defaultMessage
                  );
                  if (customMessageRaw === null) return;
                  const customMessage = customMessageRaw.trim() || defaultMessage;

                  const blockConfirmed = window.confirm(
                    `Confirmar bloqueio da empresa "${group.companyName}" por ${blockedDays} dia(s)?`
                  );
                  if (!blockConfirmed) return;

                  void updateCompanyBilling(ownerKey, {
                    blocked: true,
                    blockedDays,
                    message: customMessage,
                  });
                }}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBillingBlocked ? 'Liberar' : 'Bloquear'}
              </button>

              <button
                type="button"
                disabled={!ownerKey || isBusy}
                onClick={() => {
                  if (!ownerKey) return;

                  const firstConfirmation = window.prompt(
                    `AÇÃO IRREVERSÍVEL.\nDigite ${DELETE_CONFIRMATION_PHRASE} para excluir todos os dados da empresa "${group.companyName}".`
                  );
                  if (firstConfirmation === null) return;
                  if (firstConfirmation.trim() !== DELETE_CONFIRMATION_PHRASE) {
                    setCompanyActionError(
                      `Primeira confirmação inválida. Digite exatamente ${DELETE_CONFIRMATION_PHRASE}.`
                    );
                    return;
                  }

                  const secondConfirmation = window.prompt(
                    `Confirmação final.\nDigite ${DELETE_CONFIRMATION_PHRASE} novamente para excluir definitivamente.`
                  );
                  if (secondConfirmation === null) return;
                  if (secondConfirmation.trim() !== DELETE_CONFIRMATION_PHRASE) {
                    setCompanyActionError(
                      `Segunda confirmação inválida. Digite exatamente ${DELETE_CONFIRMATION_PHRASE}.`
                    );
                    return;
                  }

                  const finalConfirm = window.confirm(
                    `Última confirmação: excluir a empresa "${group.companyName}" e limpar todos os dados do usuário no banco?`
                  );
                  if (!finalConfirm) return;

                  void deleteCompanyPermanently(ownerKey, firstConfirmation.trim(), secondConfirmation.trim());
                }}
                className="rounded-xl border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
          </td>
        </tr>
      );
    });

  const tabs: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'companies', label: 'Empresas', icon: <Building2 size={18} /> },
    { id: 'users', label: 'Usuários', icon: <Users size={18} /> },
    { id: 'layout', label: 'Layout Cor', icon: <Palette size={18} /> },
    { id: 'create', label: 'Novo Cadastro', icon: <PlusCircle size={18} /> },
    { id: 'link', label: 'Vincular', icon: <Link2 size={18} /> },
  ];

  if (!token || !authUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 p-4 sm:p-6">
        <div className="mx-auto mt-10 max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-red-200">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Admin Geral</h1>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">/admingeral</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">E-mail</label>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                readOnly
                className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600"
                placeholder={ADMIN_GERAL_EMAIL}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Senha</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                placeholder="Senha"
              />
            </div>

            {loginError && <p className="text-sm font-semibold text-red-600">{loginError}</p>}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full rounded-2xl bg-red-600 px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-red-200 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoggingIn ? 'Validando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <aside className="fixed left-0 top-0 hidden h-full w-72 border-r border-slate-200 bg-white/95 px-4 py-6 lg:flex lg:flex-col">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-red-200">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-sm font-black leading-none">xBurger</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Admin Geral</p>
          </div>
        </div>

        <nav className="space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
                activeTab === tab.id
                  ? 'bg-red-50 text-red-700 shadow-sm ring-1 ring-red-100'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-700">
              <ShieldCheck size={16} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-black">{authUser.name || 'Admin Geral'}</p>
              <p className="truncate text-[10px] text-slate-500">{authUser.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      </aside>

      <main className="p-4 pb-28 sm:p-6 lg:ml-72 lg:p-8">
        <header className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Admin Geral</h1>
              <p className="mt-1 text-sm text-slate-500">Gerenciamento central de empresas, usuários e aparência.</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Rota /admingeral</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsThemePanelOpen((value) => !value)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                  isThemePanelOpen
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Settings size={14} />
                Cores do Site
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100 lg:hidden"
              >
                <LogOut size={14} />
                Sair
              </button>
            </div>
          </div>

          {isThemePanelOpen && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Palette size={16} className="text-red-600" />
                <h2 className="text-sm font-black uppercase tracking-[0.12em]">Tema de Cor do Sistema</h2>
              </div>
              <p className="mb-4 text-sm text-slate-500">
                A cor selecionada substitui o vermelho padrão nas classes visuais principais do site e do `/sistema`.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(Object.entries(BRAND_THEMES) as Array<[BrandThemeId, (typeof BRAND_THEMES)[BrandThemeId]]>).map(
                  ([themeId, theme]) => {
                    const isActive = activeBrandTheme === themeId;
                    return (
                      <button
                        key={themeId}
                        type="button"
                        onClick={() => handleThemeSelection(themeId)}
                        className={`rounded-2xl border p-3 text-left transition ${
                          isActive
                            ? 'border-red-300 bg-white shadow-sm ring-2 ring-red-200'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <p className="text-sm font-black">{theme.label}</p>
                        <div className="mt-2 flex items-center gap-1">
                          {(['100', '300', '500', '700'] as const).map((shade) => (
                            <span
                              key={shade}
                              className="h-6 flex-1 rounded-md border border-black/5"
                              style={{ backgroundColor: theme.palette[shade] }}
                            />
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                          {isActive ? 'Tema Atual' : 'Aplicar Tema'}
                        </p>
                      </button>
                    );
                  }
                )}
              </div>
              {themeFeedback && <p className="mt-3 text-sm font-semibold text-emerald-700">{themeFeedback}</p>}
            </div>
          )}
        </header>

        {activeTab === 'companies' && (
          <section className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Empresas Vinculadas</p>
                <div className="mt-2 flex items-end gap-2">
                  <p className="text-3xl font-black">{completeCompanyGroups.length}</p>
                  <p className="mb-1 inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                    <CheckCircle2 size={12} /> Integradas
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Cadastros Soltos</p>
                <div className="mt-2 flex items-end gap-2">
                  <p className="text-3xl font-black">{incompleteCompanyGroups.length}</p>
                  <p className="mb-1 inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                    <AlertCircle size={12} /> Revisar
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Usuários Cadastrados</p>
                <div className="mt-2 flex items-end gap-2">
                  <p className="text-3xl font-black">{users.length}</p>
                  <p className="mb-1 text-xs font-bold text-slate-500">Total geral</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black sm:text-xl">Empresas e vínculos</h2>
                  <p className="text-sm text-slate-500">Controle financeiro, status e ações críticas por empresa.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={companySearch}
                    onChange={(event) => setCompanySearch(event.target.value)}
                    placeholder="Buscar empresa, usuário ou vínculo"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm md:w-72"
                  />
                  <button
                    type="button"
                    onClick={() => void loadUsers(token)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <RefreshCw size={16} />
                    Atualizar
                  </button>
                </div>
              </div>

              {isLoadingUsers ? (
                <p className="text-sm text-slate-500">Carregando dados das empresas...</p>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-2 text-xs font-black uppercase tracking-[0.13em] text-emerald-700">
                      Empresas Vinculadas ({completeCompanyGroups.length})
                    </h3>
                    <div className="overflow-x-auto rounded-2xl border border-slate-100">
                      <table className="min-w-[1100px] w-full text-left text-sm">
                        <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Empresa</th>
                            <th className="px-4 py-3">ADMGERENTE</th>
                            <th className="px-4 py-3">OPERADOR</th>
                            <th className="px-4 py-3">Vínculo</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Par</th>
                            <th className="px-4 py-3">Cobrança</th>
                            <th className="px-4 py-3">Criado em</th>
                            <th className="px-4 py-3">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {completeCompanyGroups.length > 0 ? (
                            renderCompanyRows(completeCompanyGroups)
                          ) : (
                            <tr>
                              <td colSpan={9} className="px-4 py-4 text-sm text-slate-500">
                                Nenhuma empresa vinculada completa encontrada.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs font-black uppercase tracking-[0.13em] text-amber-700">
                      Cadastros Soltos / Incompletos ({incompleteCompanyGroups.length})
                    </h3>
                    <div className="overflow-x-auto rounded-2xl border border-slate-100">
                      <table className="min-w-[1100px] w-full text-left text-sm">
                        <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Empresa</th>
                            <th className="px-4 py-3">ADMGERENTE</th>
                            <th className="px-4 py-3">OPERADOR</th>
                            <th className="px-4 py-3">Vínculo</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Par</th>
                            <th className="px-4 py-3">Cobrança</th>
                            <th className="px-4 py-3">Criado em</th>
                            <th className="px-4 py-3">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {incompleteCompanyGroups.length > 0 ? (
                            renderCompanyRows(incompleteCompanyGroups)
                          ) : (
                            <tr>
                              <td colSpan={9} className="px-4 py-4 text-sm text-slate-500">
                                Nenhum cadastro solto. Tudo vinculado corretamente.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {companyActionSuccess && <p className="mt-3 text-sm font-semibold text-emerald-700">{companyActionSuccess}</p>}
              {companyActionError && <p className="mt-3 text-sm font-semibold text-red-600">{companyActionError}</p>}
            </div>
          </section>
        )}

        {activeTab === 'users' && (
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-black sm:text-xl">Usuários cadastrados</h2>
                <p className="text-sm text-slate-500">Visão completa por perfil, status e bloqueio financeiro.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Buscar nome, e-mail, perfil ou empresa"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm md:w-72"
                />
                <button
                  type="button"
                  onClick={() => void loadUsers(token)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <RefreshCw size={16} />
                  Atualizar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.11em] text-slate-500">Total</p>
                <p className="text-xl font-black">{userStats.total}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.11em] text-slate-500">Ativos</p>
                <p className="text-xl font-black text-emerald-700">{userStats.active}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.11em] text-slate-500">Bloqueio</p>
                <p className="text-xl font-black text-red-700">{userStats.blockedBilling}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.11em] text-slate-500">ADM</p>
                <p className="text-xl font-black">{userStats.admins}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.11em] text-slate-500">Operador</p>
                <p className="text-xl font-black">{userStats.operators}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.11em] text-slate-500">Auditor</p>
                <p className="text-xl font-black">{userStats.auditors}</p>
              </div>
            </div>

            {isLoadingUsers ? (
              <p className="text-sm text-slate-500">Carregando usuários...</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">E-mail</th>
                      <th className="px-4 py-3">Empresa</th>
                      <th className="px-4 py-3">Perfil</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Cobrança</th>
                      <th className="px-4 py-3">Criado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((user) => {
                        const billingBlocked =
                          user.billingBlocked && (!user.billingBlockedUntil || isFutureDate(user.billingBlockedUntil));
                        return (
                          <tr key={user.id} className="border-b border-slate-100">
                            <td className="px-4 py-3 font-semibold">{user.name || '-'}</td>
                            <td className="px-4 py-3 text-slate-600">{user.email}</td>
                            <td className="px-4 py-3 text-slate-600">{user.companyName || '-'}</td>
                            <td className="px-4 py-3">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-700">
                                {formatRoleLabel(user.role)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${
                                  user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {user.isActive ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1 text-xs">
                                <span
                                  className={`rounded-full px-2.5 py-1 font-black uppercase tracking-[0.1em] ${
                                    billingBlocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                                  }`}
                                >
                                  {billingBlocked ? 'Bloqueado' : 'Em dia'}
                                </span>
                                {billingBlocked && (
                                  <p className="text-slate-500">Até: {formatDateTime(user.billingBlockedUntil)}</p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(user.createdAt)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-5 text-sm text-slate-500">
                          Nenhum usuário encontrado para o filtro aplicado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === 'layout' && (
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-black sm:text-xl">Layout Cor por Empresa</h2>
                <p className="text-sm text-slate-500">
                  Selecione uma empresa e aplique a cor apenas no sistema dela (`/sistema`), sem alterar os demais clientes.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={layoutSearch}
                  onChange={(event) => setLayoutSearch(event.target.value)}
                  placeholder="Buscar empresa ou usuário"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm md:w-72"
                />
                <button
                  type="button"
                  onClick={() => void loadUsers(token)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <RefreshCw size={16} />
                  Atualizar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredLayoutCompanies.length > 0 ? (
                filteredLayoutCompanies.map((group) => {
                  const ownerKey = resolveGroupOwnerKey(group);
                  const currentTheme = resolveGroupLayoutTheme(group);
                  const selectedTheme = ownerKey ? layoutSelections[ownerKey] || currentTheme : currentTheme;
                  const currentLayoutCompanyName = resolveGroupLayoutCompanyName(group);
                  const selectedLayoutCompanyName = ownerKey
                    ? layoutNameSelections[ownerKey] ?? currentLayoutCompanyName
                    : currentLayoutCompanyName;
                  const isBusy = Boolean(ownerKey && pendingLayoutOwnerKey === ownerKey);
                  const isPaletteOpen = Boolean(ownerKey && expandedLayoutOwnerKey === ownerKey);

                  return (
                    <article key={group.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3">
                        <p className="text-sm font-black">{group.companyName}</p>
                        <p className="text-[11px] text-slate-500">
                          ADM: {group.manager?.email || 'Não cadastrado'} | OPERADOR: {group.operator?.email || 'Não cadastrado'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Vínculo: {ownerKey ? ownerKey.slice(0, 12) : '-'}
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                            Nome da Empresa no Sistema
                          </label>
                          <input
                            type="text"
                            disabled={!ownerKey || isBusy}
                            value={selectedLayoutCompanyName}
                            onChange={(event) => {
                              if (!ownerKey) return;
                              setLayoutNameSelections((current) => ({
                                ...current,
                                [ownerKey]: event.target.value.slice(0, 120),
                              }));
                            }}
                            placeholder="Ex.: Hamburgueria do Centro"
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          />
                          <p className="text-[11px] text-slate-500">
                            Se ficar vazio, o sistema mostra <span className="font-black">XBURGER PDV</span>.
                          </p>
                        </div>

                        <label className="block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                          Cor do Sistema Desta Empresa
                        </label>
                        <button
                          type="button"
                          disabled={!ownerKey || isBusy}
                          onClick={() => {
                            if (!ownerKey) return;
                            setExpandedLayoutOwnerKey((current) => (current === ownerKey ? null : ownerKey));
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isPaletteOpen ? 'Fechar Cores' : 'Escolher Cor'}
                        </button>

                        {isPaletteOpen && (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {(Object.entries(BRAND_THEMES) as Array<[BrandThemeId, (typeof BRAND_THEMES)[BrandThemeId]]>).map(
                              ([themeId, theme]) => {
                                const isOptionActive = selectedTheme === themeId;
                                return (
                                  <button
                                    key={`${group.key}_${themeId}`}
                                    type="button"
                                    disabled={!ownerKey || isBusy}
                                    onClick={() => {
                                      if (!ownerKey) return;
                                      setLayoutSelections((current) => ({
                                        ...current,
                                        [ownerKey]: themeId,
                                      }));
                                    }}
                                    className={`rounded-xl border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                      isOptionActive
                                        ? 'border-red-300 bg-white ring-2 ring-red-200'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                  >
                                    <p className="text-xs font-black">{theme.label}</p>
                                    <div className="mt-1.5 flex items-center gap-1">
                                      {(['100', '300', '500', '700'] as const).map((shade) => (
                                        <span
                                          key={`${themeId}_${shade}`}
                                          className="h-4 flex-1 rounded-[6px] border border-black/5"
                                          style={{ backgroundColor: theme.palette[shade] }}
                                        />
                                      ))}
                                    </div>
                                    <div
                                      className="mt-2 h-2 rounded-full border border-black/5"
                                      style={{
                                        background: `linear-gradient(90deg, ${theme.palette['300']}, ${theme.palette['600']})`,
                                      }}
                                    />
                                  </button>
                                );
                              }
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500">Atual:</span>
                          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                            {BRAND_THEMES[currentTheme].label}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">Selecionado:</span>
                          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                            {BRAND_THEMES[selectedTheme].label}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500">Nome atual:</span>
                          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                            {currentLayoutCompanyName || 'XBURGER PDV'}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">Nome selecionado:</span>
                          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                            {selectedLayoutCompanyName.trim() || 'XBURGER PDV'}
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={!ownerKey || isBusy}
                          onClick={() => {
                            if (!ownerKey) return;
                            void applyCompanyLayoutTheme(ownerKey, selectedTheme, selectedLayoutCompanyName);
                          }}
                          className="mt-1 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? 'Aplicando...' : 'Aplicar nesta Empresa'}
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                  Nenhuma empresa encontrada para o filtro informado.
                </div>
              )}
            </div>

            {layoutActionSuccess && <p className="text-sm font-semibold text-emerald-700">{layoutActionSuccess}</p>}
            {layoutActionError && <p className="text-sm font-semibold text-red-600">{layoutActionError}</p>}
          </section>
        )}

        {activeTab === 'create' && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-red-600 p-6 text-white sm:p-8">
              <h2 className="text-xl font-black">Cadastrar empresa vinculada</h2>
              <p className="mt-1 text-sm text-red-100">
                Este cadastro cria/atualiza dois acessos da mesma empresa: ADMGERENTE e OPERADOR.
              </p>
            </div>

            <form className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-8" onSubmit={handleCreateUser}>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">
                  Nome da Empresa
                </label>
                <input
                  type="text"
                  required
                  autoComplete="organization"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  placeholder="Ex.: Lanches São Paulo"
                />
              </div>

              <div className="sm:col-span-2 mt-1 rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-blue-700">ADMGERENTE</p>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">E-mail</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={managerEmail}
                  onChange={(event) => setManagerEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  placeholder="admgerente@empresa.com"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">Nome</label>
                <input
                  type="text"
                  autoComplete="name"
                  value={managerName}
                  onChange={(event) => setManagerName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  placeholder="Nome do ADMGERENTE (opcional)"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">Senha</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={managerPassword}
                  onChange={(event) => setManagerPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  placeholder="Senha do ADMGERENTE (mín. 6)"
                />
              </div>

              <div className="sm:col-span-2 mt-1 rounded-2xl border border-violet-100 bg-violet-50/50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-violet-700">OPERADOR</p>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">E-mail</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={operatorEmail}
                  onChange={(event) => setOperatorEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  placeholder="operador@empresa.com"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">Nome</label>
                <input
                  type="text"
                  autoComplete="name"
                  value={operatorName}
                  onChange={(event) => setOperatorName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  placeholder="Nome do OPERADOR (opcional)"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">Senha</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={operatorPassword}
                  onChange={(event) => setOperatorPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  placeholder="Senha do OPERADOR (mín. 6)"
                />
              </div>

              <label className="sm:col-span-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={newIsActive}
                  onChange={(event) => setNewIsActive(event.target.checked)}
                />
                Usuário ativo
              </label>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-2xl bg-red-600 px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-red-200 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreating ? 'Vinculando...' : 'Criar empresa vinculada'}
                </button>
                {createSuccess && <p className="text-sm font-semibold text-emerald-700">{createSuccess}</p>}
                {createError && <p className="text-sm font-semibold text-red-600">{createError}</p>}
              </div>
            </form>
          </section>
        )}

        {activeTab === 'link' && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-blue-600 p-6 text-white sm:p-8">
              <h2 className="text-xl font-black">Vincular usuários já existentes</h2>
              <p className="mt-1 text-sm text-blue-100">
                Use este bloco para unir dois cadastros antigos (ADMGERENTE + OPERADOR) na mesma empresa.
              </p>
            </div>

            <form className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-8" onSubmit={handleLinkExistingCompanyUsers}>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">Nome da empresa</label>
                <input
                  type="text"
                  required
                  autoComplete="organization"
                  value={linkCompanyName}
                  onChange={(event) => setLinkCompanyName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  placeholder="Nome da empresa"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">E-mail do ADMGERENTE</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={linkManagerEmail}
                  onChange={(event) => setLinkManagerEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  placeholder="gerente@empresa.com"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">E-mail do OPERADOR</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={linkOperatorEmail}
                  onChange={(event) => setLinkOperatorEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  placeholder="operador@empresa.com"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={isLinkingCompany}
                  className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLinkingCompany ? 'Vinculando...' : 'Vincular existentes'}
                </button>
                {linkCompanySuccess && <p className="text-sm font-semibold text-emerald-700">{linkCompanySuccess}</p>}
                {linkCompanyError && <p className="text-sm font-semibold text-red-600">{linkCompanyError}</p>}
              </div>
            </form>
          </section>
        )}
      </main>

      <nav className="fixed bottom-4 left-1/2 z-40 flex w-[95%] -translate-x-1/2 items-center justify-between rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl lg:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] ${
              activeTab === tab.id ? 'bg-red-600 text-white' : 'text-slate-500'
            }`}
          >
            {tab.icon}
            <span>{tab.label.split(' ')[0]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default AdminGeralPage;
