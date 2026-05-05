import { Buffer } from 'node:buffer';

export async function initializeContext(request, env) {
    const ctx = {
        db: env.DB,
        encryptionKey: null,
        startTime: Date.now()
    };
    
    const keyHex = env.CHAT_ENCRYPTION_KEY;
    
    // 核心安全修复：实施强校验，废除硬编码兜底密钥
    // 必须是恰好 64 位的合法十六进制字符串 (对应 32 字节 / 256 bit)
    const hexRegex = /^[0-9a-fA-F]{64}$/;

    if (!keyHex || typeof keyHex !== 'string' || !hexRegex.test(keyHex)) {
        // 遇到非法密钥直接抛出严重错误（快速失败），禁止服务端继续运行并记录不安全的未加密数据
        console.error('🚨 [FATAL ERROR] 环境变量 CHAT_ENCRYPTION_KEY 缺失或格式错误。');
        console.error('请确保已通过 wrangler secret put CHAT_ENCRYPTION_KEY 注入了 64 位 Hex 字符串的密钥。');
        throw new Error('Server Configuration Error: Invalid Encryption Key');
    }

    try {
        ctx.encryptionKey = Buffer.from(keyHex, 'hex');
    } catch (e) {
        // 由于上面已经做了正则校验，这里极难被触发，仅作最后防线
        console.error('密钥 Buffer 转换失败:', e);
        throw new Error('Server Configuration Error: Key Parse Failed');
    }

    return ctx;
}
