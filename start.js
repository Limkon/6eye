// start.js
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { spawn } = require('child_process');
const fs = require('fs'); // 使用同步fs，因为这些操作主要在启动时
const path = require('path');
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');

// --- 1. 配置和常量 ---
const PUBLIC_PORT = 8100; // start.js (代理) 监听的公共端口
const APP_INTERNAL_PORT = 8200; // server.js (主应用) 固定监听的内部端口

const USER_PASSWORD_STORAGE_FILE = path.join(__dirname, 'auth_config.enc');
const MASTER_SECRET_KEY_FILE = path.join(__dirname, 'encryption.secret.key'); // 用于加密用户密码的主密钥文件

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

let serverJsProcess = null;

// --- 1a. 获取或生成主加密密钥文本 (用于加密用户访问密码) ---
function initializeEncryptionSecretKeyText() {
    if (fs.existsSync(MASTER_SECRET_KEY_FILE)) {
        console.log(`[AUTH_GATE] 应用提示：正在从 ${MASTER_SECRET_KEY_FILE} 读取主加密密钥...`);
        const keyText = fs.readFileSync(MASTER_SECRET_KEY_FILE, 'utf8').trim();
        if (keyText.length < 64) { // 32字节的密钥，十六进制表示为64字符
            console.warn(`[AUTH_GATE] 安全警告：${MASTER_SECRET_KEY_FILE} 中的密钥文本长度 (${keyText.length}) 可能不足 (推荐64个十六进制字符)。`);
        }
        return keyText;
    } else {
        console.log(`[AUTH_GATE] 应用提示：主加密密钥文件 ${MASTER_SECRET_KEY_FILE} 不存在。正在生成新密钥...`);
        const newKeyText = crypto.randomBytes(32).toString('hex'); // 32字节 -> 64个十六进制字符
        try {
            fs.writeFileSync(MASTER_SECRET_KEY_FILE, newKeyText, { encoding: 'utf8', mode: 0o600 });
            // fs.chmodSync(MASTER_SECRET_KEY_FILE, 0o600); // writeFileSync mode 选项通常已足够
            console.log(`[AUTH_GATE] 应用提示：新的主加密密钥已生成并保存到 ${MASTER_SECRET_KEY_FILE} (权限 600)。`);
            console.warn(`[AUTH_GATE] 重要：请务必保护好 ${MASTER_SECRET_KEY_FILE} 文件！它是解密用户密码的关键。`);
            return newKeyText;
        } catch (err) {
            console.error(`[AUTH_GATE] 严重错误：无法写入或设置主加密密钥文件 ${MASTER_SECRET_KEY_FILE} 的权限。`, err);
            process.exit(1);
        }
    }
}

const ENCRYPTION_SECRET_KEY_TEXT = initializeEncryptionSecretKeyText();
// 从十六进制密钥文本派生用于AES的Buffer密钥
// 注意：scrypt更适合密码哈希，对于直接用作对称密钥的文本，直接转换为Buffer或使用固定salt的KDF可能是目标。
// 这里假设ENCRYPTION_SECRET_KEY_TEXT是足够随机的，可以直接用于派生。
// 为了安全，我们使用scrypt从这个"主密码文本"派生出一个固定长度的密钥Buffer。
const DERIVED_ENCRYPTION_KEY = crypto.scryptSync(ENCRYPTION_SECRET_KEY_TEXT, 'auth_gate_fixed_salt_v1', 32); // 32字节 (256位)

let isUserPasswordSetupNeeded = !fs.existsSync(USER_PASSWORD_STORAGE_FILE);

