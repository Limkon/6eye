// src/handlers/api.js

export async function handleApiRequest(request, context, url) {
    const { db, encryptionKey } = context;
    const path = url.pathname;
    const method = request.method;

    // 路由匹配：/api/room/:roomId/...
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 3) return new Response(JSON.stringify({ error: 'Invalid API Path' }), { status: 400 });

    const roomId = decodeURIComponent(parts[2]);
    const action = parts[3];

    // 1. 加入房间
    if (action === 'join' && method === 'POST') {
        const { username } = await request.json();
        if (!username) return new Response(JSON.stringify({ error: 'Username required' }), { status: 400 });

        // 记录用户加入（这里假设使用 D1 数据库或简单的存储逻辑）
        // 实际逻辑应根据您的 DB 结构实现，此处保持原有逻辑稳定性
        return new Response(JSON.stringify({ success: true, username }));
    }

    // 2. 获取消息和用户列表 (轮询接口)
    if (action === 'messages' && method === 'GET') {
        try {
            // 获取当前房间的消息
            const { results } = await db.prepare(
                "SELECT username, message, timestamp FROM messages WHERE room_id = ? ORDER BY timestamp ASC"
            ).bind(roomId).all();

            // 获取在线用户（简单示例：统计最近 5 分钟内发言或活跃的用户）
            const { results: users } = await db.prepare(
                "SELECT DISTINCT username FROM messages WHERE room_id = ? AND timestamp > ?"
            ).bind(roomId, Date.now() - 300000).all();

            return new Response(JSON.stringify({
                messages: results || [],
                users: users.map(u => u.username) || []
            }), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Database Error: ' + e.message }), { status: 500 });
        }
    }

    // 3. 发送消息
    if (action === 'send' && method === 'POST') {
        const { username, message } = await request.json();
        if (!username || !message) return new Response(JSON.stringify({ error: 'Missing data' }), { status: 400 });

        await db.prepare(
            "INSERT INTO messages (room_id, username, message, timestamp) VALUES (?, ?, ?, ?)"
        ).bind(roomId, username, message, Date.now()).run();

        return new Response(JSON.stringify({ success: true }));
    }

    // 4. 销毁房间
    if (action === 'destroy' && method === 'POST') {
        await db.prepare("DELETE FROM messages WHERE room_id = ?").bind(roomId).run();
        return new Response(JSON.stringify({ success: true }));
    }

    return new Response(JSON.stringify({ error: 'Action not found' }), { status: 404 });
}
