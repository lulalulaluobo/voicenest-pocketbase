import esbuild from 'esbuild'
import builtins from 'builtin-modules'

await esbuild.build({
  entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian', 'electron', ...builtins],
  format: 'cjs', target: 'es2018', outfile: 'main.js', minify: process.argv[2] === 'production',
})
