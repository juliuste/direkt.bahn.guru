import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export default {
	mode: 'production',
	entry: './src/index.js',
	output: {
		path: resolve(dirname(fileURLToPath(import.meta.url)), 'assets'),
		filename: 'bundle.js',
	},
}
