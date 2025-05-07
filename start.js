const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');

// --- 1. 配置和常量 ---
const PUBLIC_PORT = 13000; // start.js (代理) 监听的公共端口
const APP_INTERNAL_PORT = 13001; // server.js (主应用) 固定监听的内部端口

const USER_PASSWORD_STORAGE_FILE = path.join(__dirname, 'auth_config.enc');
const MASTER_SECRET_KEY_FILE = path.join(__dirname, 'encryption.secret.key');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

let serverJsProcess = null;

// --- 1a. 获取或生成主加密密钥文本 ---
function initializeEncryptionSecretKeyText() {
    if (fs.existsSync(MASTER_SECRET_KEY_FILE)) {
        console.log(`[AUTH_GATE] 应用提示：正在从 ${MASTER_SECRET_KEY_FILE} 读取主加密密钥...`);
        const keyText = fs.readFileSync(MASTER_SECRET_KEY_FILE, 'utf8').trim();
        if (keyText.length < 64) {
            console.warn(`[AUTH_GATE] 安全警告：${MASTER_SECRET_KEY_FILE} 中的密钥文本长度 (${keyText.length}) 可能不足。`);
        }
        return keyText;
    } else {
        console.log(`[AUTH_GATE] 应用提示：主加密密钥文件 ${MASTER_SECRET_KEY_FILE} 不存在。正在生成新密钥...`);
        const newKeyText = crypto.randomBytes(48).toString('hex');
        try {
            fs.writeFileSync(MASTER_SECRET_KEY_FILE, newKeyText, { encoding: 'utf8', mode: 0o600 });
            fs.chmodSync(MASTER_SECRET_KEY_FILE, 0o600);
            console.log(`[AUTH_GATE] 应用提示：新的主加密密钥已生成并保存到 ${MASTER_SECRET_KEY_FILE} (权限 600)。`);
            console.warn(`[AUTH_GATE] 重要：请务必保护好 ${MASTER_SECRET_KEY_FILE} 文件！`);
            return newKeyText;
        } catch (err) {
            console.error(`[AUTH_GATE] 严重错误：无法写入或设置主加密密钥文件 ${MASTER_SECRET_KEY_FILE} 的权限。`, err);
            process.exit(1);
        }
    }
}

const ENCRYPTION_SECRET_KEY_TEXT = initializeEncryptionSecretKeyText();
const DERIVED_ENCRYPTION_KEY = crypto.scryptSync(ENCRYPTION_SECRET_KEY_TEXT, 'a_fixed_salt_for_scrypt_derivation_v1', 32);

let isUserPasswordSetupNeeded = !fs.existsSync(USER_PASSWORD_STORAGE_FILE);

// --- 1b. 启动和管理 server.js (主应用) ---
function startMainApp() {
    if (serverJsProcess && !serverJsProcess.killed) {
        console.log('[AUTH_GATE] 主应用 (server.js) 已在运行中或正在尝试启动。');
        return;
    }
    // server.js 固定监听 APP_INTERNAL_PORT (8200)
    console.log(`[AUTH_GATE] 尝试启动主应用 (server.js)，该应用应固定监听端口 ${APP_INTERNAL_PORT}...`);
    const mainAppPath = path.join(__dirname, 'server.js');
    
    const options = { 
        stdio: 'inherit', // 将子进程的stdio直接输出到父进程的控制台
        // env: { ...process.env } // 继承父进程环境变量，但不强制覆盖 PORT
    };
        
    serverJsProcess = spawn('node', [mainAppPath], options);

    serverJsProcess.on('error', (err) => {
        console.error(`[AUTH_GATE] 启动主应用 (server.js) 失败: ${err.message}`);
        serverJsProcess = null;
    });

    serverJsProcess.on('exit', (code, signal) => {
        const reason = code !== null ? `退出码 ${code}` : `信号 ${signal}`;
        console.log(`[AUTH_GATE] 主应用 (server.js) 已退出 (${reason})。`);
        serverJsProcess = null;
    });

    if (serverJsProcess.pid) {
        console.log(`[AUTH_GATE] 主应用 (server.js) 进程已启动，PID: ${serverJsProcess.pid}`);
    } else {
        console.error(`[AUTH_GATE] 主应用 (server.js) 未能立即获取PID，可能启动失败。`);
        serverJsProcess = null;
    }
}

// --- 2. 加密与解密函数 ---
function encryptUserPassword(text) {
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, DERIVED_ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error("[AUTH_GATE] 用户密码加密函数内部错误:", error);
        throw new Error("User password encryption failed.");
    }
}

