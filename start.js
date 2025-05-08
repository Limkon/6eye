const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');

// --- 1. 配置和常量 ---
const PUBLIC_PORT = 8100;
const APP_INTERNAL_PORT = 3000; // server.js (主应用) 固定监听的内部端口 (was 8200, changed to 3000 as per original comments)

const MASTER_PASSWORD_STORAGE_FILE = path.join(__dirname, 'master_auth_config.enc'); // Renamed
const USER_CREDENTIALS_STORAGE_FILE = path.join(__dirname, 'user_credentials.enc'); // New file for users
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
            fs.chmodSync(MASTER_SECRET_KEY_FILE, 0o600); // Ensure permissions
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

let isMasterPasswordSetupNeeded = !fs.existsSync(MASTER_PASSWORD_STORAGE_FILE);

// --- 1b. 启动和管理 server.js (主应用) ---
function startMainApp() {
    if (serverJsProcess && !serverJsProcess.killed) {
        console.log('[AUTH_GATE] 主应用 (server.js) 已在运行中或正在尝试启动。');
        return;
    }
    console.log(`[AUTH_GATE] 尝试启动主应用 (server.js)，该应用应固定监听端口 ${APP_INTERNAL_PORT}...`);
    const mainAppPath = path.join(__dirname, 'server.js');
    const options = { stdio: 'inherit' };
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
// These functions are for individual password strings
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

// --- 2b. User Credentials Management ---
function readUserCredentials() {
    if (!fs.existsSync(USER_CREDENTIALS_STORAGE_FILE)) {
        return {}; // No users yet
    }
    try {
        const encryptedData = fs.readFileSync(USER_CREDENTIALS_STORAGE_FILE, 'utf8');
        if (!encryptedData) return {};
        const decryptedData = decryptUserPassword(encryptedData); // Reusing for simplicity, assuming JSON is text
        return JSON.parse(decryptedData);
    } catch (error) {
        console.error("[AUTH_GATE] 读取用户凭证失败:", error);
        return {}; // Return empty on error to prevent crash, or handle more gracefully
    }
}

function saveUserCredentials(usersObject) {
    try {
        const dataToEncrypt = JSON.stringify(usersObject, null, 2);
        const encryptedData = encryptUserPassword(dataToEncrypt); // Reusing for simplicity
        fs.writeFileSync(USER_CREDENTIALS_STORAGE_FILE, encryptedData, 'utf8');
    } catch (error) {
        console.error("[AUTH_GATE] 保存用户凭证失败:", error);
        throw new Error("Failed to save user credentials.");
    }
}


// --- 3. Express 应用设置 ---
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const pageStyles = `
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; color: #333; padding: 20px 0; }
    .container { background-color: #fff; padding: 30px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); text-align: center; width: 400px; max-width: 90%; margin-bottom: 20px;}
    .admin-container { width: 800px; max-width: 95%; align-items: flex-start; text-align:left; }
    h2 { margin-top: 0; margin-bottom: 25px; color: #1d2129; font-size: 22px; }
    h3 { margin-top: 30px; margin-bottom: 15px; color: #1d2129; font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 5px;}
    input[type="password"], input[type="text"] { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #dddfe2; border-radius: 6px; box-sizing: border-box; font-size: 16px; }
    input[type="password"]:focus, input[type="text"]:focus { border-color: #007bff; outline: none; box-shadow: 0 0 0 2px rgba(0,123,255,.25); }
    button[type="submit"], .button-link { display: inline-block; width: auto; padding: 12px 20px; background-color: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 17px; font-weight: bold; transition: background-color 0.2s; margin-top: 10px; text-decoration: none; text-align:center; }
    button[type="submit"].full-width { width: 100%; }
    button[type="submit"]:hover, .button-link:hover { background-color: #0056b3; }
    button[type="submit"].danger { background-color: #dc3545; }
    button[type="submit"].danger:hover { background-color: #c82333; }
    .message { margin-bottom: 15px; font-weight: 500; font-size: 0.95em; }
    .error-message { color: #dc3545; }
    .success-message { color: #28a745; }
    .info-message { color: #17a2b8; font-size: 0.85em; margin-top:15px; line-height: 1.4; }
    label { display: block; text-align: left; margin-bottom: 5px; font-weight: 500; font-size: 0.9em; }
    a { color: #007bff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
    th { background-color: #f8f9fa; }
    .actions form { display: inline-block; margin-right: 5px; }
    .actions button { padding: 5px 10px; font-size: 0.9em; }
    .form-row { display: flex; gap: 10px; align-items: flex-end; margin-bottom: 15px;}
    .form-row label, .form-row input { margin-bottom: 0; }
    .form-row .field { flex-grow: 1; }
    .logout-link { position: absolute; top: 20px; right: 20px; }
`;

// --- 4. 启动模式判断和日志 ---
if (isMasterPasswordSetupNeeded) {
    console.log("[AUTH_GATE] 应用提示：未找到主密码配置文件。首次运行，请设置主密码。");
} else {
    console.log("[AUTH_GATE] 应用提示：主密码配置文件已存在。进入登录模式。");
}

// --- 5. 全局身份验证和设置重定向中间件 ---
app.use((req, res, next) => {
    const authRelatedPaths = ['/login', '/do_login', '/setup', '/do_setup'];
    const isAdminPath = req.path.startsWith('/admin');

    if (isMasterPasswordSetupNeeded) {
        if (req.path === '/setup' || req.path === '/do_setup') {
            return next();
        }
        return res.redirect('/setup');
    }

    // User is logged in
    if (req.cookies.auth === '1') {
        if (authRelatedPaths.includes(req.path) && req.path !== '/logout') { // Allow logout even if logged in
             return res.redirect(req.cookies.is_master === 'true' ? '/admin' : '/');
        }
        if (isAdminPath && req.cookies.is_master !== 'true') {
            console.warn("[AUTH_GATE] 普通用户尝试访问管理页面:", req.path);
            return res.status(403).send("无权访问此页面。仅主密码登录用户可访问。 <a href='/'>返回首页</a>");
        }
        return next(); // Authenticated and authorized for this path or proxy
    }

    // User is not logged in
    if (req.path === '/login' || req.path === '/do_login' || req.path === '/setup' /* Should not happen if !isMasterPasswordSetupNeeded */) {
        return next();
    }
    return res.redirect('/login');
});

// --- 6. 路由定义 ---

// == SETUP MASTER PASSWORD ROUTES ==
app.get('/setup', (req, res) => {
    if (!isMasterPasswordSetupNeeded && req.path ==='/setup') {
         console.warn("[AUTH_GATE] 警告：主密码已设置，但仍到达 GET /setup 路由。");
         return res.redirect('/login');
    }
    const error = req.query.error;
    let errorMessageHtml = '';
    if (error === 'mismatch') errorMessageHtml = '<p class="message error-message">两次输入的密码不匹配！</p>';
    else if (error === 'short') errorMessageHtml = '<p class="message error-message">密码长度至少需要8个字符！</p>';
    else if (error === 'write_failed') errorMessageHtml = '<p class="message error-message">保存主密码失败，请检查服务器权限或日志。</p>';
    else if (error === 'encrypt_failed') errorMessageHtml = '<p class="message error-message">主密码加密失败，请检查服务器日志。</p>';

    res.send(`
        <!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>设置初始主密码</title><style>${pageStyles}</style></head>
        <body><div class="container">
            <form method="POST" action="/do_setup">
                <h2>首次运行：设置主密码</h2>
                ${errorMessageHtml}
                <label for="newPassword">新主密码 (至少8位):</label>
                <input type="password" id="newPassword" name="newPassword" required minlength="8" autofocus>
                <label for="confirmPassword">确认新主密码:</label>
                <input type="password" id="confirmPassword" name="confirmPassword" required minlength="8">
                <button type="submit" class="full-width">设置主密码并保存</button>
                <p class="info-message">此主密码将用于首次登录及管理其他用户凭证。它将使用系统管理的主密钥进行加密后保存在服务器上。</p>
            </form>
        </div></body></html>
    `);
});

app.post('/do_setup', (req, res) => {
    if (!isMasterPasswordSetupNeeded) {
        return res.status(403).send("错误：主密码已设置。");
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
        fs.writeFileSync(MASTER_PASSWORD_STORAGE_FILE, encryptedPassword, 'utf8');
        isMasterPasswordSetupNeeded = false;
        console.log("[AUTH_GATE] 主密码已成功设置并加密保存。应用现在进入登录模式。");
        // Initialize user credentials file if it doesn't exist, even if empty
        if (!fs.existsSync(USER_CREDENTIALS_STORAGE_FILE)) {
            saveUserCredentials({}); // Save an empty encrypted object
        }
        startMainApp();
        res.send(`
            <!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>设置成功</title><style>${pageStyles}</style></head>
            <body><div class="container">
                <h2 class="success-message">主密码设置成功！</h2>
                <p>主应用服务已启动。您现在可以 <a href="/login">前往登录页面</a> 使用主密码登录。</p>
            </div></body></html>
        `);
    } catch (error) {
        console.error("[AUTH_GATE] 保存加密主密码文件失败:", error);
        res.redirect('/setup?error=write_failed');
    }
});

// == LOGIN ROUTES ==
app.get('/login', (req, res) => {
    const error = req.query.error;
    const info = req.query.info;
    let messageHtml = '';
    if (error === 'invalid') messageHtml = '<p class="message error-message">用户名或密码错误！</p>';
    else if (error === 'decrypt_failed') messageHtml = '<p class="message error-message">无法验证密码。可能是密钥问题或文件损坏。</p>';
    else if (error === 'read_failed') messageHtml = '<p class="message error-message">无法读取密码配置。请联系管理员。</p>';
    else if (error === 'no_user_file') messageHtml = '<p class="message error-message">用户凭证文件不存在，请先使用主密码登录并创建用户。</p>';
    else if (info === 'logged_out') messageHtml = '<p class="message success-message">您已成功登出。</p>';
    else if (info === 'user_added') messageHtml = '<p class="message success-message">用户添加成功。</p>';
    else if (info === 'user_deleted') messageHtml = '<p class="message success-message">用户删除成功。</p>';
    else if (info === 'password_changed') messageHtml = '<p class="message success-message">用户密码修改成功。</p>';


    res.send(`
        <!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>登录</title><style>${pageStyles}</style></head>
        <body><div class="container">
            <form method="POST" action="/do_login">
                <h2>请输入凭证访问</h2>
                ${messageHtml}
                <label for="username">用户名 (主密码登录则留空):</label>
                <input type="text" id="username" name="username" autofocus>
                <label for="password">密码:</label>
                <input type="password" id="password" name="password" required>
                <button type="submit" class="full-width">登录</button>
            </form>
        </div></body></html>
    `);
});

app.post('/do_login', (req, res) => {
    if (isMasterPasswordSetupNeeded) {
        return res.status(403).redirect('/setup?error=master_not_set');
    }
    const { username, password: submittedPassword } = req.body;

    if (!submittedPassword) {
        return res.redirect('/login?error=invalid'); // Password is always required
    }

    try {
        if (!username) { // Attempt Master Password Login
            const encryptedMasterPasswordFromFile = fs.readFileSync(MASTER_PASSWORD_STORAGE_FILE, 'utf8');
            const storedDecryptedMasterPassword = decryptUserPassword(encryptedMasterPasswordFromFile);

            if (storedDecryptedMasterPassword === null) {
                return res.redirect('/login?error=decrypt_failed');
            }
            if (submittedPassword === storedDecryptedMasterPassword) {
                res.setHeader('Set-Cookie', [
                    'auth=1; Max-Age=3600; HttpOnly; Path=/; SameSite=Lax', // Increased Max-Age
                    'is_master=true; Max-Age=3600; HttpOnly; Path=/; SameSite=Lax'
                ]);
                console.log("[AUTH_GATE] 主密码登录成功。");
                return res.redirect('/admin'); // Redirect master to admin page
            } else {
                return res.redirect('/login?error=invalid');
            }
        } else { // Attempt Regular User Login
            if (!fs.existsSync(USER_CREDENTIALS_STORAGE_FILE)) {
                 console.warn("[AUTH_GATE] 用户尝试登录，但用户凭证文件不存在。");
                 return res.redirect('/login?error=no_user_file');
            }
            const users = readUserCredentials();
            const userData = users[username];

            if (!userData || !userData.passwordHash) {
                return res.redirect('/login?error=invalid'); // User not found
            }

            const storedDecryptedPassword = decryptUserPassword(userData.passwordHash);
            if (storedDecryptedPassword === null) {
                return res.redirect('/login?error=decrypt_failed'); // Decryption issue for this user
            }

            if (submittedPassword === storedDecryptedPassword) {
                res.setHeader('Set-Cookie', [
                    'auth=1; Max-Age=3600; HttpOnly; Path=/; SameSite=Lax',
                    'is_master=false; Max-Age=3600; HttpOnly; Path=/; SameSite=Lax' // Explicitly set is_master to false
                ]);
                console.log(`[AUTH_GATE] 用户 '${username}' 登录成功。重定向到主应用 /`);
                return res.redirect('/');
            } else {
                return res.redirect('/login?error=invalid');
            }
        }
    } catch (error) {
        if (error.code === 'ENOENT' && error.path === MASTER_PASSWORD_STORAGE_FILE) {
            console.error("[AUTH_GATE] 登录失败：主密码文件未找到，但应用未处于设置模式。", error);
            isMasterPasswordSetupNeeded = true; // Correct internal state
            return res.redirect('/setup?error=internal_state');
        }
        console.error("[AUTH_GATE] 读取密码文件或登录处理时发生未知错误:", error);
        res.status(500).send("服务器内部错误，无法处理登录请求。");
    }
});

// == LOGOUT ROUTE ==
app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', [
        'auth=; Max-Age=0; HttpOnly; Path=/; SameSite=Lax',
        'is_master=; Max-Age=0; HttpOnly; Path=/; SameSite=Lax'
    ]);
    console.log("[AUTH_GATE] 用户已登出。");
    res.redirect('/login?info=logged_out');
});


