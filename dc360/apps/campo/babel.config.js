/**
 * O preset do Expo já traz o que o React Native precisa, inclusive o suporte
 * a `expo-router`. Nada é acrescentado aqui de propósito: cada plugin de
 * Babel a mais é uma diferença a mais entre o que roda no aparelho e o que o
 * TypeScript conferiu.
 */
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
