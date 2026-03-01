module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'] // Remove the plugins array completely
  };
};