import { getPref, clearPref } from '../utils/prefs';
import { getString } from '../utils/locale';

export const BASE_URL = 'https://putongdoc.com';
const TOKEN_REALM = 'PutongDoc API Token';

/** Keep credentials out of plain-text preferences and task persistence. */
export async function getApiToken(): Promise<string> {
  await Services.logins.initializationPromise;
  const legacy = getPref('authkey');
  if (legacy) {
    await saveApiToken(legacy);
    clearPref('authkey');
  }
  const token =
    Services.env.get('PUTONGDOC_API_TOKEN') ||
    Services.logins.findLogins(BASE_URL, '', TOKEN_REALM)[0]?.password ||
    '';
  if (!/^pt_\S+$/.test(token)) throw new Error(getString('api-token-required'));
  return token;
}

export async function saveApiToken(value: string): Promise<void> {
  const token = value.trim();
  if (token && !/^pt_\S+$/.test(token)) throw new Error(getString('api-token-required'));
  await Services.logins.initializationPromise;
  const existing = Services.logins.findLogins(BASE_URL, '', TOKEN_REALM);
  if (token) {
    const login = Cc['@mozilla.org/login-manager/loginInfo;1'].createInstance(Ci.nsILoginInfo);
    login.init(BASE_URL, null as unknown as string, TOKEN_REALM, 'api-token', token, '', '');
    if (existing.length) Services.logins.modifyLogin(existing[0], login);
    else await Services.logins.addLoginAsync(login);
  } else {
    existing.forEach((login) => Services.logins.removeLogin(login));
  }
  clearPref('authkey');
}
