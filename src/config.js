import { Buffer } from 'node:buffer';

export async function initializeContext(request, env) {
    const ctx = {
        db: env.DB,
        encryptionKey: null,
        startTime: Date.now()
    };
    
    if (env.CHAT_ENCRYPTION_KEY) {
        ctx.encryptionKey = Buffer.from(env.CHAT_ENCRYPTION_KEY, 'hex');
    }

    return ctx;
}
