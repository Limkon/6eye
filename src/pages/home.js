export function generateChatPage() {
    // 关键 CSS：增加了 FontAwesome 图标对齐样式及布局优化
    const css = `
    /* 基础布局 */
    body { margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; transition: background-color 0.3s, color 0.3s; height: 100vh; overflow: hidden; }
    #app { display: flex; flex-direction: column; height: 100%; }

    /* 头部 */
    header { background: #4CAF50; color: white; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 10; flex-shrink: 0; }
    header h1 { margin: 0; font-size: 1.5em; display: flex; align-items: center; gap: 8px; }
    header .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    
    /* 控件样式 */
    input[type="text"], textarea { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 1em; }
    button { 
        padding: 6px 12px; 
        background: #fff; 
        color: #333; 
        border: 1px solid #ccc; 
        border-radius: 4px; 
        cursor: pointer; 
        transition: 0.2s; 
        white-space: nowrap; 
        display: inline-flex; 
        align-items: center; 
        gap: 6px; 
        font-size: 0.9em;
    }
    button:hover { background: #f0f0f0; }
    button:disabled { background: #eee; color: #aaa; cursor: not-allowed; }
    button#destroy-room { background-color: #dc3545; border-color: #dc3545; color: white; }
    button#destroy-room:hover:not(:disabled) { background-color: #c82333; }
    
    /* 主体区域 */
    main { flex: 1; display: flex; overflow: hidden; position: relative; }
    #chat { flex: 3; padding: 15px; overflow-y: auto; background: #f9f9f9; display: flex; flex-direction: column; }
    #userlist { flex: 1; min-width: 180px; max-width: 250px; padding: 15px; border-left: 1px solid #ddd; overflow-y: auto; background: #fff; }
    #userlist.hidden { display: none; }
    #userlist h3 { margin-top: 0; font-size: 1.1em; display: flex; align-items: center; gap: 8px; }
    .user-item { padding: 4px 0; display: flex; align-items: center; gap: 8px; color: #555; }
    
    /* 底部输入栏 */
    footer { display: flex; padding: 10px 15px; background: #eee; align-items: center; border-top: 1px solid #ddd; gap: 10px; flex-shrink: 0; }
    footer #username { width: 120px; }
    footer #message { flex: 1; height: 36px; resize: none; line-height: 24px; }
    footer button#join, footer button#send { background-color: #007bff; color: white; border: 1px solid #007bff; }
    footer button:hover { background-color: #0056b3; }

    /* 消息气泡 */
    .message { margin: 10px 0; padding: 10px 15px; border-radius: 12px; max-width: 70%; word-wrap: break-word; position: relative; line-height: 1.4; }
    .message-left { align-self: flex-start; background: #e0f7fa; color: #333; margin-left: 10px; border-bottom-left-radius: 0; }
    .message-right { align-self: flex-end; background: #c8e6c9; color: #333; margin-right: 10px; border-bottom-right-radius: 0; }
    .message-username { font-size: 0.75em; color: #666; margin-bottom: 4px; font-weight: bold; }
    
    /* 移动端适配 */
    @media (max-width: 600px) {
        header { flex-direction: column; align-items: stretch; gap: 10px; }
        header h1 { text-align: center; justify-content: center; }
        header .controls { justify-content: center; }
        header .controls input { flex: 1; }
        #userlist { position: absolute; right: 0; top: 0; bottom: 0; z-index: 20; box-shadow: -2px 0 5px rgba(0,0,0,0.2); }
        footer { flex-wrap: wrap; }
        footer #username { width: 40%; }
        footer #join { width: 30%; }
        footer #message { width: 100%; order: 3; margin-top: 5px; }
        footer #send { width: 30%; order: 2; margin-left: auto; }
    }
    `;

    const js = `
    let roomId = '', username = '', joined = false, pollInterval = null;
    const POLL_RATE = 2000;
    
    function showToast(msg) {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:4px;z-index:9999;font-size:14px;';
        div.innerText = msg;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    }

    const els = {};
    document.addEventListener('DOMContentLoaded', () => {
        ['room-id', 'join-room', 'current-room-id', 'username', 'join', 'message', 'send', 'chat', 'userlist', 'destroy-room', 'userlist-toggle'].forEach(id => {
            els[id] = document.getElementById(id);
        });

        els['room-id'].onkeydown = (e) => { if(e.key === 'Enter') els['join-room'].click(); };
        els['username'].onkeydown = (e) => { if(e.key === 'Enter') els['join'].click(); };
        els['message'].onkeydown = (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); els['send'].click(); } };

        els['join-room'].onclick = () => {
            const id = els['room-id'].value.trim();
            if(!id) return showToast('请输入房间ID');
            roomId = id;
            els['current-room-id'].innerHTML = '<i class="fas fa-door-open"></i> 房间: ' + roomId;
            els['room-id'].value = '';
            connect();
        };

        els['join'].onclick = async () => {
            if(!roomId) return showToast('请先进入一个房间');
            const name = els['username'].value.trim();
            if(!name) return showToast('请输入您的称呼');
            
            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(roomId)}/join\`, {
                    method: 'POST', body: JSON.stringify({username: name}), headers: {'Content-Type': 'application/json'}
                });
                const data = await res.json();
                if(!res.ok) throw new Error(data.error || '加入失败');
                
                username = name; 
                joined = true;
                
                els['username'].style.display = 'none';
                els['join'].style.display = 'none';
                els['message'].disabled = false;
                els['send'].disabled = false;
                els['message'].focus();
                
                showToast('加入成功');
                pollMessages();
            } catch(e) { 
                showToast(e.message); 
            }
        };

        els['send'].onclick = async () => {
            const msg = els['message'].value.trim();
            if(!msg) return;
            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(roomId)}/send\`, {
                    method: 'POST', body: JSON.stringify({username, message: msg}), headers: {'Content-Type': 'application/json'}
                });
                if(!res.ok) throw new Error((await res.json()).error);
                els['message'].value = '';
                pollMessages();
            } catch(e) { showToast('发送失败: ' + e.message); }
        };

        els['destroy-room'].onclick = async () => {
            if(confirm('确定销毁当前房间的所有记录吗？')) {
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
        } catch(e) { console.error('Poll network error', e); }
    }

    function renderUsers(users) {
        const title = '<h3><i class="fas fa-users"></i> 在线用户</h3>';
        const list = users.length 
            ? users.map(u => \`<div class="user-item"><i class="fas fa-user-circle"></i> \${u}</div>\`).join('') 
            : '<div style="color:#999;font-size:0.9em;">暂无其他用户</div>';
        els['userlist'].innerHTML = title + list;
    }

    function renderMessages(msgs) {
        const chat = els['chat'];
        const shouldScroll = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 100;
        
        if (msgs.length === 0) {
            chat.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px;"><i class="fas fa-comment-slash"></i> 暂无消息</div>';
            return;
        }

        chat.innerHTML = msgs.map(m => {
            const isMe = m.username === username;
            const type = isMe ? 'message-right' : 'message-left';
            const time = new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            return \`<div class="message \${type}">
                <div class="message-username">\${m.username} <span style="font-weight:normal;font-size:0.8em;color:#999;margin-left:5px">\${time}</span></div>
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>6eye Chat</title>
        <link rel="stylesheet" href="/src/vendor/fontawesome/css/all.min.css">
        <style>${css}</style>
    </head>
    <body>
        <div id="app">
            <header>
                <h1><i class="fas fa-eye"></i> MO留書</h1>
                <div class="controls">
                    <span id="current-room-id" style="font-size:0.9em;margin-right:5px"><i class="fas fa-ghost"></i> 未加入房间</span>
                    <input type="text" id="room-id" placeholder="房间ID" style="width:100px">
                    <button id="join-room"><i class="fas fa-sign-in-alt"></i> 进入</button>
                    <button id="userlist-toggle"><i class="fas fa-users"></i> 用户</button>
                    <button id="destroy-room" disabled><i class="fas fa-trash-alt"></i> 销毁</button>
                </div>
            </header>
            <main>
                <section id="chat">
                    <div style="text-align:center;color:#999;margin-top:50px">
                        <i class="fas fa-door-closed fa-3x"></i><br><br>
                        请先输入房间ID并点击“进入”<br>然后设置称呼加入聊天
                    </div>
                </section>
                <section id="userlist" class="hidden"></section>
            </main>
            <footer>
                <input type="text" id="username" placeholder="您的称呼">
                <button id="join"><i class="fas fa-user-plus"></i> 加入</button>
                <textarea id="message" placeholder="输入留言..." disabled></textarea>
                <button id="send" disabled><i class="fas fa-paper-plane"></i> 发送</button>
            </footer>
        </div>
        <script>${js}</script>
    </body>
    </html>
    `;
}