// == ADMIN ROUTES (User Management) ==
// Middleware to protect admin routes
function ensureMasterAdmin(req, res, next) {
    if (req.cookies.auth === '1' && req.cookies.is_master === 'true') {
        return next();
    }
    console.warn("[AUTH_GATE] 未授权访问管理区域，Cookie: ", req.cookies);
    res.status(403).send("访问被拒绝。您必须以主密码用户身份登录才能访问此页面。 <a href='/login'>去登录</a>");
}

app.get('/admin', ensureMasterAdmin, (req, res) => {
    const users = readUserCredentials();
    const error = req.query.error;
    const success = req.query.success;
    let messageHtml = '';
    if (error === 'user_exists') messageHtml = '<p class="message error-message">错误：用户名已存在。</p>';
    if (error === 'password_mismatch') messageHtml = '<p class="message error-message">错误：两次输入的密码不匹配。</p>';
    if (error === 'password_short') messageHtml = '<p class="message error-message">错误：密码至少需要8个字符。</p>';
    if (error === 'unknown') messageHtml = '<p class="message error-message">发生未知错误。</p>';
    if (success === 'user_added') messageHtml = '<p class="message success-message">用户添加成功。</p>';
    if (success === 'user_deleted') messageHtml = '<p class="message success-message">用户删除成功。</p>';
    if (success === 'password_changed') messageHtml = '<p class="message success-message">用户密码修改成功。</p>';


    let usersTableHtml = '<table><thead><tr><th>用户名</th><th>操作</th></tr></thead><tbody>';
    if (Object.keys(users).length === 0) {
        usersTableHtml += '<tr><td colspan="2">当前没有普通用户。</td></tr>';
    } else {
        for (const username in users) {
            usersTableHtml += `
                <tr>
                    <td>${username}</td>
                    <td class="actions">
                        <form method="POST" action="/admin/delete_user" style="display:inline;">
                            <input type="hidden" name="usernameToDelete" value="${username}">
                            <button type="submit" class="danger" onclick="return confirm('确定要删除用户 ${username} 吗？');">删除</button>
                        </form>
                        <form method="POST" action="/admin/change_password_page" style="display:inline;">
                             <input type="hidden" name="usernameToChange" value="${username}">
                             <button type="submit">修改密码</button>
                        </form>
                    </td>
                </tr>`;
        }
    }
    usersTableHtml += '</tbody></table>';

    res.send(`
        <!DOCTYPE html><html lang="zh-CN">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>用户管理</title><style>${pageStyles}</style></head>
        <body>
            <a href="/logout" class="logout-link button-link">登出主账户</a>
            <div class="container admin-container">
                <h2>用户管理面板 (主账户)</h2>
                ${messageHtml}
                
                <h3>现有用户</h3>
                ${usersTableHtml}

                <h3>添加新用户</h3>
                <form method="POST" action="/admin/add_user">
                    <div class="form-row">
                        <div class="field">
                            <label for="newUsername">新用户名:</label>
                            <input type="text" id="newUsername" name="newUsername" required>
                        </div>
                        <div class="field">
                            <label for="newUserPassword">新用户密码 (至少8位):</label>
                            <input type="password" id="newUserPassword" name="newUserPassword" required minlength="8">
                        </div>
                         <div class="field">
                            <label for="confirmNewUserPassword">确认密码:</label>
                            <input type="password" id="confirmNewUserPassword" name="confirmNewUserPassword" required minlength="8">
                        </div>
                        <button type="submit" style="align-self: flex-end;">添加用户</button>
                    </div>
                </form>
                 <p><a href="/" class="button-link" style="margin-top:20px;">访问主应用</a></p>
            </div>
        </body></html>
    `);
});

