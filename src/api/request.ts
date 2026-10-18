import { getString } from '../utils/locale';
import { BASE_URL, getApiToken } from './credentials';

export type RequestOperation =
  | 'quota'
  | 'languages'
  | 'upload-url'
  | 'upload'
  | 'create'
  | 'query'
  | 'cancel'
  | 'retry'
  | 'download-url'
  | 'download';

type Failure =
  'http' | 'invalid-response' | 'network' | 'timeout' | 'aborted' | 'setup' | 'redirect';
type ErrorDetails = {
  operation?: RequestOperation;
  failure?: Failure;
  exception?: string;
  result?: number;
  storageCode?: string;
};

/** Never include exception messages: Gecko may embed credentials or signed URLs. */
function safeException(error: unknown): Pick<ErrorDetails, 'exception' | 'result'> {
  const value = error as { name?: unknown; result?: unknown } | null;
  const name = value?.name;
  return {
    exception:
      typeof name === 'string' &&
      /^(?:Error|TypeError|RangeError|DOMException|AbortError|TimeoutError|NetworkError|SecurityError|InvalidStateError|NotSupportedError|NS_ERROR_[A-Z_]+)$/.test(
        name,
      )
        ? name
        : 'Error',
    ...(typeof value?.result === 'number' && Number.isSafeInteger(value.result)
      ? { result: value.result }
      : {}),
  };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public key: string,
    public retryAfter = 0,
    public details: ErrorDetails = {},
  ) {
    // Only stable, sanitized metadata is exposed; never a response body or request URL.
    const operation = details.operation
      ? `${getString(`api-operation-${details.operation}`)}: `
      : '';
    super(
      `${operation}${getString('api-request-failed')} (${status || details.failure || 'network'}${key ? `: ${key}` : ''}${details.storageCode ? `: ${details.storageCode}` : ''})`,
    );
  }
}

export function formatErrorDiagnostic(error: unknown): string {
  return JSON.stringify(
    error instanceof ApiError
      ? { status: error.status, key: error.key, ...error.details }
      : { failure: 'local', ...safeException(error) },
    null,
    2,
  );
}

/** Extract only documented object-storage error codes, never XML messages or URLs. */
export function storageErrorCode(body: unknown): string | undefined {
  if (typeof body !== 'string') return undefined;
  const code = body.match(/<Code>([A-Za-z]+)<\/Code>/)?.[1];
  return [
    'SignatureDoesNotMatch',
    'AccessDenied',
    'RequestTimeTooSkewed',
    'ExpiredToken',
    'RequestExpired',
    'InvalidAccessKeyId',
    'AuthorizationQueryParametersError',
    'BadDigest',
    'InvalidDigest',
    'MissingContentLength',
  ].includes(code || '')
    ? code
    : undefined;
}

export type HttpResponse = {
  status: number;
  body: unknown;
  header: (name: string) => string;
};

export function trustedApiUrl(path: string): string {
  let url: URL;
  try {
    url = new URL(path, BASE_URL);
  } catch {
    throw new Error(getString('api-untrusted-url'));
  }
  if (
    url.origin !== BASE_URL ||
    url.username ||
    url.password ||
    !url.pathname.startsWith('/api/v1/')
  )
    throw new Error(getString('api-untrusted-url'));
  return url.href;
}

export function storageUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(getString('api-untrusted-url'));
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(getString('api-untrusted-url'));
  }
  return value; // Preserve the exact signed URL, including its query string.
}

/**
 * Raw privileged XHR avoids Zotero.HTTP's URL/body logging and automatic retries.
 * Every channel is anonymous, and redirects are intercepted BEFORE forwarding
 * headers. A download redirect is followed only by a separate anonymous request.
 */
