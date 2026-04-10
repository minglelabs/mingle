/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '../..'),
  ],
  resolver: {
    // Prefer Metro's node crawler over Watchman so release builds do not
    // leave .watchman-cookie-* files behind in the workspace.
    useWatchman: false,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
