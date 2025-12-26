const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['./src/index.js'],
  bundle: true,
  minify: true, // 开启压缩以减小体积
  outfile: './dist/_worker.js',
  format: 'esm',
  target: 'esnext',
  external: ['cloudflare:sockets'], 
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