app.post('/admin/add_user', ensureMasterAdmin, (req, res) => {
    const { newUsername, newUserPassword, confirmNewUserPassword } = req.body;
    if (!newUsername || !newUserPassword || !confirmNewUserPassword ) {
        return res.redirect('/admin?error=missing_fields');
    }
    if (newUserPassword.length < 8) {
        return res.redirect('/admin?error=password_short');
    }
    if (newUserPassword !== confirmNewUserPassword) {
        return res.redirect('/admin?error=password_mismatch');
    }

    const users = readUserCredentials();
    if (users[newUsername]) {
        return res.redirect('/admin?error=user_exists');
    }

    try {
        users[newUsername] = { passwordHash: encryptUserPassword(newUserPassword) };
        saveUserCredentials(users);
        console.log(`[AUTH_GATE_ADMIN] 用户 '${newUsername}' 已添加。`);
        res.redirect('/admin?success=user_added');
    } catch (error) {
        console.error("[AUTH_GATE_ADMIN] 添加用户失败:", error);
        res.redirect('/admin?error=unknown');
    }
});

app.post('/admin/delete_user', ensureMasterAdmin, (req, res) => {
    const { usernameToDelete } = req.body;
    if (!usernameToDelete) {
        return res.redirect('/admin?error=unknown');
    }
    const users = readUserCredentials();
    if (!users[usernameToDelete]) {
        return res.redirect('/admin?error=user_not_found'); // Should not happen if UI is correct
    }
    delete users[usernameToDelete];
    try {
        saveUserCredentials(users);
        console.log(`[AUTH_GATE_ADMIN] 用户 '${usernameToDelete}' 已删除。`);
        res.redirect('/admin?success=user_deleted');
    } catch (error) {
        console.error(`[AUTH_GATE_ADMIN] 删除用户 '${usernameToDelete}' 失败:`, error);
        res.redirect('/admin?error=unknown');
    }
});

