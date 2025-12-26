const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['./src/index.js'],
  bundle: true,
  minify: false, // 保持不压缩以方便调试，生产环境可改为 true
  outfile: './dist/_worker.js',
  format: 'esm',
  target: 'esnext',
  // 关键修改：将 node: 内置模块和 cloudflare: 模块都标记为外部
  external: [
    'cloudflare:sockets', 
    'node:buffer', 
    'node:crypto', 
    'node:process', 
    'node:stream', 
    'node:util'
  ], 
  logLevel: 'info',
};

if (isWatch) {
  esbuild.context(buildOptions).then(ctx => {
    ctx.watch();
    console.log('Watching for changes...');
  });
} else {
  esbuild.build(buildOptions).catch(() => process.exit(1));
}
