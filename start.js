const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- 1. 配置和常量 ---
const PORT = 8100;
const USER_PASSWORD_STORAGE_FILE = path.join(__dirname, 'auth_config.enc'); // 存储加密用户密码的文件
const MASTER_SECRET_KEY_FILE = path.join(__dirname, 'encryption.secret.key'); // 存储主加密密钥的文件

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES block size for IV

// --- 1a. 获取或生成主加密密钥文本 ---
function initializeEncryptionSecretKeyText() {
    if (fs.existsSync(MASTER_SECRET_KEY_FILE)) {
        console.log(`应用提示：正在从 ${MASTER_SECRET_KEY_FILE} 读取主加密密钥...`);
        const keyText = fs.readFileSync(MASTER_SECRET_KEY_FILE, 'utf8').trim();
        if (keyText.length < 64) {
            console.warn(`安全警告：${MASTER_SECRET_KEY_FILE} 中的密钥文本长度 (${keyText.length}) 可能不足。为保证安全，如果怀疑密钥强度，可考虑删除此文件以重新生成一个更强的密钥。`);
        }
        return keyText;
    } else {
        console.log(`应用提示：主加密密钥文件 ${MASTER_SECRET_KEY_FILE} 不存在。正在生成新密钥...`);
        const newKeyText = crypto.randomBytes(48).toString('hex'); // 生成96个十六进制字符的密钥文本
        try {
            fs.writeFileSync(MASTER_SECRET_KEY_FILE, newKeyText, { encoding: 'utf8', mode: 0o600 });
            fs.chmodSync(MASTER_SECRET_KEY_FILE, 0o600);
            console.log(`应用提示：新的主加密密钥已生成并保存到 ${MASTER_SECRET_KEY_FILE} (权限 600)。`);
            console.warn(`重要：请务必保护好 ${MASTER_SECRET_KEY_FILE} 文件！如果丢失，将无法解密已存储的用户密码。建议安全备份此文件。`);
            return newKeyText;
        } catch (err) {
            console.error(`严重错误：无法写入或设置主加密密钥文件 ${MASTER_SECRET_KEY_FILE} 的权限。请检查目录权限。应用无法继续。`, err);
            process.exit(1);
        }
    }
}

const ENCRYPTION_SECRET_KEY_TEXT = initializeEncryptionSecretKeyText();
const DERIVED_ENCRYPTION_KEY = crypto.scryptSync(ENCRYPTION_SECRET_KEY_TEXT, 'a_fixed_salt_for_scrypt_derivation_v1', 32);

let isUserPasswordSetupNeeded = !fs.existsSync(USER_PASSWORD_STORAGE_FILE);

// --- 2. 加密与解密函数 ---
function encryptUserPassword(text) {
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, DERIVED_ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error("用户密码加密失败:", error);
        throw new Error("User password encryption failed.");
    }
}

