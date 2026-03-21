'use strict';

const PlatformType = Object.freeze({
  iOS: 'ios',
  Android: 'android',
});

function defineConfig(config) {
  return config;
}

module.exports = {
  PlatformType,
  defineConfig,
};