// --- 1b. 启动和管理 server.js (主应用) ---
function startMainApp() {
    if (serverJsProcess && !serverJsProcess.killed) {
        console.log('[AUTH_GATE] 主应用 (server.js) 已在运行中或正在尝试启动。');
        return;
    }
    console.log(`[AUTH_GATE] 尝试启动主应用 (server.js)，该应用应固定监听端口 ${APP_INTERNAL_PORT}...`);
    const mainAppPath = path.join(__dirname, 'server.js'); // 指向您的聊天室应用

    const options = {
        stdio: 'inherit', // 将子进程的stdio直接输出到父进程的控制台
        env: {
            ...process.env, // 继承父进程的环境变量
            // 显式为 server.js 子进程设置 PORT 环境变量
            // 这样 server.js 中的 const PORT = process.env.PORT || 8200; 会读取到 "8200"
            'PORT': APP_INTERNAL_PORT.toString()
        }
    };

    serverJsProcess = spawn('node', [mainAppPath], options);

    serverJsProcess.on('error', (err) => {
        console.error(`[AUTH_GATE] 启动主应用 (server.js) 失败: ${err.message}`);
        serverJsProcess = null;
    });

    serverJsProcess.on('exit', (code, signal) => {
        const reason = code !== null ? `退出码 ${code}` : (signal !== null ? `信号 ${signal}` : '未知原因');
        console.log(`[AUTH_GATE] 主应用 (server.js) 已退出 (${reason})。`);
        serverJsProcess = null;
        // 可选：如果主应用意外退出，可以尝试重启或关闭认证网关
        // if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
        //     console.warn('[AUTH_GATE] 主应用意外退出，请检查其日志。认证网关将继续运行，但可能无法服务请求。');
        // }
    });

    if (serverJsProcess.pid) {
        console.log(`[AUTH_GATE] 主应用 (server.js) 进程已启动，PID: ${serverJsProcess.pid}`);
    } else {
        console.error(`[AUTH_GATE] 主应用 (server.js) 未能立即获取PID，可能启动失败。`);
        // serverJsProcess = null; // 已经在 on('error') 和 on('exit') 中处理
    }
}

// --- 2. 加密与解密函数 (用于用户访问密码) ---
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
        const encryptedText = parts.join(':'); // Should be parts[0] as parts.join(':') would re-introduce ':' if present in encryptedText (unlikely for hex)
        const decipher = crypto.createDecipheriv(ALGORITHM, DERIVED_ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("[AUTH_GATE] 用户密码解密函数内部错误:", error.message, ". 可能原因：主加密密钥不匹配或密码文件损坏。");
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

    // 如果已认证 (cookie存在)
    if (req.cookies.auth === '1') {
        if (authRelatedPaths.includes(req.path)) { // 如果已认证用户访问登录/设置页，重定向到首页
            return res.redirect('/');
        }
        return next(); // 已认证，访问其他页面，继续到代理层
    }

    // 如果未认证
    if (req.path === '/login' || req.path === '/do_login') { // 未认证用户访问登录页，允许
        return next();
    }
    // 未认证用户访问其他页，重定向到登录
    return res.redirect('/login');
});

// --- 6. 路由定义 ---

