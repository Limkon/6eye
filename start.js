const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { exec } = require('child_process');
const path = require('path'); // 用于更可靠地执行脚本

const app = express();
const PORT = 8100;
const PASSWORD = '20021199'; // 请务必使用更安全的密码管理方式，例如环境变量

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// HTML和CSS部分可以提取出来，或者保持内联以简化单个文件
const loginPageStyles = `
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: #f0f2f5;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        color: #333;
    }
    .container {
        background-color: #fff;
        padding: 30px 40px;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        text-align: center;
        width: 320px;
    }
    h2 {
        margin-top: 0;
        margin-bottom: 25px;
        color: #1d2129;
        font-size: 24px;
    }
    input[type="password"] {
        width: calc(100% - 22px); /* Adjust for padding */
        padding: 12px;
        margin-bottom: 20px;
        border: 1px solid #dddfe2;
        border-radius: 6px;
        box-sizing: border-box;
        font-size: 16px;
    }
    input[type="password"]:focus {
        border-color: #007bff;
        outline: none;
        box-shadow: 0 0 0 2px rgba(0,123,255,.25);
    }
    button[type="submit"] {
        width: 100%;
        padding: 12px;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 17px;
        font-weight: bold;
        transition: background-color 0.2s;
    }
    button[type="submit"]:hover {
        background-color: #0056b3;
    }
    .error-message {
        color: #dc3545; /* Red for errors */
        margin-bottom: 15px;
        font-weight: 500;
    }
    .success-message p {
        font-size: 16px;
        line-height: 1.5;
    }
    .success-message a {
        color: #007bff;
        text-decoration: none;
    }
    .success-message a:hover {
        text-decoration: underline;
    }
`;

// GET /login - 显示登录页面
app.get('/login', (req, res) => {
    // 如果用户已经有有效的 cookie，直接重定向到主页
    if (req.cookies.auth === '1') {
        return res.redirect('/');
    }

    const errorMessage = req.query.error === '1' ? '<p class="error-message">密码错误！请重试。</p>' : '';
    res.send(`
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>登录</title>
            <style>${loginPageStyles}</style>
        </head>
        <body>
            <div class="container">
                <form method="POST" action="/login">
                    <h2>请输入密码访问</h2>
                    ${errorMessage}
                    <input type="password" name="password" placeholder="密码" required autofocus />
                    <button type="submit">登录</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// POST /login - 处理登录请求
app.post('/login', (req, res) => {
    if (req.body.password === PASSWORD) {
        // 设置 cookie 标记，30分钟有效
        res.setHeader('Set-Cookie', 'auth=1; Max-Age=1800; HttpOnly; Path=/; SameSite=Lax'); // Added SameSite=Lax for security
        
        // 发送一个包含自动跳转逻辑的页面
        res.send(`
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>登录成功</title>
                <style>
                    ${loginPageStyles}
                    /* Additional styles for success page if needed */
                </style>
            </head>
            <body>
                <div class="container success-message">
                    <h2>登录成功</h2>
                    <p>服务正在启动，页面将在几秒后自动跳转...</p>
                    <p>如果页面没有自动跳转，请 <a href="/">点击这里刷新</a>。</p>
                    <script>
                        setTimeout(function() {
                            window.location.href = '/'; // 跳转到主应用根路径
                        }, 3000); // 3秒延迟
                    </script>
                </div>
            </body>
            </html>
        `);

        // 关闭当前服务器并启动原始的 server.js
        // 使用 process.nextTick 确保响应已发送或开始发送
        process.nextTick(() => {
            server.close((err) => {
                if (err) {
                    console.error('关闭登录服务器失败:', err);
                    // 即使关闭失败，也尝试启动主服务
                }
                console.log('验证成功，登录保护服务已关闭。正在启动主服务 (server.js)...');
                
                // 确保 server.js 的路径正确，通常与此脚本在同一目录
                const mainAppPath = path.join(__dirname, 'server.js');
                const child = exec(`node "${mainAppPath}"`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`启动 server.js 失败: ${error.message}`);
                        return;
                    }
                    if (stderr) {
                        // 很多应用会将日志输出到 stderr，所以不一定是错误
                        console.error(`server.js stderr: ${stderr}`);
                    }
                    if (stdout) {
                        console.log(`server.js stdout: ${stdout}`);
                    }
                });

                child.on('exit', (code, signal) => {
                    if (code !== null) {
                        console.log(`server.js 已退出，退出码 ${code}`);
                    } else if (signal !== null) {
                        console.log(`server.js 被信号 ${signal} 终止`);
                    }
                });
            });
        });

    } else {
        // 密码错误，重定向回登录页并带上错误提示参数
        res.redirect('/login?error=1');
    }
});

// 拦截器：除了登录页，其他所有请求都需要验证 cookie
// 这个中间件应该放在所有不需要保护的路由 (如 /login) 定义之后
app.use((req, res, next) => {
    if (req.cookies.auth === '1') {
        // 如果已认证，但访问的是本应由主服务处理的路径
        // (因为此登录服务除了 /login 外不提供其他页面)
        // next() 将导致 404，除非主服务已接管。
        // 这是预期的，因为主服务启动后会处理这些请求。
        next();
    } else {
        // 对于所有其他路径，如果未认证，则重定向到登录页
        res.redirect('/login');
    }
});


const server = app.listen(PORT, () => {
    console.log(`登录保护服务已启动：请访问 http://<你的服务器IP>:${PORT}`);
    console.log(`此服务仅用于密码验证。验证成功后，它将关闭并启动您的主应用程序 (server.js)。`);
});

// 优雅地处理退出信号
process.on('SIGINT', () => {
    console.log('收到 SIGINT，关闭服务器...');
    server.close(() => {
        console.log('服务器已关闭。');
        process.exit(0);
    });
});
