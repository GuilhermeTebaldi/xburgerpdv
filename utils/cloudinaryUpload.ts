const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_LOCAL_DATA_URL_LENGTH = 200_000;
const JPEG_QUALITY_STEPS = [0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36, 0.3];
const MAX_DIMENSION_STEPS = [1600, 1280, 1024, 896, 768, 640, 512, 420, 360, 320];

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

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Falha ao processar dimensões da imagem.'));
    };

    image.src = objectUrl;
  });

const toJpegDataUrl = (
  image: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  quality: number
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Navegador sem suporte para compressão de imagem.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/jpeg', quality);
};

const compressImageToFitLimit = async (file: File, maxLength: number): Promise<string> => {
  const image = await loadImageFromFile(file);
  const maxSourceDimension = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
  if (maxSourceDimension <= 0) {
    throw new Error('Não foi possível ler a imagem selecionada.');
  }

  let bestCandidate = '';
  const triedSizes = new Set<string>();

  for (const maxDimension of MAX_DIMENSION_STEPS) {
    const cap = Math.min(maxDimension, maxSourceDimension);
    const scale = cap / maxSourceDimension;
    const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const sizeKey = `${targetWidth}x${targetHeight}`;
    if (triedSizes.has(sizeKey)) continue;
    triedSizes.add(sizeKey);

    for (const quality of JPEG_QUALITY_STEPS) {
      const candidate = toJpegDataUrl(image, targetWidth, targetHeight, quality);
      if (!bestCandidate || candidate.length < bestCandidate.length) {
        bestCandidate = candidate;
      }
      if (candidate.length <= maxLength) {
        return candidate;
      }
    }
  }

  if (bestCandidate && bestCandidate.length <= maxLength) {
    return bestCandidate;
  }

  throw new Error('Imagem muito grande para salvar no modo local. Use uma imagem menor.');
};

export const isCloudinaryUploadConfigured = (): boolean => getCloudinaryConfig() !== null;

export const convertImageFileToDataUrl = async (file: File): Promise<string> => {
  if (!file) {
    throw new Error('Arquivo de imagem não informado.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  if (rawDataUrl.length <= MAX_LOCAL_DATA_URL_LENGTH) {
    return rawDataUrl;
  }

  if (typeof document === 'undefined') {
    throw new Error('Imagem muito grande para salvar localmente.');
  }

  return compressImageToFitLimit(file, MAX_LOCAL_DATA_URL_LENGTH);
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