function decryptUserPassword(text) {
    try {
        const parts = text.split(':');
        if (parts.length !== 2) {
            console.error("[AUTH_GATE] 用户密码解密失败：密文格式无效（缺少IV）。");
            return null;
        }
        const iv = Buffer.from(parts.shift(), 'hex');
        const encryptedText = parts.join(':');
        const decipher = crypto.createDecipheriv(ALGORITHM, DERIVED_ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("[AUTH_GATE] 用户密码解密函数内部错误:", error.message);
        return null;
    }
}

// --- 3. Express 应用设置 ---
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const pageStyles = `
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #333; }
    .container { background-color: #fff; padding: 30px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); text-align: center; width: 360px; max-width: 90%; }
    h2 { margin-top: 0; margin-bottom: 25px; color: #1d2129; font-size: 22px; }
    input[type="password"], input[type="text"] { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #dddfe2; border-radius: 6px; box-sizing: border-box; font-size: 16px; }
    input[type="password"]:focus, input[type="text"]:focus { border-color: #007bff; outline: none; box-shadow: 0 0 0 2px rgba(0,123,255,.25); }
    button[type="submit"] { width: 100%; padding: 12px; background-color: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 17px; font-weight: bold; transition: background-color 0.2s; margin-top: 10px; }
    button[type="submit"]:hover { background-color: #0056b3; }
    .message { margin-bottom: 15px; font-weight: 500; font-size: 0.95em; }
    .error-message { color: #dc3545; }
    .success-message { color: #28a745; }
    .info-message { color: #17a2b8; font-size: 0.85em; margin-top:15px; line-height: 1.4; }
    label { display: block; text-align: left; margin-bottom: 5px; font-weight: 500; font-size: 0.9em; }
    a { color: #007bff; text-decoration: none; }
    a:hover { text-decoration: underline; }
`;

// --- 4. 启动模式判断和日志 ---
if (isUserPasswordSetupNeeded) {
    console.log("[AUTH_GATE] 应用提示：未找到用户密码配置文件。首次运行，请设置用户密码。");
} else {
    console.log("[AUTH_GATE] 应用提示：用户密码配置文件已存在。进入登录模式。");
}

// --- 5. 全局身份验证和设置重定向中间件 ---
app.use((req, res, next) => {
    const authRelatedPaths = ['/login', '/do_login', '/setup', '/do_setup'];

    if (isUserPasswordSetupNeeded) {
        if (req.path === '/setup' || req.path === '/do_setup') {
            return next();
        }
        return res.redirect('/setup');
    }

    if (req.cookies.auth === '1') {
        if (authRelatedPaths.includes(req.path)) {
            return res.redirect('/');
        }
        return next();
    }

    if (req.path === '/login' || req.path === '/do_login') {
        return next();
    }
    return res.redirect('/login');
});

// --- 6. 路由定义 ---

// == SETUP ROUTES ==
app.get('/setup', (req, res) => {
    if (!isUserPasswordSetupNeeded && req.path ==='/setup') {
         console.warn("[AUTH_GATE] 警告：密码已设置，但仍到达 GET /setup 路由。");
         return res.redirect('/login');
    }
    const error = req.query.error;
    let errorMessageHtml = '';
    if (error === 'mismatch') errorMessageHtml = '<p class="message error-message">两次输入的密码不匹配！</p>';
    else if (error === 'short') errorMessageHtml = '<p class="message error-message">密码长度至少需要8个字符！</p>';
    else if (error === 'write_failed') errorMessageHtml = '<p class="message error-message">保存用户密码失败，请检查服务器权限或日志。</p>';
    else if (error === 'encrypt_failed') errorMessageHtml = '<p class="message error-message">密码加密失败，请检查服务器日志。</p>';

    res.send(`
        <!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>设置初始用户密码</title><style>${pageStyles}</style></head>
        <body><div class="container">
            <form method="POST" action="/do_setup">
                <h2>首次运行：设置用户密码</h2>
                ${errorMessageHtml}
                <label for="newPassword">新密码 (至少8位):</label>
                <input type="password" id="newPassword" name="newPassword" required minlength="8" autofocus>
                <label for="confirmPassword">确认新密码:</label>
                <input type="password" id="confirmPassword" name="confirmPassword" required minlength="8">
                <button type="submit">设置用户密码并保存</button>
                <p class="info-message">此用户密码将使用系统管理的主密钥进行加密后保存在服务器上。</p>
            </form>
        </div></body></html>
    `);
});

app.post('/do_setup', (req, res) => {
    if (!isUserPasswordSetupNeeded) {
        return res.status(403).send("错误：用户密码已设置。");
    }
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
        return res.redirect('/setup?error=short');
    }
    if (newPassword !== confirmPassword) {
        return res.redirect('/setup?error=mismatch');
    }

    let encryptedPassword;
    try {
        encryptedPassword = encryptUserPassword(newPassword);
    } catch (error) {
        return res.redirect('/setup?error=encrypt_failed');
    }

    try {
        fs.writeFileSync(USER_PASSWORD_STORAGE_FILE, encryptedPassword, 'utf8');
        isUserPasswordSetupNeeded = false;
        console.log("[AUTH_GATE] 用户密码已成功设置并加密保存。应用现在进入登录模式。");
        startMainApp();
        res.send(`
            <!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>设置成功</title><style>${pageStyles}</style></head>
            <body><div class="container">
                <h2 class="success-message">用户密码设置成功！</h2>
                <p>主应用服务已启动。您现在可以 <a href="/login">前往登录页面</a>。</p>
            </div></body></html>
        `);
    } catch (error) {
        console.error("[AUTH_GATE] 保存加密用户密码文件失败:", error);
        res.redirect('/setup?error=write_failed');
    }
});

