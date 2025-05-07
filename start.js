const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { exec } = require('child_process');

const app = express();
const PORT = 8100;
const PASSWORD = '123456';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

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
    // 设置 cookie 标记，30分钟有效
    res.setHeader('Set-Cookie', 'auth=1; Max-Age=1800; HttpOnly; Path=/');
    res.send('<p>密码正确，正在加载服务……请稍候或刷新页面。</p>');

    // 启动原始 server.js（接管 8100 端口）
    server.close(() => {
      console.log('验证成功，启动 server.js...');
      exec('node server.js');
    });
  } else {
    res.send('<p>密码错误！<a href="/login">重试</a></p>');
  }
});

// 拦截器：无 cookie 则跳转登录页
app.use((req, res, next) => {
  if (req.cookies.auth === '1') {
    next();
  } else {
    res.redirect('/login');
  }
});

const server = app.listen(PORT, () => {
  console.log(`登录保护中：请访问 http://<你的IP>:${PORT}`);
});
