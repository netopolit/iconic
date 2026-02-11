import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylisticJs from '@stylistic/eslint-plugin-js';
import globals from 'globals';

export default tseslint.config(
	js.configs.recommended,
	tseslint.configs.recommended,
	{
		languageOptions: { globals: globals.node },
		plugins: { '@stylistic/js': stylisticJs },
		rules: {
			'no-prototype-builtins': 'off',
			'no-unused-vars': 'off',
			'no-useless-assignment': 'off',
			'prefer-const': 'off',
			'@stylistic/js/quotes': ['error', 'single', { avoidEscape: true }],
			'@typescript-eslint/ban-ts-comment': 'off',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-unused-expressions': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
		},
	},
	{ ignores: ['node_modules/', 'main.js'] },
);