// == LOGIN ROUTES ==
app.get('/login', (req, res) => {
    const error = req.query.error;
    let errorMessageHtml = '';
    if (error === 'invalid') errorMessageHtml = '<p class="message error-message">密码错误！</p>';
    else if (error === 'decrypt_failed') errorMessageHtml = '<p class="message error-message">无法验证密码。可能是密钥问题或文件损坏。</p>';
    else if (error === 'read_failed') errorMessageHtml = '<p class="message error-message">无法读取密码配置。请联系管理员。</p>';

    res.send(`
        <!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>登录</title><style>${pageStyles}</style></head>
        <body><div class="container">
            <form method="POST" action="/do_login">
                <h2>请输入密码访问</h2>
                ${errorMessageHtml}
                <label for="password">密码:</label>
                <input type="password" id="password" name="password" required autofocus>
                <button type="submit">登录</button>
            </form>
        </div></body></html>
    `);
});

app.post('/do_login', (req, res) => {
    if (isUserPasswordSetupNeeded) {
        return res.status(403).send("错误：请先完成初始用户密码设置。");
    }
    const submittedPassword = req.body.password;
    if (!submittedPassword) {
        return res.redirect('/login?error=invalid');
    }

    try {
        const encryptedPasswordFromFile = fs.readFileSync(USER_PASSWORD_STORAGE_FILE, 'utf8');
        const storedDecryptedPassword = decryptUserPassword(encryptedPasswordFromFile);

        if (storedDecryptedPassword === null) {
            return res.redirect('/login?error=decrypt_failed');
        }

        if (submittedPassword === storedDecryptedPassword) {
            res.setHeader('Set-Cookie', 'auth=1; Max-Age=1800; HttpOnly; Path=/; SameSite=Lax');
            console.log("[AUTH_GATE] 用户登录成功。重定向到主应用 /");
            res.redirect('/');
        } else {
            res.redirect('/login?error=invalid');
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error("[AUTH_GATE] 登录失败：用户密码文件未找到，但应用未处于设置模式。", error);
            isUserPasswordSetupNeeded = true;
            return res.redirect('/setup?error=internal_state');
        }
        console.error("[AUTH_GATE] 读取用户密码文件或登录处理时发生未知错误:", error);
        res.status(500).send("服务器内部错误，无法处理登录请求。");
    }
});

// --- 7. 反向代理中间件 ---
const proxyToMainApp = createProxyMiddleware({
    target: `http://localhost:${APP_INTERNAL_PORT}`, // 指向 server.js 的固定内部端口
    changeOrigin: true,
    ws: true,
    logLevel: 'info',
    onError: (err, req, res) => {
        console.error('[AUTH_GATE_PROXY] 代理发生错误:', err.message); // Log only message for brevity
        if (res && !res.headersSent) {
             try { res.writeHead(502, { 'Content-Type': 'text/html' }); } catch (e) { /* ignore */ }
        }
        if (res && res.writable && !res.writableEnded) {
            try {
                res.end(`
                    <div style="text-align:center;padding:40px;font-family:sans-serif;">
                        <h2>代理错误</h2>
                        <p>无法连接到后端应用程序 (server.js)。请检查其是否已启动并监听内部端口 ${APP_INTERNAL_PORT}。</p>
                        </div>
                `);
            } catch (e) { /* ignore */ }
        } else if (res && !res.writableEnded) {
            try { res.end(); } catch (e) { /* ignore */ }
        }
    }
});

