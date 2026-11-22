import { getPref, clearPref } from '../utils/prefs';
import { getString } from '../utils/locale';

export const BASE_URL = 'https://putongdoc.com';
const TOKEN_REALM = 'PT_Document_API_Token';
// Realms used before the rename; read and migrate them so existing tokens keep working.
const LEGACY_TOKEN_REALMS = ['PT Document API Token', 'PutongDoc API Token'];

/** Keep credentials out of plain-text preferences and task persistence. */
export async function getApiToken(): Promise<string> {
  await Services.logins.initializationPromise;
  const legacy = getPref('authkey');
  if (legacy) {
    await saveApiToken(legacy);
    clearPref('authkey');
  }
  const envToken = Services.env.get('PUTONGDOC_API_TOKEN');
  let token = envToken || Services.logins.findLogins(BASE_URL, '', TOKEN_REALM)[0]?.password || '';
  if (!envToken && !token) {
    const legacyToken = LEGACY_TOKEN_REALMS.map(
      (realm) => Services.logins.findLogins(BASE_URL, '', realm)[0]?.password,
    ).find((value) => value);
    if (legacyToken) {
      token = legacyToken;
      await saveApiToken(legacyToken);
    }
  }
  if (!/^pt_\S+$/.test(token)) throw new Error(getString('api-token-required'));
  return token;
}

export async function saveApiToken(value: string): Promise<void> {
  const token = value.trim();
  if (token && !/^pt_\S+$/.test(token)) throw new Error(getString('api-token-required'));
  await Services.logins.initializationPromise;
  const existing = Services.logins.findLogins(BASE_URL, '', TOKEN_REALM);
  const legacyExisting = LEGACY_TOKEN_REALMS.flatMap((realm) =>
    Services.logins.findLogins(BASE_URL, '', realm),
  );
  if (token) {
    const login = Cc['@mozilla.org/login-manager/loginInfo;1'].createInstance(Ci.nsILoginInfo);
    login.init(BASE_URL, null as unknown as string, TOKEN_REALM, 'api-token', token, '', '');
    if (existing.length) Services.logins.modifyLogin(existing[0], login);
    else await Services.logins.addLoginAsync(login);
    // Drop the pre-rename entry once the token has been migrated.
    legacyExisting.forEach((legacyLogin) => Services.logins.removeLogin(legacyLogin));
  } else {
    [...existing, ...legacyExisting].forEach((login) => Services.logins.removeLogin(login));
  }
  clearPref('authkey');
}
