/* ============================================================
   やすみつなぎ — ESLint 設定（任意の追加チェック）
   ------------------------------------------------------------
   eslint はこのプロジェクトの依存に入れていない（dependencies 0 件を保つため）。
   手元に eslint がある環境でだけ `npm run lint:eslint` で実行する。
   必須の検証は `npm run verify`（node --check / node --test / npm audit）。
   ============================================================ */
export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script', // UMD 形式なのでモジュールではない
      globals: {
        // ブラウザ
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        TextEncoder: 'readonly',
        // 共通
        globalThis: 'readonly',
        console: 'readonly',
        // Node（テストと UMD のフォールバック）
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none' }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-else-if': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-self-compare': 'error',
      'no-fallthrough': 'error',
      'no-shadow-restricted-names': 'error',
      'no-implied-eval': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['tests/*.mjs'],
    languageOptions: { sourceType: 'module' },
  },
];