app.use((req, res, next) => {
    // 此中间件在全局身份验证中间件之后，以及特定的 /login, /setup 路由之后运行。
    // 如果请求到达这里，意味着：
    // 1. 用户密码已设置 (isUserPasswordSetupNeeded is false)。
    // 2. 用户已通过 Cookie 认证 (req.cookies.auth === '1')。
    // 3. 请求的路径不是认证相关路径 (因为它们已被全局中间件重定向或由特定路由处理)。
    // 因此，这些是应该被代理到主应用的请求。
    if (!isUserPasswordSetupNeeded && req.cookies.auth === '1') {
        proxyToMainApp(req, res, next);
    } else {
        // 理论上，不符合上述代理条件的请求应该已经被全局中间件处理（重定向）。
        // 如果意外到达这里，作为后备，可以记录警告并发送404或重定向。
        console.warn(`[AUTH_GATE] 意外请求到达代理层前未被处理: ${req.path}, AuthCookie: ${req.cookies.auth}`);
        res.status(404).send('资源未找到或请求未被正确路由。');
    }
});


// --- 8. 服务器启动 ---
const server = app.listen(PUBLIC_PORT, () => {
    console.log(`[AUTH_GATE] 认证网关与反向代理服务已在端口 ${PUBLIC_PORT} 上启动。`);
    if (isUserPasswordSetupNeeded) {
        console.log(`[AUTH_GATE] 请访问 http://<你的服务器IP或localhost>:${PUBLIC_PORT}/setup 完成初始用户密码设置。`);
    } else {
        console.log(`[AUTH_GATE] 主应用将由本服务管理。请访问 http://<你的服务器IP或localhost>:${PUBLIC_PORT}/login 进行登录。`);
        startMainApp();
    }
    console.warn(
        "[AUTH_GATE] 安全提示：用户密码加密方式仅为基础级别。" +
        `请确保 ${MASTER_SECRET_KEY_FILE} 文件的安全和备份。`
    );
});

server.on('error', (error) => {
    if (error.syscall !== 'listen') {
        console.error('[AUTH_GATE] 发生了一个非监听相关的服务器错误:', error);
        process.exit(1);
    }
    switch (error.code) {
        case 'EACCES':
            console.error(`[AUTH_GATE] 错误：端口 ${PUBLIC_PORT} 需要提升的权限。`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(`[AUTH_GATE] 错误：端口 ${PUBLIC_PORT} 已被其他应用程序占用。`);
            process.exit(1);
            break;
        default:
            console.error('[AUTH_GATE] 服务器启动时发生未知监听错误:', error);
            process.exit(1);
    }
});

// --- 9. 优雅关闭处理 ---
function shutdownGracefully(signal) {
    console.log(`[AUTH_GATE] 收到 ${signal}。正在关闭服务...`);
    server.close(() => {
        console.log('[AUTH_GATE] HTTP 服务已关闭。');
        if (serverJsProcess && !serverJsProcess.killed) {
            console.log('[AUTH_GATE] 正在尝试终止主应用 (server.js)...');
            const killed = serverJsProcess.kill('SIGTERM');
            if (killed) {
                console.log('[AUTH_GATE] 已向主应用发送 SIGTERM 信号。等待其退出...');
                setTimeout(() => {
                    if (serverJsProcess && !serverJsProcess.killed) {
                        console.warn('[AUTH_GATE] 主应用未在 SIGTERM 后退出，强制发送 SIGKILL...');
                        serverJsProcess.kill('SIGKILL');
                    }
                    process.exit(0);
                }, 3000); // 3秒优雅退出时间
                return; // 避免过早调用 process.exit(0)
            } else {
                 console.warn('[AUTH_GATE] 向主应用发送 SIGTERM 信号失败。可能已退出或无权限。');
            }
        }
        process.exit(0); // 如果没有子进程或发送信号失败，直接退出
    });

    setTimeout(() => {
        console.error('[AUTH_GATE] 优雅关闭超时，强制退出。');
        process.exit(1);
    }, 10000);
}

process.on('SIGINT', () => shutdownGracefully('SIGINT'));
process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
