const express = require('express');
const session = require('express-session');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { fork } = require('child_process');
const path = require('path');

const INTERNAL_PORT = 8200; // server.js 实际监听的端口
const EXTERNAL_PORT = 8100; // 用户能访问的唯一端口

// 启动原始 server.js，传入 PORT 环境变量
fork(path.join(__dirname, 'server.js'), {
  env: { ...process.env, PORT: INTERNAL_PORT }
});

const app = express();

// 会话和登录处理
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: false
}));
app.use(express.urlencoded({ extended: true }));

const PASSWORD = '123456';

app.get('/login', (req, res) => {
  res.send(`
    <form method="POST" action="/login">
      <h2>请输入密码访问页面</h2>
      <input type="password" name="password" />
      <button type="submit">登录</button>
    </form>
  `);
});

app.post('/login', (req, res) => {
  if (req.body.password === PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.send('<p>密码错误！<a href="/login">重试</a></p>');
  }
});

// 除登录外的请求，检查认证状态
app.use((req, res, next) => {
  if (req.session.authenticated || req.path === '/login') {
    next();
  } else {
    res.redirect('/login');
  }
});

// 所有请求代理到真正的 server.js（监听 8200）
app.use('/', createProxyMiddleware({
  target: `http://localhost:${INTERNAL_PORT}`,
  changeOrigin: true
}));

// 包装器监听外部暴露的 8100 端口
app.listen(EXTERNAL_PORT, () => {
  console.log(`已启用密码保护，服务运行在 http://localhost:${EXTERNAL_PORT}`);
});