app.post('/admin/change_password_page', ensureMasterAdmin, (req, res) => {
    const { usernameToChange } = req.body;
    const error = req.query.error;
    let errorMessageHtml = '';
    if (error === 'mismatch') errorMessageHtml = '<p class="message error-message">两次输入的密码不匹配！</p>';
    else if (error === 'short') errorMessageHtml = '<p class="message error-message">密码长度至少需要8个字符！</p>';

    if (!usernameToChange) return res.redirect('/admin?error=unknown');

    res.send(`
        <!DOCTYPE html><html lang="zh-CN">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>修改用户密码</title><style>${pageStyles}</style></head>
        <body>
            <div class="container">
                <h2>修改用户 '${usernameToChange}' 的密码</h2>
                ${errorMessageHtml}
                <form method="POST" action="/admin/perform_change_password">
                    <input type="hidden" name="username" value="${usernameToChange}">
                    <label for="newPassword">新密码 (至少8位):</label>
                    <input type="password" id="newPassword" name="newPassword" required minlength="8" autofocus>
                    <label for="confirmPassword">确认新密码:</label>
                    <input type="password" id="confirmPassword" name="confirmPassword" required minlength="8">
                    <button type="submit" class="full-width">确认修改密码</button>
                    <p style="margin-top: 15px;"><a href="/admin">返回用户管理</a></p>
                </form>
            </div>
        </body></html>
    `);
});