function decryptUserPassword(text) {
    try {
        const parts = text.split(':');
        if (parts.length !== 2) {
            console.error("用户密码解密失败：密文格式无效（缺少IV）。");
            return null;
        }
        const iv = Buffer.from(parts.shift(), 'hex');
        const encryptedText = parts.join(':');
        const decipher = crypto.createDecipheriv(ALGORITHM, DERIVED_ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("用户密码解密失败:", error.message);
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

// --- 4. 启动模式判断和全局中间件 ---
if (isUserPasswordSetupNeeded) {
    console.log("应用提示：未找到用户密码配置文件。首次运行，请设置用户密码。");
} else {
    console.log("应用提示：用户密码配置文件已存在。进入登录模式。");
}

app.use((req, res, next) => {
    const allowedSetupPaths = ['/setup', '/do_setup'];
    const allowedLoginPaths = ['/login', '/do_login'];

    if (isUserPasswordSetupNeeded) {
        if (!allowedSetupPaths.includes(req.path)) {
            return res.redirect('/setup');
        }
    } else {
        if (req.cookies.auth === '1') {
            if (allowedLoginPaths.includes(req.path) || allowedSetupPaths.includes(req.path)) {
                return res.redirect('/');
            }
        } else {
            if (!allowedLoginPaths.includes(req.path)) {
                return res.redirect('/login');
            }
        }
    }
    next();
});


// --- 5. 路由定义 ---

// == SETUP ROUTES ==
app.get('/setup', (req, res) => {
    if (!isUserPasswordSetupNeeded) {
        return res.redirect('/login');
    }
    const error = req.query.error;
    let errorMessageHtml = '';
    if (error === 'mismatch') errorMessageHtml = '<p class="message error-message">两次输入的密码不匹配！</p>';
    else if (error === 'short') errorMessageHtml = '<p class="message error-message">密码长度至少需要8个字符！</p>';
    else if (error === 'write_failed') errorMessageHtml = '<p class="message error-message">保存用户密码失败，请检查服务器权限或日志。</p>';
    else if (error === 'encrypt_failed') errorMessageHtml = '<p class="message error-message">密码加密失败，请检查服务器日志。</p>';

    res.send(`
        <!DOCTYPE html><html lang="zh-CN">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>设置初始用户密码</title><style>${pageStyles}</style></head>
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

    try {
        const encryptedPassword = encryptUserPassword(newPassword);
        fs.writeFileSync(USER_PASSWORD_STORAGE_FILE, encryptedPassword, 'utf8');
        isUserPasswordSetupNeeded = false;
        console.log("用户密码已成功设置并加密保存。应用现在进入登录模式。");
        res.send(`
            <!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>设置成功</title><style>${pageStyles}</style></head>
            <body><div class="container">
                <h2 class="success-message">用户密码设置成功！</h2>
                <p>您现在可以 <a href="/login">前往登录页面</a>。</p>
            </div></body></html>
        `);
    } catch (encryptError) {
        console.error("设置用户密码时加密失败:", encryptError);
        res.redirect('/setup?error=encrypt_failed');
    } catch (writeError) { // Catching potential write error separately
        console.error("保存加密用户密码文件失败:", writeError);
        res.redirect('/setup?error=write_failed');
    }
});

// == LOGIN ROUTES ==
app.get('/login', (req, res) => {
    if (isUserPasswordSetupNeeded) {
        return res.redirect('/setup');
    }
    const error = req.query.error;
    let errorMessageHtml = '';
    if (error === 'invalid') errorMessageHtml = '<p class="message error-message">密码错误！</p>';
    else if (error === 'decrypt_failed') errorMessageHtml = '<p class="message error-message">无法验证密码。可能是密钥问题或文件损坏。</p>';
    else if (error === 'read_failed') errorMessageHtml = '<p class="message error-message">无法读取密码配置。请联系管理员。</p>';

    res.send(`
        <!DOCTYPE html><html lang="zh-CN">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>登录</title><style>${pageStyles}</style></head>
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
            console.error("登录尝试失败：无法解密存储的用户密码。可能主加密密钥已更改或用户密码文件已损坏。");
            return res.redirect('/login?error=decrypt_failed');
        }

        if (submittedPassword === storedDecryptedPassword) {
            res.setHeader('Set-Cookie', 'auth=1; Max-Age=1800; HttpOnly; Path=/; SameSite=Lax');
            res.send(`
                <!DOCTYPE html><html lang="zh-CN">
                <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>登录成功</title><style>${pageStyles}</style></head>
                <body><div class="container">
                    <h2 class="success-message">登录成功</h2>
                    <p>服务正在启动，页面将在几秒后自动跳转...</p>
                    <p>如果页面没有自动跳转，请 <a href="/">点击这里刷新</a>。</p>
                    <script>setTimeout(() => { window.location.href = '/'; }, 2500);</script>
                </div></body></html>
            `);

            process.nextTick(() => {
                server.close((err) => {
                    if (err) {
                        console.error('关闭登录保护服务器失败:', err);
                    }
                    console.log('登录保护服务已关闭。正在启动主服务 (server.js)...');
                    const mainAppPath = path.join(__dirname, 'server.js');
                    const child = exec(`node "${mainAppPath}"`, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`启动或运行 server.js 失败: ${error.message}`);
                            return;
                        }
                        if (stderr) {
                            console.error(`server.js stderr:\n${stderr}`);
                        }
                        if (stdout) {
                            console.log(`server.js stdout:\n${stdout}`);
                        }
                    });
                    child.on('exit', (code, signal) => {
                        if (code !== null) console.log(`主服务 (server.js) 已退出，退出码 ${code}`);
                        else if (signal !== null) console.log(`主服务 (server.js) 被信号 ${signal} 终止`);
                        else console.log('主服务 (server.js) 已退出。');
                    });
                });
            });

        } else {
            res.redirect('/login?error=invalid');
        }
    } catch (error) {
        if (error.code === 'ENOENT') { // File not found
            console.error("登录失败：用户密码文件未找到，但应用未处于设置模式。这可能是一个内部状态错误。", error);
            isUserPasswordSetupNeeded = true; // Attempt to correct state
            return res.redirect('/setup?error=internal_state');
        }
        console.error("读取用户密码文件或登录处理时发生未知错误:", error);
        res.status(500).send("服务器内部错误，无法处理登录请求。");
    }
});

