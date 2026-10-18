import { getString } from '../utils/locale';

/**
 * Fail closed until the PutongDoc API adapter is implemented.
 * Do not read tokens, construct URLs, or send requests in this migration build.
 */
export async function request<T>(): Promise<T> {
  throw new Error(getString('service-not-configured'));
}