app.post('/admin/perform_change_password', ensureMasterAdmin, (req, res) => {
    const { username, newPassword, confirmPassword } = req.body;
    if (!username || !newPassword || !confirmPassword) {
         return res.redirect(`/admin/change_password_page?usernameToChange=${encodeURIComponent(username)}&error=missing_fields`);
    }
    if (newPassword.length < 8) {
        return res.redirect(`/admin/change_password_page?usernameToChange=${encodeURIComponent(username)}&error=short`);
    }
    if (newPassword !== confirmPassword) {
        return res.redirect(`/admin/change_password_page?usernameToChange=${encodeURIComponent(username)}&error=mismatch`);
    }

    const users = readUserCredentials();
    if (!users[username]) {
        return res.redirect('/admin?error=user_not_found');
    }

    try {
        users[username].passwordHash = encryptUserPassword(newPassword);
        saveUserCredentials(users);
        console.log(`[AUTH_GATE_ADMIN] 用户 '${username}' 的密码已修改。`);
        res.redirect('/admin?success=password_changed');
    } catch (error) {
        console.error(`[AUTH_GATE_ADMIN] 修改用户 '${username}' 密码失败:`, error);
        res.redirect(`/admin/change_password_page?usernameToChange=${encodeURIComponent(username)}&error=unknown`);
    }
});


