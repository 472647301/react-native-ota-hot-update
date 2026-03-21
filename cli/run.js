'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { pathToFileURL } = require('url');

const packageConfig = require('../package.json');
const { PlatformType, defineConfig } = require('./config');

const tagName = `${packageConfig.name}:`;

function color(code, message) {
  return `\u001b[${code}m${message}\u001b[0m`;
}

function info(message) {
  console.log(color(32, tagName), message);
}

function error(message) {
  console.error(color(31, tagName), message);
}

function exitWithError(message) {
  error(message);
  process.exit(1);
}

function ensureNode18() {
  if (typeof fetch !== 'function' || typeof FormData === 'undefined' || typeof Blob === 'undefined') {
    exitWithError('CLI requires Node.js 18+');
  }
}

function safeUnlink(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function ensureTrailingSlash(baseUrl) {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function fetchCacheData(content) {
  let token;
  let username;
  let password;

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('token=')) {
      token = line.slice('token='.length);
      continue;
    }

    if (line.startsWith('username=')) {
      username = line.slice('username='.length);
      continue;
    }

    if (line.startsWith('password=')) {
      password = line.slice('password='.length);
    }
  }

  return { token, username, password };
}

async function requestJson(baseUrl, endpoint, options) {
  ensureNode18();

  const response = await fetch(new URL(endpoint.replace(/^\//, ''), ensureTrailingSlash(baseUrl)), {
    method: options.method,
    headers: {
      ...(options.headers || {}),
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

async function adminLogin(baseUrl, username, password, cachePath) {
  const response = await requestJson(baseUrl, 'admin/login', {
    method: 'POST',
    body: { username, password },
  });

  if (!response || typeof response.data !== 'string' || !response.data) {
    throw new Error(response?.message || 'token err');
  }

  fs.writeFileSync(
    cachePath,
    `token=${response.data}\nusername=${username}\npassword=${password}`,
    'utf8'
  );

  return response;
}

async function createVersion(token, config) {
  return requestJson(config.baseUrl, 'version/create', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
    },
    body: {
      ver: config.version,
      desc: config.desc,
      name: config.name,
      downloadUrl: config.downloadUrl,
      platform: config.platform.join(','),
      channel: config.channel,
      isMandatory: config.isMandatory,
    },
  });
}

async function ask(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function setCacheData(baseUrl, cachePath) {
  const username = await ask('Enter username');
  if (!username) {
    process.exit(0);
  }

  const password = await ask('Enter password');
  if (!password) {
    process.exit(0);
  }

  info('get login credentials');

  try {
    await adminLogin(baseUrl, username, password, cachePath);
    info('login successful');
  } catch (loginError) {
    error(loginError.message || String(loginError));
  }

  process.exit(0);
}

function getConfigCandidates(cwd) {
  return [
    'react-native-ota.config.js',
    'react-native-ota.config.cjs',
    'react-native-ota.config.mjs',
  ].map((fileName) => path.join(cwd, fileName));
}

function getConfigContext(argv) {
  return {
    PlatformType,
    defineConfig,
    argv: argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
  };
}

async function loadConfigModule(configPath) {
  const extname = path.extname(configPath);

  if (extname === '.mjs') {
    const loaded = await import(pathToFileURL(configPath).href);
    return loaded.default || loaded;
  }

  const loaded = require(configPath);
  return loaded && loaded.default ? loaded.default : loaded;
}

async function normalizeConfig(configExport, argv) {
  if (typeof configExport === 'function') {
    return configExport(getConfigContext(argv));
  }

  return configExport;
}

async function loadConfig(argv) {
  const configPath = getConfigCandidates(process.cwd()).find((candidate) => fs.existsSync(candidate));

  if (!configPath) {
    throw new Error('no react-native-ota.config.js file');
  }

  const loaded = await loadConfigModule(configPath);
  return normalizeConfig(loaded, argv);
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    exitWithError('invalid configuration');
  }

  if (!config.name) {
    exitWithError('missing parameters name');
  }

  if (!config.baseUrl) {
    exitWithError('missing parameters baseUrl');
  }

  if (!config.version) {
    exitWithError('missing parameters version');
  }

  if (!Array.isArray(config.platform) || !config.platform.length) {
    exitWithError('missing parameters platform');
  }

  const invalidPlatforms = config.platform.filter(
    (item) => item !== PlatformType.iOS && item !== PlatformType.Android
  );

  if (invalidPlatforms.length) {
    exitWithError(`unsupported platform: ${invalidPlatforms.join(', ')}`);
  }
}

async function uploadZipFile(token, config, filePath, cachePath) {
  ensureNode18();
  info('start upload files');

  if (!fs.existsSync(filePath)) {
    exitWithError(`missing ${filePath}`);
  }

  const form = new FormData();

  if (config.desc) {
    form.append('desc', config.desc);
  }

  if (config.name) {
    form.append('name', config.name);
  }

  if (config.version) {
    form.append('ver', config.version);
  }

  if (config.channel) {
    form.append('channel', config.channel);
  }

  if (typeof config.isMandatory === 'number') {
    form.append('isMandatory', `${config.isMandatory}`);
  }

  form.append('platform', config.platform.join(','));
  form.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));

  let data;

  try {
    const response = await fetch(new URL('version/upload', ensureTrailingSlash(config.baseUrl)), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: form,
    });

    data = await response.json();
  } finally {
    safeUnlink(filePath);
  }

  if (!data) {
    exitWithError('file upload failed');
  }

  if (data.code) {
    error('file upload failed');
    error(data.message || 'unknown error');

    if (data.code === 401) {
      safeUnlink(cachePath);
    }

    process.exit(1);
  }

  info(JSON.stringify(data));

  if (typeof config.success === 'function') {
    config.success(data.data);
  }
}