// == SETUP ROUTES ==
app.get('/setup', (req, res) => {
    if (!isUserPasswordSetupNeeded) { // 如果密码已设置，不应能访问 /setup
        console.warn("[AUTH_GATE] 警告：密码已设置，但仍到达 GET /setup 路由。将重定向到登录页。");
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
        startMainApp(); // 密码设置成功后，启动主应用
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
    // 如果密码未设置，应重定向到 /setup (由全局中间件处理)
    // 如果已登录，应重定向到 / (由全局中间件处理)
    const error = req.query.error;
    let errorMessageHtml = '';
    if (error === 'invalid') errorMessageHtml = '<p class="message error-message">密码错误！</p>';
    else if (error === 'decrypt_failed') errorMessageHtml = '<p class="message error-message">无法验证密码。可能是密钥问题或文件损坏。</p>';
    else if (error === 'read_failed') errorMessageHtml = '<p class="message error-message">无法读取密码配置。请联系管理员。</p>';
    else if (error === 'internal_state') errorMessageHtml = '<p class="message error-message">内部状态错误，请重试或完成设置。</p>';


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
    if (isUserPasswordSetupNeeded) { //理论上全局中间件会处理，但加一道保险
        return res.redirect('/setup');
    }
    const submittedPassword = req.body.password;
    if (!submittedPassword) {
        return res.redirect('/login?error=invalid'); // 空密码视为无效
    }

    try {
        const encryptedPasswordFromFile = fs.readFileSync(USER_PASSWORD_STORAGE_FILE, 'utf8');
        const storedDecryptedPassword = decryptUserPassword(encryptedPasswordFromFile);

        if (storedDecryptedPassword === null) {
            // 解密失败，可能是密钥问题或文件损坏
            return res.redirect('/login?error=decrypt_failed');
        }

        if (submittedPassword === storedDecryptedPassword) {
            // Max-Age 单位是秒 (30分钟)
            res.setHeader('Set-Cookie', 'auth=1; Max-Age=1800; HttpOnly; Path=/; SameSite=Lax');
            console.log("[AUTH_GATE] 用户登录成功。重定向到主应用 /");
            res.redirect('/');
        } else {
            res.redirect('/login?error=invalid');
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            // 密码文件丢失，但应用未处于设置模式，这是一种状态错误
            console.error("[AUTH_GATE] 登录失败：用户密码文件未找到，但应用未处于设置模式。将强制进入设置模式。", error);
            isUserPasswordSetupNeeded = true; // 更新状态
            return res.redirect('/setup?error=internal_state'); // 提示用户重新设置
        }
        console.error("[AUTH_GATE] 读取用户密码文件或登录处理时发生未知错误:", error);
        res.status(500).send("服务器内部错误，无法处理登录请求。");
    }
});

// --- 7. 反向代理中间件 ---
const proxyToMainApp = createProxyMiddleware({
    target: `http://localhost:${APP_INTERNAL_PORT}`, // 指向 server.js 的固定内部端口
    changeOrigin: true,
    ws: true, // 重要：为 WebSocket 开启代理
    logLevel: 'info', // 'debug' 可以看到更多信息
    onError: (err, req, res) => {
        console.error('[AUTH_GATE_PROXY] 代理发生错误:', err.message);
        // 确保向上游发送的是一个实际的 Response 对象，或者一个可写的流
        const responseTarget = res.writeHead ? res : (res.socket ? res.socket : res);

        if (responseTarget && typeof responseTarget.writeHead === 'function' && !responseTarget.headersSent) {
            try { responseTarget.writeHead(502, { 'Content-Type': 'text/html' }); } catch (e) { /* ignore */ }
        }
        if (responseTarget && responseTarget.writable && !responseTarget.writableEnded) {
            try {
                responseTarget.end(`
                    <div style="text-align:center;padding:40px;font-family:sans-serif;">
                        <h2>代理错误 (502 Bad Gateway)</h2>
                        <p>认证网关无法连接到后端应用程序 (server.js)。</p>
                        <p>请检查主应用 (server.js) 是否已成功启动并正在监听内部端口 ${APP_INTERNAL_PORT}。</p>
                        <p>错误详情: ${err.message}</p>
                    </div>
                `);
            } catch (e) { /* ignore */ }
        } else if (responseTarget && !responseTarget.writableEnded) { // If not writable but not ended, try to end
            try { responseTarget.end(); } catch (e) { /* ignore */ }
        }
    }
});

// 应用此代理中间件到所有通过了前面认证中间件的请求
// 即，请求必须是已认证的 (cookie auth=1 存在) 且不是直接由 start.js 处理的认证路径
app.use((req, res, next) => {
    // 此中间件在全局身份验证中间件之后，以及特定的 /login, /setup 路由之后运行。
    // 如果请求到达这里，意味着：
    // 1. 用户密码已设置 (isUserPasswordSetupNeeded is false)。
    // 2. 用户已通过 Cookie 认证 (req.cookies.auth === '1')。
    // 3. 请求的路径不是认证相关路径 (因为它们已被全局中间件重定向或由特定路由处理)。
    // 因此，这些是应该被代理到主应用的请求。
    if (!isUserPasswordSetupNeeded && req.cookies.auth === '1') {
        // 确保 server.js 已经启动或正在启动
        if (!serverJsProcess || serverJsProcess.killed) {
            console.log('[AUTH_GATE] 代理请求时发现主应用未运行，尝试启动...');
            startMainApp(); // 尝试启动 (如果它崩溃了)
            // 第一次启动可能需要时间，这里可以考虑返回一个等待页面或延迟代理
            // 但为了简单起见，直接尝试代理，如果失败 onError 会处理
        }
        return proxyToMainApp(req, res, next);
    } else {
        // 理论上，不符合上述代理条件的请求应该已经被全局中间件处理（重定向到 /login 或 /setup）。
        // 如果意外到达这里，作为后备，可以记录警告并发送404或重定向。
        console.warn(`[AUTH_GATE] 意外请求到达代理层前未被正确处理: ${req.path}, AuthCookie: ${req.cookies.auth}, SetupNeeded: ${isUserPasswordSetupNeeded}`);
        if (isUserPasswordSetupNeeded) {
            res.redirect('/setup');
        } else {
            res.redirect('/login');
        }
    }
});


// --- 8. 服务器启动 ---
const httpServer = app.listen(PUBLIC_PORT, () => { // 使用 httpServer 变量以便后续用于 WebSocket 升级
    console.log(`[AUTH_GATE] 认证网关与反向代理服务已在端口 ${PUBLIC_PORT} 上启动。`);
    if (isUserPasswordSetupNeeded) {
        console.log(`[AUTH_GATE] 请访问 http://<你的服务器IP或localhost>:${PUBLIC_PORT}/setup 完成初始用户密码设置。`);
        // 首次设置时不立即启动主应用，等待密码设置完成
    } else {
        console.log(`[AUTH_GATE] 主应用将由本服务管理。请访问 http://<你的服务器IP或localhost>:${PUBLIC_PORT}/login 进行登录。`);
        startMainApp(); // 如果密码已设置，则启动主应用
    }
    console.warn(
        "[AUTH_GATE] 安全提示：用户密码加密方式仅为基础级别。" +
        `请确保 ${MASTER_SECRET_KEY_FILE} 文件的安全和备份。`
    );
});

// 确保代理能正确处理 WebSocket 升级请求
// http-proxy-middleware 通常会自动处理附加到server的ws升级请求
// 但如果遇到问题，可以显式处理 upgrade 事件
httpServer.on('upgrade', (req, socket, head) => {
    console.log('[AUTH_GATE] 收到 WebSocket upgrade 请求，尝试代理...');
    // 确保是在已认证的情况下才代理 WebSocket
    // 解析 cookie (简易版，实际应用中可能需要更健壮的 cookie 解析库)
    const cookies = req.headers.cookie ? req.headers.cookie.split('; ').reduce((acc, cookie) => {
        const [name, value] = cookie.split('=');
        acc[name] = value;
        return acc;
    }, {}) : {};

    if (!isUserPasswordSetupNeeded && cookies.auth === '1') {
        if (serverJsProcess && !serverJsProcess.killed) {
             proxyToMainApp.upgrade(req, socket, head); // 使用 proxyToMainApp 实例的 upgrade 方法
        } else {
            console.error('[AUTH_GATE] WebSocket upgrade 失败：主应用未运行。');
            socket.destroy();
        }
    } else {
        console.warn('[AUTH_GATE] 未认证的 WebSocket upgrade 请求被拒绝。');
        socket.destroy(); // 拒绝未认证的 WebSocket 连接
    }
});


httpServer.on('error', (error) => {
    if (error.syscall !== 'listen') {
        console.error('[AUTH_GATE] 发生了一个非监听相关的服务器错误:', error);
        // process.exit(1); // 酌情决定是否退出
        return;
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
    httpServer.close(() => {
        console.log('[AUTH_GATE] HTTP 服务已关闭。');
        if (serverJsProcess && !serverJsProcess.killed) {
            console.log('[AUTH_GATE] 正在尝试终止主应用 (server.js)...');
            const killed = serverJsProcess.kill('SIGTERM'); // 发送 SIGTERM 信号
            if (killed) {
                console.log('[AUTH_GATE] 已向主应用发送 SIGTERM 信号。等待其退出...');
                // 设置超时，以防主应用无法正常退出
                const shutdownTimeout = setTimeout(() => {
                    if (serverJsProcess && !serverJsProcess.killed) {
                        console.warn('[AUTH_GATE] 主应用未在 SIGTERM 后指定时间内退出，强制发送 SIGKILL...');
                        serverJsProcess.kill('SIGKILL'); // 强制终止
                    }
                    process.exit(0); // 无论如何退出父进程
                }, 5000); // 5秒优雅退出时间

                serverJsProcess.on('exit', () => {
                    clearTimeout(shutdownTimeout); // 主应用已退出，清除超时
                    console.log('[AUTH_GATE] 主应用已退出。认证网关现在退出。');
                    process.exit(0);
                });
                return; // 等待 on('exit') 或 timeout
            } else {
                console.warn('[AUTH_GATE] 向主应用发送 SIGTERM 信号失败。可能已退出或无权限。');
            }
        }
        process.exit(0); // 如果没有子进程或发送信号失败，直接退出
    });

    // 整体关闭超时
    setTimeout(() => {
        console.error('[AUTH_GATE] 优雅关闭超时，强制退出。');
        process.exit(1);
    }, 10000); // 10秒总超时
}

process.on('SIGINT', () => shutdownGracefully('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => shutdownGracefully('SIGTERM')); // kill 命令