// --- 7. 反向代理中间件 ---
const proxyToMainApp = createProxyMiddleware({
    target: `http://localhost:${APP_INTERNAL_PORT}`,
    changeOrigin: true,
    ws: true,
    logLevel: 'info',
    onError: (err, req, res) => {
        console.error('[AUTH_GATE_PROXY] 代理发生错误:', err.message);
        if (res && !res.headersSent) {
             try { res.writeHead(502, { 'Content-Type': 'text/html' }); } catch (e) { /* ignore */ }
        }
        if (res && res.writable && !res.writableEnded) {
            try {
                res.end(`
                    <div style="text-align:center;padding:40px;font-family:sans-serif;">
                        <h2>代理错误</h2>
                        <p>无法连接到后端应用程序 (server.js)。请检查其是否已启动并监听内部端口 ${APP_INTERNAL_PORT}。</p>
                        <p>错误: ${err.message}</p>
                        </div>
                `);
            } catch (e) { /* ignore */ }
        } else if (res && !res.writableEnded) {
            try { res.end(); } catch (e) { /* ignore */ }
        }
    }
});

// This middleware should be placed AFTER specific auth routes and admin routes.
// It will catch all other requests that have passed the authentication checks.
app.use((req, res, next) => {
    // If we reach here, it means:
    // 1. Master password is set (isMasterPasswordSetupNeeded is false).
    // 2. User is authenticated (req.cookies.auth === '1').
    // 3. Path is not /login, /do_login, /setup, /do_setup, /logout.
    // 4. If path is /admin/*, it has already passed ensureMasterAdmin.
    // So, if not an admin path, it's a request for the main app.
    // Admin paths are handled by their own route handlers and don't need proxying.
    
    if (!req.path.startsWith('/admin')) { // Only proxy non-admin authenticated requests
        if (!isMasterPasswordSetupNeeded && req.cookies.auth === '1') {
            return proxyToMainApp(req, res, next);
        }
    }
    // If it's an admin path, it would have been handled by specific admin routes.
    // If it's an unauthenticated request that somehow slipped through, or an admin path without master auth,
    // previous middleware should have caught it. This is a fallback.
    console.warn(`[AUTH_GATE] 请求未被特定路由或代理处理: ${req.path}, AuthCookie: ${req.cookies.auth}, IsMaster: ${req.cookies.is_master}`);
    // Let specific route handlers above (like admin) or the global auth middleware deal with final response.
    // If it reaches here without being handled, it's likely a logic error or an unhandled admin sub-path.
    // However, since admin routes explicitly call next() or send a response, this might not be hit often
    // for /admin paths.
    // For non-admin paths that are not authenticated, the global middleware already redirects.
    // So, the primary purpose here is to ensure only authenticated non-admin paths get proxied.
    next(); // Allow Express to 404 if no other route matches (e.g. undefined admin sub-path)
});


