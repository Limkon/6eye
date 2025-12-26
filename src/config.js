import { Buffer } from 'node:buffer';
// import { CONSTANTS } from './constants.js'; // 如果没用到 CONSTANTS 可以注释掉

export async function initializeContext(request, env) {
    const ctx = {
        db: env.DB,
        encryptionKey: null,
        startTime: Date.now()
    };
    
    // 1. 尝试从环境变量获取
    let keyHex = env.CHAT_ENCRYPTION_KEY;
    
    // 2. 检查环境变量是否有效。如果无效，使用“兜底密钥”
    if (!keyHex || typeof keyHex !== 'string' || keyHex.length !== 64) {
        console.warn('⚠️ 未检测到有效的环境变量密钥，已切换为代码内置的兜底密钥。');
        
        // 【第一处替换】将默认值改为你的密钥
        keyHex = 'e8f1c9d2a3b4e5f678901234567890abcdef1234567890abcdef1234567890ab';
    }

    try {
        ctx.encryptionKey = Buffer.from(keyHex, 'hex');
    } catch (e) {
        console.error('密钥转换失败:', e);
        // 【第二处替换】最后的防线，防止 Buffer 转换出错
        ctx.encryptionKey = Buffer.from('e8f1c9d2a3b4e5f678901234567890abcdef1234567890abcdef1234567890ab', 'hex');
    }

    return ctx;
}
