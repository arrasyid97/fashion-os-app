module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2020, // Diperbarui ke versi yang lebih modern
    "sourceType": "module",
    "requireConfigFile": false, // <-- INI KUNCI UTAMA PERBAIKANNYA
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    // Aturan yang sudah ada dari Anda (pertahankan)
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "quotes": ["error", "double", {"allowTemplateLiterals": true}],

    // Aturan baru untuk menonaktifkan pemeriksaan gaya (tambahkan ini)
    "max-len": "off",
    "indent": "off",
    "object-curly-spacing": "off",
    "require-jsdoc": "off",
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
