import { BASE_URL, getApiToken } from './credentials';
import {
  ApiError,
  request,
  storageErrorCode,
  storageUrl,
  transport,
  trustedApiUrl,
  unwrap,
} from './request';

export interface Quota {
  maxFileSize: number;
  concurrencyLimit: number;
  dailyFileQuota: number;
  dailyUsedFiles: number;
  dailyPageQuota: number;
  dailyUsedPages: number;
}
export type FileKind = 'source' | 'translated' | 'compare';
export type TaskStatus =
  | 'preparing'
  | 'queued'
  | 'extracting'
  | 'translating'
  | 'rendering'
  | 'archiving'
  | 'completed'
  | 'failed';
export interface Task {
  id: string;
  filename: string;
  targetLanguage: string;
  status: TaskStatus;
  progress: number | null;
  error: { code: string | null; message: string | null } | null;
  files: Record<FileKind, string | null>;
}
export interface SignedUpload {
  key: string;
  url: string;
  headers: Record<string, string>;
  method: 'PUT';
}
export interface CreateTranslation {
  key: string;
  name: string;
  targetLanguage: string;
  extractBackend?: 'native' | 'mineru' | 'zhipu';
}

export const getQuota = () => request<Quota>('/api/v1/me');
export const getPdfUploadUrl = (data: { name: string; size: number }) =>
  request<SignedUpload>('/api/v1/uploads', data);
export const createTranslateTask = (data: CreateTranslation) =>
  request<Task>('/api/v1/translations', data);
export const getTranslateStatus = ({ pdfId }: { pdfId: string }) =>
  request<Task>(`/api/v1/translations/${encodeURIComponent(pdfId)}`);

export async function uploadPdf({ upload, file }: { upload: SignedUpload; file: Uint8Array }) {
  if (upload.method !== 'PUT')
    throw new ApiError(0, 'error_invalid_upload_method', 0, {
      operation: 'upload',
      failure: 'invalid-response',
    });
  // Only the declared PDF content header is valid; never forward server-supplied auth/cookies.
  const type = Object.entries(upload.headers).find(
    ([name]) => name.toLowerCase() === 'content-type',
  )?.[1];
  if (type !== 'application/pdf')
    throw new ApiError(0, 'error_invalid_upload_headers', 0, {
      operation: 'upload',
      failure: 'invalid-response',
    });
  const response = await transport(
    'PUT',
    storageUrl(upload.url),
    {
      'Content-Type': type,
    },
    file,
    false,
    'upload',
  );
  if (response.status < 200 || response.status >= 300)
    throw new ApiError(response.status, 'error_upload_failed', 0, {
      operation: 'upload',
      failure: 'http',
      storageCode: storageErrorCode(response.body),
    });
}

export async function downloadPdf(apiUrl: string): Promise<ArrayBuffer> {
  const url = trustedApiUrl(apiUrl);
  // Accept only documented file endpoints, never arbitrary token-bearing URLs.
  if (
    !/^\/api\/v1\/translations\/[^/]+\/files\/(source|translated|compare)$/.test(
      new URL(url).pathname,
    )
  ) {
    throw new ApiError(0, 'error_invalid_download_url');
  }
  const token = await getApiToken();
  const redirect = await transport(
    'GET',
    url,
    { Authorization: `Bearer ${token}`, Origin: BASE_URL },
    undefined,
    false,
    'download-url',
  );
  if (redirect.status !== 302) {
    unwrap(redirect, 'download-url');
    throw new ApiError(redirect.status, 'error_missing_download_redirect', 0, {
      operation: 'download-url',
      failure: 'invalid-response',
    });
  }
  const location = storageUrl(redirect.header('Location'));
  const file = await transport('GET', location, {}, undefined, true, 'download');
  if (
    file.status !== 200 ||
    Object.prototype.toString.call(file.body) !== '[object ArrayBuffer]' ||
    !(file.body as ArrayBuffer).byteLength
  ) {
    throw new ApiError(file.status, 'error_download_failed', 0, {
      operation: 'download',
      failure: file.status === 200 ? 'invalid-response' : 'http',
    });
  }
  return file.body as ArrayBuffer;
}

export default {
  getQuota,
  getPdfUploadUrl,
  createTranslateTask,
  getTranslateStatus,
  uploadPdf,
  downloadPdf,
};