// == Fallback for root path if authenticated ==
app.get('/', (req, res) => {
    if (isUserPasswordSetupNeeded) {
         return res.redirect('/setup');
    }
    if (req.cookies.auth === '1') {
        res.send(`
            <!DOCTYPE html><html lang="zh-CN">
            <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>已登录 - 等待主应用</title><style>${pageStyles}</style></head>
            <body><div class="container">
                <h2>您已登录</h2>
                <p>主应用程序 (server.js) 应该很快会接管此页面。</p>
                <p>如果页面长时间没有变化，请尝试 <a href="/">刷新</a> 或检查主应用服务的状态。</p>
            </div></body></html>
        `);
    } else {
        res.redirect('/login');
    }
});


// --- 6. 服务器启动 ---
const server = app.listen(PORT, () => {
    console.log(`登录保护/设置服务已在端口 ${PORT} 上启动。`);
    if (isUserPasswordSetupNeeded) {
        console.log(`请访问 http://<你的服务器IP或localhost>:${PORT}/setup 完成初始用户密码设置。`);
    } else {
        console.log(`请访问 http://<你的服务器IP或localhost>:${PORT}/login 进行登录。`);
    }
    console.warn(
        "安全提示：此脚本中的用户密码加密方式（AES对称加密，主密钥派生自存储在文件中的密钥文本）仅为基础级别， " +
        "不推荐用于高安全要求的生产环境。生产环境请务必使用加盐哈希 (如 bcrypt, Argon2) 存储用户密码。 " +
        `请确保 ${MASTER_SECRET_KEY_FILE} 文件的安全和备份，这是解密用户密码的关键。`
    );
});

// **NEW**: Enhanced error handling for server.listen()
server.on('error', (error) => {
    if (error.syscall !== 'listen') {
        console.error('发生了一个非监听相关的服务器错误:', error);
        // For critical errors not related to listen, you might want to throw or exit differently
        // For now, we'll exit to ensure the process manager knows it failed.
        process.exit(1);
    }

    switch (error.code) {
        case 'EACCES':
            console.error(`错误：端口 ${PORT} 需要提升的权限 (例如，root权限才能使用1024以下的端口)。`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(`错误：端口 ${PORT} 已被其他应用程序占用。请关闭冲突应用或更改此脚本中的 PORT (${PORT})。`);
            process.exit(1);
            break;
        default:
            console.error('服务器启动时发生未知监听错误:', error);
            process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('收到 SIGINT (Ctrl+C)，正在关闭登录保护服务...');
    server.close(() => {
        console.log('登录保护服务已关闭。');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('收到 SIGTERM，正在关闭登录保护服务...');
    server.close(() => {
        console.log('登录保护服务已关闭。');
        process.exit(0);
    });
});