async function updateVersion(token, config, cachePath) {
  if (config.downloadUrl) {
    info('start add version');

    const data = await createVersion(token, config);
    if (!data) {
      exitWithError('add version failed');
    }

    if (data.code) {
      error('add version failed');
      error(data.message || 'unknown error');

      if (data.code === 401) {
        safeUnlink(cachePath);
      }

      process.exit(1);
    }

    info(JSON.stringify(data));

    if (typeof config.success === 'function') {
      config.success(data.data);
    }

    process.exit(0);
  }

  const zipName = config.platform.includes(PlatformType.iOS)
    ? 'main.jsbundle.zip'
    : 'index.android.bundle.zip';

  await uploadZipFile(token, config, path.join(process.cwd(), 'output', zipName), cachePath);
}

async function updateAction(name, argv) {
  info(`${name || 'update'} start uploading`);
  info('reading configuration');

  let config;

  try {
    config = await loadConfig(argv);
  } catch (loadError) {
    exitWithError(loadError.message || 'no react-native-ota.config.js file');
  }

  info('configuration read successfully');

  config.name = name || config.name;
  validateConfig(config);

  const cachePath = path.join(os.homedir(), `.${String(config.baseUrl).replace(/[^a-zA-Z]/g, '')}`);

  if (!fs.existsSync(cachePath)) {
    await setCacheData(config.baseUrl, cachePath);
    return;
  }

  const cacheData = fetchCacheData(fs.readFileSync(cachePath, 'utf8'));

  if (!cacheData.token) {
    await setCacheData(config.baseUrl, cachePath);
    return;
  }

  await updateVersion(cacheData.token, config, cachePath);
}

function printHelp() {
  console.log(`${packageConfig.name} ${packageConfig.version}`);
  console.log(packageConfig.description || 'Hot update CLI');
  console.log('');
  console.log('Usage:');
  console.log('  cli.js update [name]');
  console.log('  cli.js --version');
  console.log('');
  console.log('Config file: react-native-ota.config.js');
  console.log('Config can export an object or a function.');
}

async function run(argv = process.argv) {
  const [, , command, arg] = argv;

  if (command === '--version' || command === '-V' || command === '-v') {
    console.log(packageConfig.version);
    return;
  }

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command !== 'update') {
    exitWithError(`unknown command ${command}`);
  }

  await updateAction(arg, argv);
}

module.exports = {
  run,
};