// --- 0. Dependencies ---
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { spawn } = require('child_process');
const fs = require('fs').promises; // Using promises API for fs
const path = require('path');
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');

// --- 1. Configuration and Constants ---
const config = {
    PUBLIC_PORT: parseInt(process.env.AUTH_GATE_PUBLIC_PORT, 10) || 8100,
    APP_INTERNAL_PORT: parseInt(process.env.AUTH_GATE_APP_INTERNAL_PORT, 10) || 3000,
    DATA_DIR: process.env.AUTH_GATE_DATA_DIR || __dirname,
    get MASTER_PASSWORD_STORAGE_FILE() { return path.join(this.DATA_DIR, 'master_auth_config.enc'); },
    get USER_CREDENTIALS_STORAGE_FILE() { return path.join(this.DATA_DIR, 'user_credentials.enc'); },
    get MASTER_SECRET_KEY_FILE() { return path.join(this.DATA_DIR, 'encryption.secret.key'); },
    ALGORITHM: 'aes-256-cbc',
    IV_LENGTH: 16,
    COOKIE_MAX_AGE: 3600 * 1000, // 1 hour in milliseconds
    LOG_PREFIX: '[AUTH_GATE]',
    SCRYPT_SALT: 'a_fixed_salt_for_scrypt_derivation_v1', // Keep this fixed for existing encrypted data
    SCRYPT_KEYLEN: 32,
    SHUTDOWN_TIMEOUT_MS: 10000, // Overall shutdown timeout
    CHILD_PROCESS_KILL_TIMEOUT_MS: 3000 // Timeout for child process SIGTERM before SIGKILL
};

const pageStyles = `
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f0f2f5; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; margin: 0; color: #333; padding: 20px 0; box-sizing: border-box; }
    .container { background-color: #fff; padding: 30px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); text-align: center; width: 400px; max-width: 90%; margin-bottom: 20px;}
    .admin-container { width: 800px; max-width: 95%; text-align:left; }
    h2 { margin-top: 0; margin-bottom: 25px; color: #1d2129; font-size: 22px; }
    h3 { margin-top: 30px; margin-bottom: 15px; color: #1d2129; font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 5px;}
    input[type="password"], input[type="text"] { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #dddfe2; border-radius: 6px; box-sizing: border-box; font-size: 16px; }
    input[type="password"]:focus, input[type="text"]:focus { border-color: #007bff; outline: none; box-shadow: 0 0 0 2px rgba(0,123,255,.25); }
    button[type="submit"], .button-link { display: inline-block; width: auto; padding: 12px 20px; background-color: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 17px; font-weight: bold; transition: background-color 0.2s; margin-top: 10px; text-decoration: none; text-align:center; }
    button[type="submit"].full-width { width: 100%; }
    button[type="submit"]:hover, .button-link:hover { background-color: #0056b3; }
    button[type="submit"].danger { background-color: #dc3545; }
    button[type="submit"].danger:hover { background-color: #c82333; }
    .message { margin-bottom: 15px; font-weight: 500; font-size: 0.95em; padding: 10px; border-radius: 5px; }
    .error-message { color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb;}
    .success-message { color: #155724; background-color: #d4edda; border: 1px solid #c3e6cb;}
    .info-message { color: #0c5460; background-color: #d1ecf1; border: 1px solid #bee5eb; font-size: 0.85em; margin-top:15px; line-height: 1.4; }
    label { display: block; text-align: left; margin-bottom: 5px; font-weight: 500; font-size: 0.9em; }
    a { color: #007bff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
    th { background-color: #f8f9fa; }
    .actions form { display: inline-block; margin-right: 5px; }
    .actions button { padding: 5px 10px; font-size: 0.9em; margin-top: 0; }
    .form-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin-bottom: 15px;}
    .form-row .field { flex-grow: 1; min-width: 150px; }
    .form-row label, .form-row input { margin-bottom: 0; }
    .form-row button { align-self: flex-end; }
    .logout-link-container { width: 100%; text-align: right; margin-bottom: 10px; }
    .nav-links { margin-top: 20px; text-align: center; }
`;

// --- Global State (initialized in runAuthGate) ---
let ENCRYPTION_SECRET_KEY_TEXT;
let DERIVED_ENCRYPTION_KEY;
let isMasterPasswordSetupNeeded;
let serverJsProcess = null;

// --- 2. Helper Functions ---

/**
 * Renders a full HTML page with common styles and structure.
 * @param {string} title - The title of the HTML page.
 * @param {string} bodyHtml - The HTML content for the body.
 * @param {string} [headExtras=''] - Extra HTML for the head section (e.g., scripts).
 * @returns {string} The complete HTML page.
 */
function renderPage(title, bodyHtml, headExtras = '') {
    return `
        <!DOCTYPE html><html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <style>${pageStyles}</style>
            ${headExtras}
        </head>
        <body>
            ${bodyHtml}
        </body>
        </html>
    `;
}

/**
 * Encrypts text using the derived encryption key.
 * @param {string} text - The text to encrypt.
 * @returns {string} The IV and encrypted text, colon-separated.
 * @throws {Error} If encryption fails.
 */
