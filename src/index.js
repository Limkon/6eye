import { initializeContext } from './config.js';
import { handleApiRequest } from './handlers/api.js';
import { generateChatPage } from './pages/home.js';

const ipRateMap = new Map();
const RATE_LIMIT_MS = 1000; 

export default {
    async fetch(request, env, ctx) {
        try {
            // 核心安全修复：防止由于持续请求造成的内存泄漏
            if (ipRateMap.size > 2000) {
                ipRateMap.clear();
            }

            const context = await initializeContext(request, env);
            const url = new URL(request.url);
            const path = url.pathname;

            // 速率限制
            const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
            const now = Date.now();
            if (ipRateMap.has(clientIP) && (now - ipRateMap.get(clientIP) < RATE_LIMIT_MS)) {
                return new Response('Too Fast', { status: 429 });
            }
            ipRateMap.set(clientIP, now);

            // 将 ctx 传递给处理函数
            if (path.startsWith('/api/')) return await handleApiRequest(request, context, url, ctx);
            if (path.startsWith('/src/vendor/')) return (env.ASSETS) ? await env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });

            if (path === '/' || path === '/index.html') {
                return new Response(generateChatPage(), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
            }
            return new Response('Not Found', { status: 404 });
        } catch (e) {
            return new Response(e.message, { status: 500 });
        }
    },

    async scheduled(event, env, ctx) {
        // 容错处理，防止环境变量未绑定时报错
        if (!env.DB) return; 
        
        // 核心修改：将定时清理旧数据时间与前端倒计时对齐 (30分钟 = 1800000 ms)
        await env.DB.prepare("DELETE FROM messages WHERE timestamp < ?").bind(Date.now() - 1800000).run();
    }
};
