import crypto from 'node:crypto';
import { CONSTANTS } from '../constants.js';
import { Buffer } from 'node:buffer';

export function encryptMessage(text, key) {
    if (!key) return null;
    try {
        // 升级为 GCM 模式以提供 AEAD (认证加密)，防止密文被篡改
        const iv = crypto.randomBytes(12); // GCM 模式标准推荐 12 字节 IV
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // 获取 GCM 认证标签 (固定 16 字节，即 32 个 hex 字符)
        const authTag = cipher.getAuthTag().toString('hex');
        
        // 将 authTag 拼接到密文末尾，这样就不需要修改数据库字段结构
        return { 
            iv: iv.toString('hex'), 
            encrypted: encrypted + authTag 
        };
    } catch (e) {
        console.error('Encryption error:', e);
        return null;
    }
}

export function decryptMessage(encryptedHex, ivHex, key) {
    if (!key || !encryptedHex || !ivHex) return null;
    try {
        const iv = Buffer.from(ivHex, 'hex');
        
        // 提取并分离密文与认证标签
        const tag = Buffer.from(encryptedHex.slice(-32), 'hex');
        const contentHex = encryptedHex.slice(0, -32);
        const content = Buffer.from(contentHex, 'hex');
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag); // 设置认证标签以校验数据完整性
        
        let decrypted = decipher.update(content, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (e) {
        // 解密失败（如密钥错误或数据库数据被非法篡改）
        return null;
    }
}

export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 
            'Content-Type': 'application/json',
            // 【核心修复】强制禁止缓存，解决消息不显示
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    });
}