function encryptUserPassword(text) {
    try {
        const iv = crypto.randomBytes(config.IV_LENGTH);
        const cipher = crypto.createCipheriv(config.ALGORITHM, DERIVED_ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error(`${config.LOG_PREFIX} 数据加密函数内部错误:`, error);
        throw new Error("Data encryption failed.");
    }
}

/**
 * Decrypts text using the derived encryption key.
 * @param {string} text - The IV and encrypted text, colon-separated.
 * @returns {string|null} The decrypted text, or null if decryption fails.
 */
function decryptUserPassword(text) {
    try {
        const parts = text.split(':');
        if (parts.length !== 2) {
            console.error(`${config.LOG_PREFIX} 数据解密失败：密文格式无效（缺少IV）。`);
            return null;
        }
        const iv = Buffer.from(parts.shift(), 'hex');
        const encryptedText = parts.join(':'); // In case the original text contained colons
        const decipher = crypto.createDecipheriv(config.ALGORITHM, DERIVED_ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error(`${config.LOG_PREFIX} 数据解密函数内部错误: ${error.message}`);
        return null;
    }
}

// --- 3. Core Logic Functions ---

/**
 * Initializes or retrieves the master encryption secret key.
 * Generates a new key if one doesn't exist.
 * @returns {Promise<string>} The encryption secret key text.
 */
async function initializeEncryptionSecretKeyText() {
    try {
        await fs.access(config.MASTER_SECRET_KEY_FILE); // Check existence
        console.log(`${config.LOG_PREFIX} 应用提示：正在从 ${config.MASTER_SECRET_KEY_FILE} 读取主加密密钥...`);
        const keyText = (await fs.readFile(config.MASTER_SECRET_KEY_FILE, 'utf8')).trim();
        if (keyText.length < 64) { // 32 bytes = 64 hex chars. randomBytes(48) = 96 hex chars.
            console.warn(`${config.LOG_PREFIX} 安全警告：${config.MASTER_SECRET_KEY_FILE} 中的密钥文本长度 (${keyText.length}) 可能不足 (推荐至少64个十六进制字符)。`);
        }
        return keyText;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`${config.LOG_PREFIX} 应用提示：主加密密钥文件 ${config.MASTER_SECRET_KEY_FILE} 不存在。正在生成新密钥...`);
            const newKeyText = crypto.randomBytes(48).toString('hex'); // 48 bytes = 96 hex characters
            try {
                await fs.writeFile(config.MASTER_SECRET_KEY_FILE, newKeyText, { encoding: 'utf8', mode: 0o600 });
                // Ensure permissions (mode in writeFile might be affected by umask)
                await fs.chmod(config.MASTER_SECRET_KEY_FILE, 0o600);
                console.log(`${config.LOG_PREFIX} 应用提示：新的主加密密钥已生成并保存到 ${config.MASTER_SECRET_KEY_FILE} (权限 600)。`);
                console.warn(`${config.LOG_PREFIX} 重要：请务必保护好 ${config.MASTER_SECRET_KEY_FILE} 文件！`);
                return newKeyText;
            } catch (writeError) {
                console.error(`${config.LOG_PREFIX} 严重错误：无法写入或设置主加密密钥文件 ${config.MASTER_SECRET_KEY_FILE} 的权限。`, writeError);
                process.exit(1);
            }
        } else {
            console.error(`${config.LOG_PREFIX} 严重错误：读取主加密密钥文件 ${config.MASTER_SECRET_KEY_FILE} 时发生错误。`, error);
            process.exit(1);
        }
    }
}

/**
 * Checks if the master password setup is needed by looking for the storage file.
 * @returns {Promise<boolean>} True if setup is needed, false otherwise.
 */
async function checkMasterPasswordSetup() {
    try {
        await fs.access(config.MASTER_PASSWORD_STORAGE_FILE);
        return false; // File exists, setup not needed
    } catch (error) {
        if (error.code === 'ENOENT') {
            return true; // File does not exist, setup needed
        }
        console.error(`${config.LOG_PREFIX} 错误：检查主密码文件 ${config.MASTER_PASSWORD_STORAGE_FILE} 时出错:`, error);
        process.exit(1); // Critical error
    }
}

/**
 * Reads and decrypts user credentials from storage.
 * Handles file corruption by attempting to reset to an empty state.
 * @returns {Promise<object>} The user credentials object.
 */
