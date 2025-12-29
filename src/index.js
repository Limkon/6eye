import { initializeContext } from './config.js';
import { handleApiRequest } from './handlers/api.js';
import { generateChatPage } from './pages/home.js';

// 内存速率限制存储 (单隔离区有效)
const ipRateMap = new Map();
const RATE_LIMIT_MS = 1000; // 每个请求最小间隔 1 秒

export default {
    async fetch(request, env, ctx) {
        try {
            const context = await initializeContext(request, env);
            const url = new URL(request.url);
            const path = url.pathname;

            // --- 访问频率限制 (Rate Limiting) ---
            const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
            const now = Date.now();
            if (ipRateMap.has(clientIP)) {
                const lastRequest = ipRateMap.get(clientIP);
                if (now - lastRequest < RATE_LIMIT_MS) {
                    return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), { 
                        status: 429, 
                        headers: { 'Content-Type': 'application/json' } 
                    });
                }
            }
            ipRateMap.set(clientIP, now);

            // 定期清理 Map 防止内存溢出
            if (ipRateMap.size > 1000) ipRateMap.clear();

            // 1. API 路由分发
            if (path.startsWith('/api/')) {
                return await handleApiRequest(request, context, url);
            }

            // 2. 静态资源路由 (src/vendor)
            if (path.startsWith('/src/vendor/')) {
                if (env.ASSETS) return await env.ASSETS.fetch(request);
            }

            // 3. 首页渲染
            if (path === '/' || path === '/index.html') {
                return new Response(generateChatPage(), {
                    headers: { 'Content-Type': 'text/html;charset=utf-8' }
                });
            }

            return new Response('404 Not Found', { status: 404 });

        } catch (e) {
            const errorMsg = e.message || e.toString();
            return new Response(JSON.stringify({ error: errorMsg }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};