export function transport(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: string | Uint8Array,
  binary = false,
  operation?: RequestOperation,
): Promise<HttpResponse> {
  return new Promise<HttpResponse>((resolve, reject) => {
    const XHR = ztoolkit.getGlobal('XMLHttpRequest');
    const xhr = new XHR();
    xhr.open(method, url, true);
    xhr.timeout = 60000;
    xhr.responseType = binary ? 'arraybuffer' : 'text';
    const channel = xhr.channel as unknown as nsIChannel;
    channel.loadFlags |=
      Ci.nsIRequest.LOAD_ANONYMOUS! |
      Ci.nsIRequest.LOAD_BYPASS_CACHE! |
      Ci.nsIRequest.INHIBIT_CACHING!;
    channel.notificationCallbacks = {
      QueryInterface: ChromeUtils.generateQI(['nsIInterfaceRequestor', 'nsIChannelEventSink']),
      getInterface(this: nsIInterfaceRequestor, iid: nsIID) {
        return this.QueryInterface!(iid);
      },
      asyncOnChannelRedirect(
        oldChannel: nsIChannel,
        newChannel: nsIChannel,
        flags: number,
        callback: nsIAsyncVerifyRedirectCallback,
      ) {
        // Internal redirects (e.g. HSTS) must not be treated as file redirects.
        let permitted = false;
        try {
          if (
            flags & Ci.nsIChannelEventSink.REDIRECT_INTERNAL! &&
            new URL(newChannel.URI.spec).origin === new URL(oldChannel.URI.spec).origin
          ) {
            permitted = true;
            callback.onRedirectVerifyCallback(Cr.NS_OK);
            return;
          }
          const http = oldChannel.QueryInterface!(Ci.nsIHttpChannel);
          const location = http.getResponseHeader('Location');
          resolve({
            status: http.responseStatus,
            body: null,
            header: (name) => (name.toLowerCase() === 'location' ? location : ''),
          });
        } catch {
          reject(new ApiError(0, '', 0, { operation, failure: 'redirect' }));
        } finally {
          if (!permitted) {
            callback.onRedirectVerifyCallback(Cr.NS_BINDING_ABORTED);
            xhr.abort();
          }
        }
      },
    } as unknown as nsIInterfaceRequestor;
    xhr.onload = () =>
      resolve({
        status: xhr.status,
        body: binary ? xhr.response : xhr.responseText,
        header: (name) => xhr.getResponseHeader(name) || '',
      });
    const fail = (failure: Failure) => reject(new ApiError(0, '', 0, { operation, failure }));
    xhr.onerror = () => fail('network');
    xhr.ontimeout = () => fail('timeout');
    xhr.onabort = () => fail('aborted');
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.send(body);
  }).catch((error: unknown) => {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, '', 0, { operation, failure: 'setup', ...safeException(error) });
  });
}

export async function request<T>(
  path: string,
  data?: unknown,
  method: 'GET' | 'POST' | 'DELETE' = data === undefined ? 'GET' : 'POST',
): Promise<T> {
  const url = trustedApiUrl(path);
  const token = await getApiToken();
  const pathname = new URL(url).pathname;
  const operation: RequestOperation | undefined =
    pathname === '/api/v1/me'
      ? 'quota'
      : pathname === '/api/v1/languages'
        ? 'languages'
        : pathname === '/api/v1/uploads'
          ? 'upload-url'
          : pathname === '/api/v1/translations'
            ? 'create'
            : /^\/api\/v1\/translations\/[^/]+\/retry$/.test(pathname)
              ? 'retry'
              : /^\/api\/v1\/translations\/[^/]+$/.test(pathname)
                ? method === 'DELETE'
                  ? 'cancel'
                  : 'query'
                : undefined;
  const response = await transport(
    method,
    url,
    {
      Authorization: `Bearer ${token}`,
      Origin: BASE_URL,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    data === undefined ? undefined : JSON.stringify(data),
    false,
    operation,
  );
  return unwrap<T>(response, operation);
}

export function unwrap<T>(response: HttpResponse, operation?: RequestOperation): T {
  let json: { success?: boolean; data?: T; error?: { key?: string } } = {};
  try {
    json = JSON.parse(String(response.body));
  } catch {
    /* Non-JSON proxy errors. */
  }
  if (response.status !== 200 || json?.success !== true || json.data === undefined) {
    const key = json?.error?.key;
    throw new ApiError(
      response.status,
      typeof key === 'string' && /^error_[a-z_]+$/.test(key) ? key : '',
      Math.max(0, Number(response.header('Retry-After')) || 0) * 1000,
      { operation, failure: response.status === 200 ? 'invalid-response' : 'http' },
    );
  }
  return json.data;
}

/** Retry only reads, and only transient network/server/rate-limit errors. */
export function retryDelay(error: unknown, attempt: number): number | null {
  if (!(error instanceof ApiError) || attempt >= 4) return null;
  if (
    error.status === 0 ||
    error.status >= 500 ||
    (error.status === 429 && error.key === 'error_rate_limited') ||
    (error.status === 404 && error.key === 'error_artifact_not_ready')
  )
    return Math.max(error.retryAfter, Math.min(30000, 1000 * 2 ** attempt)) + Math.random() * 1000;
  return null;
}