// --- 8. 服务器启动 ---
const server = app.listen(PUBLIC_PORT, () => {
    console.log(`[AUTH_GATE] 认证网关与反向代理服务已在端口 ${PUBLIC_PORT} 上启动。`);
    if (isMasterPasswordSetupNeeded) {
        console.log(`[AUTH_GATE] 请访问 http://<你的服务器IP或localhost>:${PUBLIC_PORT}/setup 完成初始主密码设置。`);
    } else {
        console.log(`[AUTH_GATE] 主应用将由本服务管理。请访问 http://<你的服务器IP或localhost>:${PUBLIC_PORT}/login 进行登录。`);
        startMainApp(); // Start main app if master password is already set
    }
    console.warn(
        "[AUTH_GATE] 安全提示：用户密码加密方式仅为基础级别。" +
        `请确保 ${MASTER_SECRET_KEY_FILE} 文件的安全和备份。`
    );
});

server.on('error', (error) => {
    if (error.syscall !== 'listen') {
        console.error('[AUTH_GATE] 发生了一个非监听相关的服务器错误:', error);
        process.exit(1); // Exit on critical server errors not related to listen
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
            const killed = serverJsProcess.kill('SIGTERM'); // Try SIGTERM first
            if (killed) {
                console.log('[AUTH_GATE] 已向主应用发送 SIGTERM 信号。等待其退出...');
                const killTimeout = setTimeout(() => {
                    if (serverJsProcess && !serverJsProcess.killed) {
                        console.warn('[AUTH_GATE] 主应用未在 SIGTERM 后3秒内退出，强制发送 SIGKILL...');
                        serverJsProcess.kill('SIGKILL'); // Force kill if it doesn't respond
                    }
                    process.exit(0);
                }, 3000); // 3 seconds grace period
                serverJsProcess.on('exit', () => { // If it exits cleanly before timeout
                    clearTimeout(killTimeout);
                    console.log('[AUTH_GATE] 主应用已成功退出。');
                    process.exit(0);
                });
                return; // Important: allow async exit of child
            } else {
                 console.warn('[AUTH_GATE] 向主应用发送 SIGTERM 信号失败。可能已退出或无权限。');
            }
        }
        process.exit(0); // Exit if no child process or kill signal failed
    });

    // Force shutdown of this auth gate server if it doesn't close gracefully
    setTimeout(() => {
        console.error('[AUTH_GATE] 优雅关闭超时 (10秒)，强制退出。');
        process.exit(1); // Exit with error code
    }, 10000); // 10 seconds overall timeout for this server
}

process.on('SIGINT', () => shutdownGracefully('SIGINT'));
process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
