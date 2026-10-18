import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { URL } from 'node:url';

const externalRequire = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
function loader(globals = {}, overrides = {}) {
  const cache = new Map();
  const context = vm.createContext({
    URL,
    ArrayBuffer,
    Uint8Array,
    console: globalThis.console,
    ...globals,
  });
  function load(filename) {
    const key = filename.replaceAll('\\', '/');
    if (Object.hasOwn(overrides, key)) return overrides[key];
    if (cache.has(key)) return cache.get(key).exports;
    if (key.endsWith('.json')) return JSON.parse(fs.readFileSync(path.join(root, key), 'utf8'));
    const module = { exports: {} };
    cache.set(key, module);
    const source = fs.readFileSync(path.join(root, key), 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const run = vm.runInContext(`(function(require,module,exports){${code}\n})`, context, {
      filename: key,
    });
    run(
      (specifier) => {
        if (!specifier.startsWith('.')) return externalRequire(specifier);
        let resolved = path.posix.normalize(path.posix.join(path.posix.dirname(key), specifier));
        if (!path.extname(resolved)) {
          resolved += fs.existsSync(path.join(root, `${resolved}.ts`)) ? '.ts' : '/index.ts';
        }
        return load(resolved);
      },
      module,
      module.exports,
    );
    return module.exports;
  }
  return load;
}

function networkFixture(responses = []) {
  const calls = [];
  const logins = [];
  const prefs = {};
  let envToken = 'pt_test_only';
  const Services = {
    env: { get: () => envToken },
    logins: {
      initializationPromise: Promise.resolve(),
      findLogins: () => logins,
      addLoginAsync: async (login) => {
        logins.push(login);
      },
      modifyLogin: (_old, login) => {
        logins[0] = login;
      },
      removeLogin: (login) => {
        logins.splice(logins.indexOf(login), 1);
      },
    },
  };
  class XHR {
    constructor() {
      this.channel = { loadFlags: 0 };
      this.headers = {};
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name, value) {
      this.headers[name] = value;
    }
    getResponseHeader(name) {
      return (
        Object.entries(this.reply.headers || {}).find(
          ([key]) => key.toLowerCase() === name.toLowerCase(),
        )?.[1] || ''
      );
    }
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
    send(body) {
      this.body = body;
      calls.push(this);
      this.reply = responses.shift();
      if (!this.reply) throw new Error('Missing mock response');
      if (this.reply.sendError) throw this.reply.sendError;
      globalThis.queueMicrotask(() => {
        if (this.reply.networkError) return this.onerror();
        if (this.reply.timeout) return this.ontimeout();
        if (this.reply.aborted) return this.onabort();
        if (this.reply.redirect) {
          this.channel.notificationCallbacks.asyncOnChannelRedirect(
            {
              URI: { spec: this.url },
              QueryInterface: () => ({
                responseStatus: this.reply.status,
                getResponseHeader: (name) => this.getResponseHeader(name),
              }),
            },
            { URI: { spec: this.reply.redirect } },
            this.reply.internal ? 1 : 0,
            {
              onRedirectVerifyCallback: (result) => {
                this.redirectResult = result;
              },
            },
          );
          if (this.reply.internal && this.redirectResult === 0) {
            this.status = 200;
            this.responseText = this.reply.body;
            this.onload();
          }
          return;
        }
        this.status = this.reply.status;
        this.response = this.reply.body;
        this.responseText = this.reply.body;
        this.onload();
      });
    }
  }
  const load = loader(
    {
      Services,
      Cc: {
        '@mozilla.org/login-manager/loginInfo;1': {
          createInstance: () => ({
            init(origin, formActionOrigin, httpRealm, username, password) {
              Object.assign(this, { origin, formActionOrigin, httpRealm, username, password });
            },
          }),
        },
      },
      Ci: {
        nsILoginInfo: {},
        nsIRequest: { LOAD_ANONYMOUS: 16384 },
        nsIChannelEventSink: { REDIRECT_INTERNAL: 1 },
        nsIHttpChannel: {},
      },
      Cr: { NS_OK: 0, NS_BINDING_ABORTED: 1 },
      ChromeUtils: {
        generateQI: () =>
          function () {
            return this;
          },
      },
      ztoolkit: {
        getGlobal: () => XHR,
        log: () => {
          throw new Error('No credential logging allowed');
        },
      },
    },
    {
      'src/utils/locale.ts': { getString: (key) => key },
      'src/utils/prefs.ts': {
        getPref: (key) => prefs[key],
        clearPref: (key) => {
          delete prefs[key];
        },
      },
    },
  );
  return {
    load,
    calls,
    logins,
    prefs,
    setEnv: (value) => {
      envToken = value;
    },
  };
}
const ok = (data) => ({ status: 200, body: JSON.stringify({ success: true, data }) });
export { loader, networkFixture, ok };