async function readUserCredentials() {
    try {
        await fs.access(config.USER_CREDENTIALS_STORAGE_FILE);
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        console.error(`${config.LOG_PREFIX} 检查用户凭证文件 ${config.USER_CREDENTIALS_STORAGE_FILE} 权限或存在性时出错:`, error);
        throw error; // Propagate other errors like permission issues
    }

    let encryptedData;
    try {
        encryptedData = await fs.readFile(config.USER_CREDENTIALS_STORAGE_FILE, 'utf8');
    } catch (readError) {
        console.error(`${config.LOG_PREFIX} 读取用户凭证文件 ${config.USER_CREDENTIALS_STORAGE_FILE} 失败:`, readError);
        throw new Error(`Failed to read user credentials file: ${readError.message}`);
    }
    
    if (!encryptedData.trim()) return {};

    const decryptedData = decryptUserPassword(encryptedData);
    if (decryptedData === null) {
        console.error(`${config.LOG_PREFIX} 解密用户凭证失败。文件 ${config.USER_CREDENTIALS_STORAGE_FILE} 可能已损坏或密钥不匹配。将尝试重置。`);
        try {
            // Backup corrupted file before overwriting
            const backupPath = `${config.USER_CREDENTIALS_STORAGE_FILE}.corrupted.${Date.now()}`;
            await fs.rename(config.USER_CREDENTIALS_STORAGE_FILE, backupPath);
            console.warn(`${config.LOG_PREFIX} 损坏的用户凭证文件已备份到 ${backupPath}`);
        } catch (backupError) {
            console.error(`${config.LOG_PREFIX} 备份损坏的用户凭证文件失败:`, backupError);
        }
        await saveUserCredentials({}); // Reset to empty, correctly encrypted
        return {};
    }

    try {
        return JSON.parse(decryptedData);
    } catch (parseError) {
        console.error(`${config.LOG_PREFIX} 解析解密后的用户凭证失败 (JSON格式错误)。文件 ${config.USER_CREDENTIALS_STORAGE_FILE} 可能已损坏。将尝试重置。`, parseError);
        try {
             // Backup corrupted file before overwriting (if not already done by decryption failure)
            const backupPath = `${config.USER_CREDENTIALS_STORAGE_FILE}.corrupted.parse.${Date.now()}`;
            // Check if file still exists before renaming (it might have been renamed if decryption failed)
            try {
                await fs.access(config.USER_CREDENTIALS_STORAGE_FILE);
                await fs.rename(config.USER_CREDENTIALS_STORAGE_FILE, backupPath);
                console.warn(`${config.LOG_PREFIX} 格式错误的用户凭证文件已备份到 ${backupPath}`);
            } catch (e) { /* ignore if already renamed or gone */ }
        } catch (backupError) {
            console.error(`${config.LOG_PREFIX} 备份格式错误的用户凭证文件失败:`, backupError);
        }
        await saveUserCredentials({});
        return {};
    }
}

/**
 * Encrypts and saves user credentials to storage.
 * @param {object} usersObject - The user credentials object to save.
 * @returns {Promise<void>}
 * @throws {Error} If saving fails.
 */
async function saveUserCredentials(usersObject) {
    try {
        const dataToEncrypt = JSON.stringify(usersObject, null, 2);
        const encryptedData = encryptUserPassword(dataToEncrypt);
        await fs.writeFile(config.USER_CREDENTIALS_STORAGE_FILE, encryptedData, 'utf8');
    } catch (error) {
        console.error(`${config.LOG_PREFIX} 保存用户凭证失败:`, error);
        throw new Error("Failed to save user credentials.");
    }
}

/**
 * Starts and manages the main application (server.js) as a child process.
 */
function startMainApp() {
    if (serverJsProcess && !serverJsProcess.killed) {
        console.log(`${config.LOG_PREFIX} 主应用 (server.js) 已在运行中或正在尝试启动。`);
        return;
    }
    console.log(`${config.LOG_PREFIX} 尝试启动主应用 (server.js)，该应用应固定监听端口 ${config.APP_INTERNAL_PORT}...`);
    const mainAppPath = path.join(__dirname, 'server.js'); // Assuming server.js is in the same directory
    const options = { stdio: 'inherit' }; // Inherit stdio for logs from main app

    try {
        serverJsProcess = spawn('node', [mainAppPath], options);
    } catch (spawnError) {
        console.error(`${config.LOG_PREFIX} 创建主应用 (server.js) 进程失败: ${spawnError.message}`);
        serverJsProcess = null;
        return;
    }
    

    serverJsProcess.on('error', (err) => {
        console.error(`${config.LOG_PREFIX} 启动主应用 (server.js) 失败: ${err.message}`);
        serverJsProcess = null; // Reset process variable
    });

    serverJsProcess.on('exit', (code, signal) => {
        const reason = code !== null ? `退出码 ${code}` : `信号 ${signal}`;
        console.log(`${config.LOG_PREFIX} 主应用 (server.js) 已退出 (${reason})。`);
        serverJsProcess = null; // Reset process variable
    });

    if (serverJsProcess.pid) {
        console.log(`${config.LOG_PREFIX} 主应用 (server.js) 进程已启动，PID: ${serverJsProcess.pid}`);
    } else {
        // This case might be hard to reach if spawn itself throws for critical errors.
        // If spawn returns a process object but it has no PID, it's an issue.
        console.error(`${config.LOG_PREFIX} 主应用 (server.js) 未能立即获取PID，可能启动失败。`);
        serverJsProcess = null; 
    }
}

