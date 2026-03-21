// @ts-check

const { defineConfig } = require('./config');

/** @type {import('./config').ReactNativeOtaConfigFactory} */
module.exports = defineConfig(({ PlatformType, env }) => ({
  name: env.OTA_APP_NAME || 'example-app',
  version: env.OTA_VERSION || '1.0.0',
  platform: [PlatformType.iOS],
  baseUrl: env.OTA_BASE_URL || 'http://localhost:3001/api',
  channel: env.OTA_CHANNEL || 'production',
  isMandatory: 0,
  desc: 'OTA update description',
}));