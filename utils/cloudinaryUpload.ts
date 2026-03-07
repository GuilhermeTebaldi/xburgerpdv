const DEFAULT_TIMEOUT_MS = 20_000;

const getEnvValue = (key: string): string | undefined => {
  const raw = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[key];
  const normalized = raw?.trim();
  return normalized ? normalized : undefined;
};

const getCloudinaryConfig = (): {
  cloudName: string;
  uploadPreset: string;
  folder?: string;
} | null => {
  const cloudName = getEnvValue('VITE_CLOUDINARY_CLOUD_NAME');
  const uploadPreset = getEnvValue('VITE_CLOUDINARY_UPLOAD_PRESET');
  const folder = getEnvValue('VITE_CLOUDINARY_FOLDER');

  if (!cloudName || !uploadPreset) return null;
  return { cloudName, uploadPreset, folder };
};

const extractErrorMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const errorObj =
    record.error && typeof record.error === 'object' && !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : null;
  const directMessage = typeof record.message === 'string' ? record.message.trim() : '';
  if (directMessage) return directMessage;
  const nestedMessage = typeof errorObj?.message === 'string' ? errorObj.message.trim() : '';
  if (nestedMessage) return nestedMessage;
  return null;
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Falha ao processar imagem da galeria.'));
    };
    reader.onerror = () => {
      reject(new Error('Falha ao ler arquivo selecionado.'));
    };
    reader.readAsDataURL(file);
  });

export const isCloudinaryUploadConfigured = (): boolean => getCloudinaryConfig() !== null;

export const convertImageFileToDataUrl = async (file: File): Promise<string> => {
  if (!file) {
    throw new Error('Arquivo de imagem não informado.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido.');
  }
  return readFileAsDataUrl(file);
};

export const uploadImageToCloudinary = async (
  file: File,
  options?: { timeoutMs?: number }
): Promise<string> => {
  if (!file) {
    throw new Error('Arquivo de imagem não informado.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido.');
  }

  const config = getCloudinaryConfig();
  if (!config) {
    throw new Error(
      'Cloudinary não configurado. Defina VITE_CLOUDINARY_CLOUD_NAME e VITE_CLOUDINARY_UPLOAD_PRESET.'
    );
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', config.uploadPreset);
    if (config.folder) {
      formData.append('folder', config.folder);
    }

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
      {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      }
    );

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const message = extractErrorMessage(payload) || 'Falha ao enviar imagem para Cloudinary.';
      throw new Error(message);
    }

    const secureUrl =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? String((payload as Record<string, unknown>).secure_url || '').trim()
        : '';

    if (!secureUrl) {
      throw new Error('Cloudinary não retornou URL da imagem.');
    }

    return secureUrl;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Tempo esgotado ao enviar imagem para Cloudinary.');
    }
    throw error instanceof Error ? error : new Error('Falha inesperada no upload da imagem.');
  } finally {
    window.clearTimeout(timer);
  }
};
