import { initializeContext } from './config.js';
import { handleApiRequest } from './handlers/api.js';
import { generateChatPage } from './pages/home.js';

export default {
    async fetch(request, env, ctx) {
        try {
            const context = await initializeContext(request, env);
            const url = new URL(request.url);
            const path = url.pathname;

            // 1. API 路由分发
            if (path.startsWith('/api/')) {
                return await handleApiRequest(request, context, url);
            }

            // 2. 首页渲染
            if (path === '/' || path === '/index.html') {
                return new Response(generateChatPage(), {
                    headers: { 'Content-Type': 'text/html;charset=utf-8' }
                });
            }

            return new Response('404 Not Found', { status: 404 });

        } catch (e) {
            // 关键修改：返回 JSON 格式的错误信息，而不是纯文本
            const errorMsg = e.message || e.toString();
            console.error('Worker Error:', e.stack); // 在后台日志打印堆栈
            return new Response(JSON.stringify({ error: errorMsg }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};
