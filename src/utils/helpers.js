import crypto from 'node:crypto';
import { CONSTANTS } from '../constants.js';
import { Buffer } from 'node:buffer';

export function encryptMessage(text, key) {
    if (!key) return null;
    try {
        const iv = crypto.randomBytes(CONSTANTS.IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return { iv: iv.toString('hex'), encrypted };
    } catch (e) {
        console.error('Encryption error:', e);
        return null;
    }
}

export function decryptMessage(encryptedHex, ivHex, key) {
    if (!key || !encryptedHex || !ivHex) return null;
    try {
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return null;
    }
}

export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 
            'Content-Type': 'application/json',
            // 解决消息不显示的核心
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    });
}