// --- 4. Main Application Logic (runAuthGate) ---
async function runAuthGate() {
    // Initialize encryption key and master password status
    ENCRYPTION_SECRET_KEY_TEXT = await initializeEncryptionSecretKeyText();
    DERIVED_ENCRYPTION_KEY = crypto.scryptSync(ENCRYPTION_SECRET_KEY_TEXT, config.SCRYPT_SALT, config.SCRYPT_KEYLEN);
    isMasterPasswordSetupNeeded = await checkMasterPasswordSetup();

    if (isMasterPasswordSetupNeeded) {
        console.log(`${config.LOG_PREFIX} 应用提示：未找到主密码配置文件。首次运行，请设置主密码。`);
    } else {
        console.log(`${config.LOG_PREFIX} 应用提示：主密码配置文件已存在。进入登录模式。`);
    }

    const app = express();
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(cookieParser());

    // --- 5. Global Authentication and Setup Redirection Middleware ---
    app.use((req, res, next) => {
        const authRelatedPaths = ['/login', '/do_login', '/setup', '/do_setup'];
        const isAdminPath = req.path.startsWith('/admin');
        const isLogoutPath = req.path === '/logout';

        if (isMasterPasswordSetupNeeded) {
            if (req.path === '/setup' || req.path === '/do_setup') {
                return next();
            }
            return res.redirect('/setup');
        }

        // User is authenticated
        if (req.cookies.auth === '1') {
            if (isLogoutPath) return next();

            if (authRelatedPaths.includes(req.path) && req.path !== '/logout') { // Allow logout even if on login page
                 return res.redirect(req.cookies.is_master === 'true' ? '/admin' : '/');
            }
            // Prevent non-master users from accessing admin area
            if (isAdminPath && req.cookies.is_master !== 'true') {
                console.warn(`${config.LOG_PREFIX} 普通用户尝试访问管理页面: ${req.path}`);
                const body = `
                    <div class="container">
                        <p class="error-message">无权访问此页面。仅主密码登录用户可访问。</p>
                        <a href="/" class="button-link">返回首页</a>
                    </div>`;
                return res.status(403).send(renderPage('禁止访问', body));
            }
            return next(); // Authenticated and authorized for the path
        }

        // User is not authenticated
        if (isLogoutPath) return res.redirect('/login'); // Redirect to login if trying to logout without being logged in
        if (authRelatedPaths.includes(req.path)) {
            return next(); // Allow access to login/setup paths
        }
        return res.redirect('/login'); // Redirect all other unauthenticated requests to login
    });

    // --- 6. Route Definitions ---

    // == SETUP MASTER PASSWORD ROUTES ==
    app.get('/setup', (req, res) => {
        if (!isMasterPasswordSetupNeeded) {
            console.warn(`${config.LOG_PREFIX} 警告：主密码已设置，但仍到达 GET /setup 路由。`);
            return res.redirect('/login');
        }
        const error = req.query.error;
        let errorMessageHtml = '';
        if (error === 'mismatch') errorMessageHtml = '<p class="message error-message">两次输入的密码不匹配！</p>';
        else if (error === 'short') errorMessageHtml = '<p class="message error-message">主密码长度至少需要8个字符！</p>';
        else if (error === 'write_failed') errorMessageHtml = '<p class="message error-message">保存主密码失败，请检查服务器权限或日志。</p>';
        else if (error === 'encrypt_failed') errorMessageHtml = '<p class="message error-message">主密码加密失败，请检查服务器日志。</p>';

        const body = `
            <div class="container">
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
            </div>`;
        res.send(renderPage('设置初始主密码', body));
    });

    app.post('/do_setup', async (req, res) => {
        if (!isMasterPasswordSetupNeeded) {
            return res.status(403).send(renderPage('错误', '<div class="container"><p class="error-message">错误：主密码已设置。</p></div>'));
        }
        const { newPassword, confirmPassword } = req.body;

        if (!newPassword || newPassword.length < 8) return res.redirect('/setup?error=short');
        if (newPassword !== confirmPassword) return res.redirect('/setup?error=mismatch');

        let encryptedPassword;
        try {
            encryptedPassword = encryptUserPassword(newPassword);
        } catch (error) {
            return res.redirect('/setup?error=encrypt_failed');
        }

        try {
            await fs.writeFile(config.MASTER_PASSWORD_STORAGE_FILE, encryptedPassword, 'utf8');
            isMasterPasswordSetupNeeded = false; // Update state
            console.log(`${config.LOG_PREFIX} 主密码已成功设置并加密保存。应用现在进入登录模式。`);
            
            // Ensure user credentials file exists, even if empty, after master setup
            try {
                await fs.access(config.USER_CREDENTIALS_STORAGE_FILE);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    await saveUserCredentials({}); 
                    console.log(`${config.LOG_PREFIX} 用户凭证文件已初始化。`);
                }
            }

            startMainApp(); // Start the main application
            const body = `
                <div class="container">
                    <h2 class="success-message">主密码设置成功！</h2>
                    <p>主应用服务已启动。您现在可以 <a href="/login">前往登录页面</a> 使用主密码登录。</p>
                </div>`;
            res.send(renderPage('设置成功', body));
        } catch (error) {
            console.error(`${config.LOG_PREFIX} 保存加密主密码文件失败:`, error);
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
        else if (error === 'no_user_file') messageHtml = '<p class="message error-message">用户凭证文件不存在或无法读取，请先使用主密码登录并检查。</p>';
        else if (error === 'master_not_set') messageHtml = '<p class="message error-message">主密码尚未设置，请先 <a href="/setup">设置主密码</a>。</p>';
        else if (error === 'internal_state') messageHtml = '<p class="message error-message">内部状态错误，请尝试 <a href="/setup">重新设置主密码</a> (如果适用) 或联系管理员。</p>';
        else if (info === 'logged_out') messageHtml = '<p class="message success-message">您已成功登出。</p>';
        
        const loginScript = `
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    const usernameInput = document.getElementById('username');
                    const passwordInput = document.getElementById('password');
                    const loginForm = document.getElementById('loginForm');
                    const submitButton = loginForm.querySelector('button[type="submit"]');

                    function handleEnterKey(event) {
                        if (event.key === 'Enter') {
                            event.preventDefault(); 
                            if (loginForm.checkValidity && !loginForm.checkValidity()) {
                                loginForm.reportValidity(); // Show browser validation messages
                                return;
                            }
                            if (typeof loginForm.requestSubmit === 'function') {
                                loginForm.requestSubmit(submitButton);
                            } else {
                                if (submitButton) submitButton.click();
                                else loginForm.submit();
                            }
                        }
                    }
                    if (usernameInput) usernameInput.addEventListener('keydown', handleEnterKey);
                    if (passwordInput) passwordInput.addEventListener('keydown', handleEnterKey);
                });
            </script>
        `;
        const body = `
            <div class="container">
                <form method="POST" action="/do_login" id="loginForm">
                    <h2>请输入凭证访问</h2>
                    ${messageHtml}
                    <label for="username">用户名 (主密码登录留空):</label>
                    <input type="text" id="username" name="username" autofocus>
                    <label for="password">密码:</label>
                    <input type="password" id="password" name="password" required>
                    <button type="submit" class="full-width">登录</button>
                </form>
            </div>`;
        res.send(renderPage('登录', body, loginScript));
    });

    app.post('/do_login', async (req, res) => {
        if (isMasterPasswordSetupNeeded) {
            return res.redirect('/login?error=master_not_set');
        }
        const { username, password: submittedPassword } = req.body;

        if (!submittedPassword) {
            return res.redirect('/login?error=invalid');
        }

        try {
            // Master password login (username is empty or explicitly "master")
            if (!username || username.toLowerCase() === "master") {
                let encryptedMasterPasswordFromFile;
                try {
                    encryptedMasterPasswordFromFile = await fs.readFile(config.MASTER_PASSWORD_STORAGE_FILE, 'utf8');
                } catch (fileError) {
                     console.error(`${config.LOG_PREFIX} 登录失败：主密码文件 ${config.MASTER_PASSWORD_STORAGE_FILE} 未找到或无法读取，但应用未处于设置模式。`, fileError);
                     isMasterPasswordSetupNeeded = true; // Attempt to fix state
                     return res.redirect('/setup?error=internal_state');
                }
                
                const storedDecryptedMasterPassword = decryptUserPassword(encryptedMasterPasswordFromFile);

                if (storedDecryptedMasterPassword === null) return res.redirect('/login?error=decrypt_failed');
                
                if (submittedPassword === storedDecryptedMasterPassword) {
                    res.setHeader('Set-Cookie', [
                        `auth=1; Max-Age=${config.COOKIE_MAX_AGE / 1000}; HttpOnly; Path=/; SameSite=Lax`,
                        `is_master=true; Max-Age=${config.COOKIE_MAX_AGE / 1000}; HttpOnly; Path=/; SameSite=Lax`
                    ]);
                    console.log(`${config.LOG_PREFIX} 主密码登录成功。`);
                    return res.redirect('/admin');
                } else {
                    return res.redirect('/login?error=invalid');
                }
            } else { // Regular user login
                let users;
                try {
                    users = await readUserCredentials();
                } catch (readError) {
                     console.error(`${config.LOG_PREFIX} 用户登录时读取用户凭证失败:`, readError);
                     return res.redirect('/login?error=read_failed');
                }
                
                // Check if users object is empty AND the file actually had content (meaning readUserCredentials reset it due to corruption)
                if (Object.keys(users).length === 0) {
                    try {
                        const fileContent = await fs.readFile(config.USER_CREDENTIALS_STORAGE_FILE, 'utf8');
                        if (fileContent.trim().length > 0) { // File had content but users is empty -> corruption and reset
                             return res.redirect('/login?error=no_user_file'); // Or decrypt_failed if it was a decrypt issue
                        }
                    } catch (e) { /* if file doesn't exist, it's fine, users is empty */ }
                }


                const userData = users[username];
                if (!userData || !userData.passwordHash) return res.redirect('/login?error=invalid');

                const storedDecryptedPassword = decryptUserPassword(userData.passwordHash);
                if (storedDecryptedPassword === null) {
                    console.error(`${config.LOG_PREFIX} 解密用户 '${username}' 的密码失败。`);
                    return res.redirect('/login?error=decrypt_failed');
                }

                if (submittedPassword === storedDecryptedPassword) {
                    res.setHeader('Set-Cookie', [
                        `auth=1; Max-Age=${config.COOKIE_MAX_AGE / 1000}; HttpOnly; Path=/; SameSite=Lax`,
                        `is_master=false; Max-Age=${config.COOKIE_MAX_AGE / 1000}; HttpOnly; Path=/; SameSite=Lax`
                    ]);
                    console.log(`${config.LOG_PREFIX} 用户 '${username}' 登录成功。重定向到主应用 /`);
                    return res.redirect('/');
                } else {
                    return res.redirect('/login?error=invalid');
                }
            }
        } catch (error) {
            console.error(`${config.LOG_PREFIX} 登录处理时发生未知错误:`, error);
            if (error.code === 'ENOENT' && error.path === config.MASTER_PASSWORD_STORAGE_FILE) {
                 isMasterPasswordSetupNeeded = true;
                 return res.redirect('/setup?error=internal_state');
            }
            res.status(500).send(renderPage('错误', '<div class="container"><p class="error-message">服务器内部错误，无法处理登录请求。</p></div>'));
        }
    });

    // == LOGOUT ROUTE ==
    app.get('/logout', (req, res) => {
        res.setHeader('Set-Cookie', [
            'auth=; Max-Age=0; HttpOnly; Path=/; SameSite=Lax',
            'is_master=; Max-Age=0; HttpOnly; Path=/; SameSite=Lax'
        ]);
        console.log(`${config.LOG_PREFIX} 用户已登出。`);
        res.redirect('/login?info=logged_out');
    });

    // == ADMIN ROUTES (User Management) ==
    function ensureMasterAdmin(req, res, next) {
        if (req.cookies.auth === '1' && req.cookies.is_master === 'true') {
            return next();
        }
        console.warn(`${config.LOG_PREFIX} 未授权访问管理区域，Cookie: `, req.cookies);
        const body = `
            <div class="container">
                <p class="message error-message">访问被拒绝。您必须以主密码用户身份登录才能访问此页面。</p>
                <a href="/login" class="button-link">去登录</a>
            </div>`;
        res.status(403).send(renderPage('禁止访问', body));
    }

    app.get('/admin', ensureMasterAdmin, async (req, res) => {
        let users;
        try {
            users = await readUserCredentials();
        } catch (error) {
            console.error(`${config.LOG_PREFIX} 管理面板读取用户凭证失败:`, error);
            const errorBody = `<div class="container admin-container"><p class="error-message">无法加载用户数据。请检查日志。</p></div>`;
            return res.status(500).send(renderPage('管理错误', errorBody));
        }

        const error = req.query.error;
        const success = req.query.success;
        let messageHtml = '';
        if (error === 'user_exists') messageHtml = '<p class="message error-message">错误：用户名已存在或为保留字 (master)。</p>';
        else if (error === 'password_mismatch') messageHtml = '<p class="message error-message">错误：两次输入的密码不匹配。</p>';
        else if (error === 'missing_fields') messageHtml = '<p class="message error-message">错误：所有必填字段不能为空。</p>';
        else if (error === 'unknown') messageHtml = '<p class="message error-message">发生未知错误。</p>';
        else if (error === 'user_not_found') messageHtml = '<p class="message error-message">错误: 未找到指定用户。</p>';
        
        if (success === 'user_added') messageHtml = '<p class="message success-message">用户添加成功。</p>';
        else if (success === 'user_deleted') messageHtml = '<p class="message success-message">用户删除成功。</p>';
        else if (success === 'password_changed') messageHtml = '<p class="message success-message">用户密码修改成功。</p>';

        let usersTableHtml = '<table><thead><tr><th>用户名</th><th>操作</th></tr></thead><tbody>';
        if (Object.keys(users).length === 0) {
            usersTableHtml += '<tr><td colspan="2" style="text-align:center;">当前没有普通用户。</td></tr>';
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

        const body = `
            <div class="container admin-container">
                <div class="logout-link-container"><a href="/logout" class="button-link">登出主账户</a></div>
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
                            <label for="newUserPassword">新用户密码:</label>
                            <input type="password" id="newUserPassword" name="newUserPassword" required>
                        </div>
                         <div class="field">
                            <label for="confirmNewUserPassword">确认密码:</label>
                            <input type="password" id="confirmNewUserPassword" name="confirmNewUserPassword" required>
                        </div>
                        <button type="submit">添加用户</button>
                    </div>
                </form>
                <div class="nav-links">
                    <a href="/" class="button-link">访问主应用</a>
                </div>
            </div>`;
        res.send(renderPage('用户管理', body));
    });

    app.post('/admin/add_user', ensureMasterAdmin, async (req, res) => {
        const { newUsername, newUserPassword, confirmNewUserPassword } = req.body;
        if (!newUsername || !newUserPassword || !confirmNewUserPassword) {
            return res.redirect('/admin?error=missing_fields');
        }
        if (newUserPassword !== confirmNewUserPassword) {
            return res.redirect('/admin?error=password_mismatch');
        }
        if (newUsername.toLowerCase() === "master") { // Reserved username
            return res.redirect('/admin?error=user_exists');
        }

        try {
            const users = await readUserCredentials();
            if (users[newUsername]) {
                return res.redirect('/admin?error=user_exists');
            }
            users[newUsername] = { passwordHash: encryptUserPassword(newUserPassword) };
            await saveUserCredentials(users);
            console.log(`${config.LOG_PREFIX}_ADMIN 用户 '${newUsername}' 已添加。`);
            res.redirect('/admin?success=user_added');
        } catch (error) {
            console.error(`${config.LOG_PREFIX}_ADMIN 添加用户失败:`, error);
            res.redirect('/admin?error=unknown');
        }
    });

    app.post('/admin/delete_user', ensureMasterAdmin, async (req, res) => {
        const { usernameToDelete } = req.body;
        if (!usernameToDelete) return res.redirect('/admin?error=unknown');
        
        try {
            const users = await readUserCredentials();
            if (!users[usernameToDelete]) return res.redirect('/admin?error=user_not_found');
            
            delete users[usernameToDelete];
            await saveUserCredentials(users);
            console.log(`${config.LOG_PREFIX}_ADMIN 用户 '${usernameToDelete}' 已删除。`);
            res.redirect('/admin?success=user_deleted');
        } catch (error) {
            console.error(`${config.LOG_PREFIX}_ADMIN 删除用户 '${usernameToDelete}' 失败:`, error);
            res.redirect('/admin?error=unknown');
        }
    });

    app.post('/admin/change_password_page', ensureMasterAdmin, async (req, res) => {
        const { usernameToChange } = req.body;
        const error = req.query.error; // For re-displaying errors if redirect happens
        let errorMessageHtml = '';
        if (error === 'mismatch') errorMessageHtml = '<p class="message error-message">两次输入的密码不匹配！</p>';
        else if (error === 'missing_fields') errorMessageHtml = '<p class="message error-message">错误：所有密码字段均为必填项。</p>';
        else if (error === 'unknown') errorMessageHtml = '<p class="message error-message">发生未知错误。</p>';

        if (!usernameToChange) return res.redirect('/admin?error=unknown');
        
        try {
            const users = await readUserCredentials();
            if (!users[usernameToChange]) return res.redirect('/admin?error=user_not_found');

            const body = `
                <div class="container">
                    <h2>修改用户 '${usernameToChange}' 的密码</h2>
                    ${errorMessageHtml}
                    <form method="POST" action="/admin/perform_change_password">
                        <input type="hidden" name="username" value="${usernameToChange}">
                        <label for="newPassword">新密码:</label>
                        <input type="password" id="newPassword" name="newPassword" required autofocus>
                        <label for="confirmPassword">确认新密码:</label>
                        <input type="password" id="confirmPassword" name="confirmPassword" required>
                        <button type="submit" class="full-width">确认修改密码</button>
                        <div class="nav-links">
                            <a href="/admin" class="button-link">返回用户管理</a>
                        </div>
                    </form>
                </div>`;
            res.send(renderPage('修改用户密码', body));
        } catch (error) {
            console.error(`${config.LOG_PREFIX}_ADMIN 准备修改密码页面时出错:`, error);
            res.redirect('/admin?error=unknown');
        }
    });

    app.post('/admin/perform_change_password', ensureMasterAdmin, async (req, res) => {
        const { username, newPassword, confirmPassword } = req.body;
        const redirectWithError = (errorCode) => res.redirect(`/admin/change_password_page?usernameToChange=${encodeURIComponent(username)}&error=${errorCode}`);

        if (!username || !newPassword || !confirmPassword) return redirectWithError('missing_fields');
        if (newPassword !== confirmPassword) return redirectWithError('mismatch');

        try {
            const users = await readUserCredentials();
            if (!users[username]) return res.redirect('/admin?error=user_not_found');

            users[username].passwordHash = encryptUserPassword(newPassword);
            await saveUserCredentials(users);
            console.log(`${config.LOG_PREFIX}_ADMIN 用户 '${username}' 的密码已修改。`);
            res.redirect('/admin?success=password_changed');
        } catch (error) {
            console.error(`${config.LOG_PREFIX}_ADMIN 修改用户 '${username}' 密码失败:`, error);
            redirectWithError('unknown');
        }
    });

    // --- 7. Reverse Proxy Middleware ---
    const proxyToMainApp = createProxyMiddleware({
        target: `http://localhost:${config.APP_INTERNAL_PORT}`,
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
        logLevel: 'info', // 'debug', 'info', 'warn', 'error', 'silent'
        onError: (err, req, res, target) => { // Added target parameter
            console.error(`${config.LOG_PREFIX}_PROXY 代理发生错误: ${err.message} for ${req.method} ${req.url} to ${target}`);
            if (res && !res.headersSent) {
                try {
                    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
                } catch (e) { console.error(`${config.LOG_PREFIX}_PROXY Error writing head for proxy error:`, e); }
            }
            if (res && res.writable && !res.writableEnded) {
                try {
                    const body = `
                        <div class="container">
                            <h2 class="error-message">代理错误</h2>
                            <p>无法连接到后端应用程序 (server.js)。</p>
                            <p>请检查其是否已启动并监听内部端口 ${config.APP_INTERNAL_PORT}。</p>
                            <p>错误详情: ${err.message}</p>
                            <div class="nav-links">
                                <a href="/" class="button-link" onclick="window.location.reload(); return false;">重试</a>
                                <a href="/logout" class="button-link danger">登出</a>
                            </div>
                        </div>`;
                    res.end(renderPage('代理错误', body));
                } catch (e) { console.error(`${config.LOG_PREFIX}_PROXY Error ending response for proxy error:`, e); }
            } else if (res && !res.writableEnded) {
                try { res.end(); } catch (e) { /* ignore */ }
            }
        }
    });

    // Apply proxy middleware for authenticated users accessing non-admin paths
    app.use((req, res, next) => {
        // This condition means:
        // 1. Master password setup is NOT needed (app is in normal operation mode)
        // 2. User IS authenticated (auth cookie is '1')
        // 3. The path is NOT an admin path (admin paths are handled by this auth gate itself)
        if (!isMasterPasswordSetupNeeded && req.cookies.auth === '1' && !req.path.startsWith('/admin')) {
            return proxyToMainApp(req, res, next);
        }
        // If the request was not proxied and not handled by any specific route above,
        // it will fall through. The global auth middleware should have already redirected
        // unauthenticated users or handled setup mode.
        // This console.warn can catch unexpected fall-throughs.
        if (!res.headersSent && !authRelatedPaths.includes(req.path) && req.path !== '/logout' && !req.path.startsWith('/admin')) {
             console.warn(`${config.LOG_PREFIX} 请求未被特定路由或代理处理（意外情况）: ${req.path}, Auth: ${req.cookies.auth}, Master: ${req.cookies.is_master}`);
        }
        next();
    });


    // --- 8. Server Startup ---
    const server = app.listen(config.PUBLIC_PORT, () => {
        console.log(`${config.LOG_PREFIX} 认证网关与反向代理服务已在端口 ${config.PUBLIC_PORT} 上启动。`);
        if (isMasterPasswordSetupNeeded) {
            console.log(`${config.LOG_PREFIX} 请访问 http://localhost:${config.PUBLIC_PORT}/setup 完成初始主密码设置。`);
        } else {
            console.log(`${config.LOG_PREFIX} 主应用将由本服务管理。请访问 http://localhost:${config.PUBLIC_PORT}/login 进行登录。`);
            if (!serverJsProcess) { // Start main app if not already running (e.g., after restart of auth gate)
                startMainApp();
            }
        }
        console.warn(
            `${config.LOG_PREFIX} 安全提示：用户密码加密方式仅为基础级别。` +
            `请确保 ${config.MASTER_SECRET_KEY_FILE} 文件的安全和备份。`
        );
    });

    server.on('error', (error) => {
        if (error.syscall !== 'listen') {
            console.error(`${config.LOG_PREFIX} 发生了一个非监听相关的服务器错误:`, error);
            return;
        }
        switch (error.code) {
            case 'EACCES':
                console.error(`${config.LOG_PREFIX} 错误：端口 ${config.PUBLIC_PORT} 需要提升的权限。`);
                process.exit(1);
                break;
            case 'EADDRINUSE':
                console.error(`${config.LOG_PREFIX} 错误：端口 ${config.PUBLIC_PORT} 已被其他应用程序占用。`);
                process.exit(1);
                break;
            default:
                console.error(`${config.LOG_PREFIX} 服务器启动时发生未知监听错误:`, error);
                process.exit(1);
        }
    });

    // --- 9. Graceful Shutdown Handling ---
    function shutdownGracefully(signal) {
        console.log(`\n${config.LOG_PREFIX} 收到 ${signal}。正在关闭服务...`);
        
        const serverClosePromise = new Promise((resolve) => {
            server.close(() => {
                console.log(`${config.LOG_PREFIX} HTTP 服务已关闭。`);
                resolve();
            });
            // Force close connections after a timeout if server.close() hangs
            setTimeout(() => {
                console.warn(`${config.LOG_PREFIX} HTTP 服务关闭超时，可能存在活动连接。`);
                resolve(); // Still resolve to allow child process shutdown
            }, config.SHUTDOWN_TIMEOUT_MS / 2); 
        });

        const childProcessPromise = new Promise((resolve) => {
            if (serverJsProcess && !serverJsProcess.killed) {
                console.log(`${config.LOG_PREFIX} 正在尝试终止主应用 (server.js)...`);
                
                const killTimeout = setTimeout(() => {
                    if (serverJsProcess && !serverJsProcess.killed) {
                        console.warn(`${config.LOG_PREFIX} 主应用未在 SIGTERM 后 ${config.CHILD_PROCESS_KILL_TIMEOUT_MS / 1000}秒内退出，强制发送 SIGKILL...`);
                        serverJsProcess.kill('SIGKILL');
                    }
                    resolve(); // Resolve even if SIGKILL was needed or if process was already gone
                }, config.CHILD_PROCESS_KILL_TIMEOUT_MS);

                serverJsProcess.on('exit', (code, exitSignal) => {
                    clearTimeout(killTimeout);
                    console.log(`${config.LOG_PREFIX} 主应用已成功退出 (Code: ${code}, Signal: ${exitSignal})。`);
                    resolve();
                });

                const killedBySigterm = serverJsProcess.kill('SIGTERM');
                if (!killedBySigterm && serverJsProcess && !serverJsProcess.killed) {
                    console.warn(`${config.LOG_PREFIX} 向主应用发送 SIGTERM 信号失败 (可能已退出或无权限)。`);
                    clearTimeout(killTimeout);
                    resolve();
                } else if (!serverJsProcess || serverJsProcess.killed) { // Already exited or killed
                    clearTimeout(killTimeout);
                    resolve();
                }
                // If killedBySigterm is true, the 'exit' event will handle resolve()
            } else {
                resolve(); // No child process to kill
            }
        });

        Promise.all([serverClosePromise, childProcessPromise]).then(() => {
            console.log(`${config.LOG_PREFIX} 所有服务已关闭。优雅退出。`);
            process.exit(0);
        }).catch(err => {
            console.error(`${config.LOG_PREFIX} 优雅关闭期间发生错误:`, err);
            process.exit(1);
        });

        // Overall timeout for shutdown
        setTimeout(() => {
            console.error(`${config.LOG_PREFIX} 优雅关闭超时 (${config.SHUTDOWN_TIMEOUT_MS / 1000}秒)，强制退出。`);
            process.exit(1);
        }, config.SHUTDOWN_TIMEOUT_MS);
    }

    process.on('SIGINT', () => shutdownGracefully('SIGINT')); // Ctrl+C
    process.on('SIGTERM', () => shutdownGracefully('SIGTERM')); // kill
}

// --- Run the application ---
runAuthGate().catch(err => {
    console.error(`${config.LOG_PREFIX} 关键启动错误，应用无法启动:`, err);
    process.exit(1);
});
