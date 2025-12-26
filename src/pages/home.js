// 这里我们将 6eye 原有的静态资源整合成一个函数
// 为了适配 D1 轮询逻辑，JS 部分已经做了相应的替换

export function generateChatPage() {
    const css = `
    /* 引用原 style.css 的内容，这里为了简洁只放核心样式 */
    body { font-family: 'Segoe UI', sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; background: #f0f2f5; transition: 0.3s; }
    header { background: #4CAF50; color: white; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 10; }
    header h1 { margin: 0; font-size: 1.2em; }
    .controls { display: flex; gap: 8px; flex-wrap: wrap; }
    main { flex: 1; display: flex; overflow: hidden; }
    #chat { flex: 3; padding: 15px; overflow-y: auto; background: #fff; display: flex; flex-direction: column; }
    #userlist { flex: 1; min-width: 150px; padding: 15px; border-left: 1px solid #ddd; overflow-y: auto; background: #f9f9f9; }
    #userlist.hidden { display: none; }
    footer { padding: 10px; background: #eee; display: flex; gap: 10px; border-top: 1px solid #ddd; align-items: center; }
    input, button, textarea { padding: 8px; border-radius: 4px; border: 1px solid #ccc; }
    button { cursor: pointer; background: #007bff; color: white; border: none; }
    button:disabled { background: #aaa; cursor: not-allowed; }
    button#destroy-room { background: #dc3545; }
    .message { margin: 10px 0; padding: 8px 12px; border-radius: 12px; max-width: 70%; word-wrap: break-word; position: relative; }
    .message-left { align-self: flex-start; background: #e0f7fa; color: #333; margin-left: 10px; border-bottom-left-radius: 0; }
    .message-right { align-self: flex-end; background: #c8e6c9; color: #333; margin-right: 10px; border-bottom-right-radius: 0; }
    .message-username { font-size: 0.75em; color: #666; margin-bottom: 2px; }
    .system-message { align-self: center; font-style: italic; color: #888; font-size: 0.8em; margin: 5px 0; }
    @media (max-width: 600px) { header { flex-direction: column; gap: 10px; } .controls { justify-content: center; width: 100%; } #userlist { position: absolute; right: 0; top: 60px; height: 50%; border: 1px solid #ccc; display: none; } #userlist.show { display: block; } }
    `;

    const js = `
    let roomId = '', username = '', joined = false, pollInterval = null;
    const POLL_RATE = 2000;
    
    // DOM Elements
    const els = {};
    document.addEventListener('DOMContentLoaded', () => {
        ['room-id', 'join-room', 'current-room-id', 'username', 'join', 'message', 'send', 'chat', 'userlist', 'destroy-room', 'userlist-toggle'].forEach(id => {
            els[id] = document.getElementById(id);
        });

        els['join-room'].onclick = () => {
            const id = els['room-id'].value.trim();
            if(!id) return alert('请输入房间ID');
            roomId = id;
            els['current-room-id'].innerText = '当前房间: ' + roomId;
            els['room-id'].value = '';
            connect();
        };

        els['join'].onclick = async () => {
            const name = els['username'].value.trim();
            if(!name) return alert('请输入用户名');
            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(roomId)}/join\`, {
                    method: 'POST', body: JSON.stringify({username: name}), headers: {'Content-Type': 'application/json'}
                });
                if(!res.ok) throw new Error((await res.json()).error);
                username = name; joined = true;
                els['username'].disabled = true; els['join'].style.display = 'none';
                els['message'].disabled = false; els['send'].disabled = false;
                pollMessages();
            } catch(e) { alert(e.message); }
        };

        els['send'].onclick = async () => {
            const msg = els['message'].value.trim();
            if(!msg) return;
            try {
                await fetch(\`/api/room/\${encodeURIComponent(roomId)}/send\`, {
                    method: 'POST', body: JSON.stringify({username, message: msg}), headers: {'Content-Type': 'application/json'}
                });
                els['message'].value = '';
                pollMessages();
            } catch(e) { console.error(e); }
        };

        els['destroy-room'].onclick = async () => {
            if(confirm('确定销毁房间？')) {
                await fetch(\`/api/room/\${encodeURIComponent(roomId)}/destroy\`, { method: 'POST' });
                location.reload();
            }
        };
        
        els['userlist-toggle'].onclick = () => { els['userlist'].classList.toggle('hidden'); };
    });

    function connect() {
        pollMessages();
        if(pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(pollMessages, POLL_RATE);
        els['destroy-room'].disabled = false;
    }

    async function pollMessages() {
        if(!roomId) return;
        let url = \`/api/room/\${encodeURIComponent(roomId)}/messages\`;
        if(joined && username) url += \`?user=\${encodeURIComponent(username)}\`;
        
        try {
            const res = await fetch(url);
            if(!res.ok) return;
            const data = await res.json();
            renderUsers(data.users);
            renderMessages(data.messages);
        } catch(e) { console.error('Poll error', e); }
    }

    function renderUsers(users) {
        els['userlist'].innerHTML = '<h3>在线用户</h3>' + users.map(u => \`<div>\${u}</div>\`).join('');
    }

    function renderMessages(msgs) {
        const chat = els['chat'];
        const shouldScroll = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 50;
        chat.innerHTML = msgs.map(m => {
            const type = m.username === username ? 'message-right' : 'message-left';
            return \`<div class="message \${type}">
                <div class="message-username">\${m.username}</div>
                <div>\${m.message}</div>
            </div>\`;
        }).join('');
        if(shouldScroll) chat.scrollTop = chat.scrollHeight;
    }
    `;

    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>6eye Chat (Worker Edition)</title>
        <style>${css}</style>
    </head>
    <body>
        <div id="app">
            <header>
                <h1>MO留書 (Worker版)</h1>
                <div class="controls">
                    <span id="current-room-id">当前房间: 未加入</span>
                    <input type="text" id="room-id" placeholder="房间ID">
                    <button id="join-room">进入</button>
                    <button id="userlist-toggle">用户列表</button>
                    <button id="destroy-room" disabled>销毁</button>
                </div>
            </header>
            <main>
                <section id="chat"></section>
                <section id="userlist" class="hidden"></section>
            </main>
            <footer>
                <input type="text" id="username" placeholder="您的称呼">
                <button id="join">加入</button>
                <textarea id="message" placeholder="输入留言..." disabled></textarea>
                <button id="send" disabled>发送</button>
            </footer>
        </div>
        <script>${js}</script>
    </body>
    </html>
    `;
}
