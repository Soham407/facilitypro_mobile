const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Exclude the .agents directory from the resolver
config.resolver.blockList = [
  /^\.agents\/.*/,
];

module.exports = config;
