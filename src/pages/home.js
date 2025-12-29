export function generateChatPage() {
    // 样式表：确保倒计时容器和按钮可见性
    const css = `
    body { margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; height: 100vh; overflow: hidden; }
    #app { display: flex; flex-direction: column; height: 100%; }

    /* 顶部导航 */
    header { background: #4CAF50; color: white; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 10; flex-shrink: 0; }
    header h1 { margin: 0; font-size: 1.4em; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
    header .controls { display: flex; align-items: center; gap: 10px; }
    
    /* 两个状态面板：进入前(join-ui) 和 进入后(room-ui) */
    #join-ui { display: flex; align-items: center; gap: 8px; }
    #room-ui { display: none; align-items: center; gap: 10px; }
    
    /* 倒计时条 (修复可见性) */
    #timer-wrapper { display: flex; align-items: center; background: rgba(0,0,0,0.2); padding: 4px 10px; border-radius: 20px; gap: 8px; font-size: 0.85em; }
    #cleanup-timer { color: #ffeb3b; font-weight: bold; min-width: 60px; text-align: center; }
    #cancel-cleanup { background: transparent; border: none; color: #fff; cursor: pointer; padding: 0; font-size: 1.1em; opacity: 0.8; display: flex; align-items: center; }
    #cancel-cleanup:hover { opacity: 1; color: #ff5252; }

    /* 输入框与按钮 */
    input[type="text"], input[type="password"], textarea { padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 0.9em; }
    button { 
        padding: 6px 12px; background: #fff; color: #333; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; 
        transition: 0.2s; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; font-size: 0.9em;
    }
    button:hover { background: #f0f0f0; }
    
    /* 按钮颜色区分 */
    button#destroy-room { background-color: #ffebee; border-color: #ffcdd2; color: #c62828; }
    button#destroy-room:hover:not(:disabled) { background-color: #ef9a9a; color: #b71c1c; }
    button#leave-room { background-color: #e3f2fd; border-color: #bbdefb; color: #1565c0; }
    
    .e2ee-badge { color: #ccff90; font-size: 0.7em; border: 1px solid #ccff90; padding: 1px 4px; border-radius: 3px; }

    /* 主体 */
    main { flex: 1; display: flex; overflow: hidden; position: relative; }
    #chat { flex: 3; padding: 15px; overflow-y: auto; background: #f9f9f9; display: flex; flex-direction: column; }
    #userlist { flex: 1; min-width: 200px; max-width: 250px; padding: 15px; border-left: 1px solid #ddd; overflow-y: auto; background: #fff; }
    #userlist.hidden { display: none; }

    /* 消息 */
    .message { margin: 10px 0; padding: 10px 15px; border-radius: 12px; max-width: 80%; word-wrap: break-word; line-height: 1.4; position: relative; }
    .message-left { align-self: flex-start; background: #e0f7fa; color: #333; border-bottom-left-radius: 0; }
    .message-right { align-self: flex-end; background: #c8e6c9; color: #333; border-bottom-right-radius: 0; }
    .message-username { font-size: 0.75em; color: #666; margin-bottom: 4px; font-weight: bold; }
    
    /* 底部 */
    footer { display: flex; flex-wrap: wrap; padding: 10px 15px; background: #eee; border-top: 1px solid #ddd; gap: 10px; flex-shrink: 0; }
    footer #username { width: 140px; }
    footer #message { flex: 1; min-width: 200px; height: 40px; resize: none; }
    footer button#join, footer button#send { background-color: #007bff; color: white; border-color: #007bff; }

    @media (max-width: 800px) {
        header { flex-direction: column; height: auto; padding: 10px; gap: 10px; }
        header .controls { width: 100%; justify-content: center; flex-wrap: wrap; }
        #join-ui { width: 100%; justify-content: center; }
        footer #username { width: 100%; }
        footer #join { width: 100%; }
    }
    `;

    const js = `
    // 全局状态
    let roomId = '', username = '', joined = false, pollInterval = null;
    let roomPassword = ''; 
    let cleanupEnabled = true; 
    const POLL_RATE = 2000;
    const CLEANUP_TIMEOUT = 30 * 60 * 1000; 
    let lastActivity = Date.now();

    // Markdown 配置
    if (typeof marked !== 'undefined') { marked.setOptions({ breaks: true, gfm: true }); }

    // --- E2EE 加密模块 ---
    async function deriveKey(p) { 
        const enc = new TextEncoder(); const salt = enc.encode(roomId); 
        const bk = await crypto.subtle.importKey("raw", enc.encode(p), "PBKDF2", false, ["deriveKey"]); 
        return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, bk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); 
    }
    async function e2eeEncrypt(t, p) { 
        const key = await deriveKey(p); const iv = crypto.getRandomValues(new Uint8Array(12)); 
        const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(t)); 
        const comb = new Uint8Array(iv.length + enc.byteLength); comb.set(iv); comb.set(new Uint8Array(enc), iv.length); 
        return btoa(String.fromCharCode(...comb)); 
    }
    async function e2eeDecrypt(b, p) { 
        try { 
            const key = await deriveKey(p); const comb = new Uint8Array(atob(b).split("").map(c => c.charCodeAt(0))); 
            const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: comb.slice(0, 12) }, key, comb.slice(12)); 
            return new TextDecoder().decode(dec); 
        } catch (e) { return "<i>[解密失败]</i>"; } 
    }

    // --- 核心逻辑 ---
    document.addEventListener('DOMContentLoaded', () => {
        try {
            // 获取 UI 元素
            const ui = {
                roomId: document.getElementById('room-id'),
                roomKey: document.getElementById('room-key'),
                joinRoomBtn: document.getElementById('join-room'),
                joinUi: document.getElementById('join-ui'),
                roomUi: document.getElementById('room-ui'),
                currentRoomId: document.getElementById('current-room-id'),
                timerWrapper: document.getElementById('timer-wrapper'),
                cleanupTimer: document.getElementById('cleanup-timer'),
                cancelCleanupBtn: document.getElementById('cancel-cleanup'),
                userListToggle: document.getElementById('userlist-toggle'),
                leaveRoomBtn: document.getElementById('leave-room'),
                destroyRoomBtn: document.getElementById('destroy-room'),
                chat: document.getElementById('chat'),
                userList: document.getElementById('userlist'),
                username: document.getElementById('username'),
                joinBtn: document.getElementById('join'),
                message: document.getElementById('message'),
                sendBtn: document.getElementById('send')
            };

            // 辅助：重置 UI 状态 (返回主页)
            function resetUI() {
                if(pollInterval) clearInterval(pollInterval);
                roomId = ''; username = ''; joined = false; roomPassword = ''; cleanupEnabled = true;

                // 恢复显示
                ui.joinUi.style.display = 'flex';
                ui.roomUi.style.display = 'none';
                ui.chat.innerHTML = '<div style="text-align:center;color:#999;margin-top:50px"><i class="fas fa-shield-alt fa-3x"></i><br><br>请输入房间ID进入。<br>支持端到端加密与Markdown。</div>';
                ui.userList.innerHTML = '';
                
                // 重置表单
                ui.message.disabled = true; ui.message.value = '';
                ui.sendBtn.disabled = true;
                ui.joinBtn.style.display = 'inline-block';
                ui.username.disabled = false;
                ui.roomId.value = ''; ui.roomKey.value = '';
                ui.currentRoomId.innerHTML = '';
            }

            // 辅助：更新倒计时 (提取为独立函数以便立即调用)
            function refreshTimer() {
                if (!cleanupEnabled || !roomId) { 
                    if(ui.timerWrapper) ui.timerWrapper.style.display = 'none'; 
                    return; 
                }
                const remaining = Math.max(0, CLEANUP_TIMEOUT - (Date.now() - lastActivity));
                const mins = Math.floor(remaining / 60000);
                const secs = Math.floor((remaining % 60000) / 1000);
                
                if(ui.cleanupTimer) ui.cleanupTimer.innerText = remaining <= 0 ? "建议清理" : \`清理倒数 \${mins}:\${secs.toString().padStart(2, '0')}\`;
                if(ui.timerWrapper) ui.timerWrapper.style.display = 'flex';
            }

            // 启动定时器
            setInterval(refreshTimer, 1000);

            function showToast(msg) {
                const div = document.createElement('div');
                div.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:4px;z-index:9999;font-size:14px;';
                div.innerText = msg; document.body.appendChild(div);
                setTimeout(() => div.remove(), 2500);
            }

            // --- 事件绑定 ---

            // 1. 取消倒计时
            if(ui.cancelCleanupBtn) {
                ui.cancelCleanupBtn.onclick = () => {
                    cleanupEnabled = false;
                    refreshTimer(); // 立即更新 UI
                    showToast('已取消自动清理提示');
                };
            }

            // 2. 进入房间
            if(ui.joinRoomBtn) {
                ui.joinRoomBtn.onclick = () => {
                    const id = ui.roomId.value.trim();
                    if(!id) return showToast('请输入房间ID');
                    
                    roomId = id;
                    roomPassword = ui.roomKey.value.trim();
                    
                    // 切换 UI
                    ui.joinUi.style.display = 'none';
                    ui.roomUi.style.display = 'flex';
                    ui.currentRoomId.innerHTML = \`<i class="fas fa-hashtag"></i> \${roomId} \${roomPassword ? '<span class="e2ee-badge">E2EE</span>' : ''}\`;
                    
                    lastActivity = Date.now();
                    refreshTimer(); // 立即显示倒计时，不要等1秒
                    connect(); 
                };
            }

            // 3. 加入聊天
            if(ui.joinBtn) {
                ui.joinBtn.onclick = async () => {
                    const name = ui.username.value.trim();
                    if(!name) return showToast('请输入称呼');
                    try {
                        const res = await fetch(\`/api/room/\${encodeURIComponent(roomId)}/join\`, {
                            method: 'POST', body: JSON.stringify({username: name}), headers: {'Content-Type': 'application/json'}
                        });
                        if(!res.ok) throw new Error((await res.json()).error || '加入失败');
                        
                        username = name; joined = true;
                        ui.username.disabled = true; 
                        ui.joinBtn.style.display = 'none';
                        ui.message.disabled = false; 
                        ui.sendBtn.disabled = false;
                        ui.message.focus();
                        
                        showToast('已加入聊天');
                        pollMessages();
                    } catch(e) { showToast(e.message); }
                };
            }

            // 4. 发送消息
            if(ui.sendBtn) {
                ui.sendBtn.onclick = async () => {
                    let text = ui.message.value.trim();
                    if(!text) return;
                    
                    if (roomPassword) text = await e2eeEncrypt(text, roomPassword);
                    
                    try {
                        const res = await fetch(\`/api/room/\${encodeURIComponent(roomId)}/send\`, {
                            method: 'POST', body: JSON.stringify({username, message: text}), headers: {'Content-Type': 'application/json'}
                        });
                        if(res.ok) { 
                            ui.message.value = ''; 
                            lastActivity = Date.now(); 
                            refreshTimer();
                            pollMessages(); 
                        }
                    } catch(e) { showToast('发送失败'); }
                };
            }

            // 5. 离开房间 (前端操作，不请求 API)
            if(ui.leaveRoomBtn) {
                ui.leaveRoomBtn.onclick = () => {
                    if(confirm('确定离开房间吗？本地记录将被清空。')) {
                        resetUI();
                        showToast('已退出房间');
                    }
                };
            }

            // 6. 销毁房间 (后端操作 + UI重置)
            if(ui.destroyRoomBtn) {
                ui.destroyRoomBtn.onclick = async () => {
                    if(confirm('警告：此操作将永久删除云端所有记录！')) {
                        try {
                            await fetch(\`/api/room/\${encodeURIComponent(roomId)}/destroy\`, { method: 'POST' });
                            showToast('房间已销毁');
                            // 修复：不使用 location.reload()，避免 "Too Fast"
                            resetUI(); 
                        } catch(e) {
                            showToast('销毁失败');
                        }
                    }
                };
            }

            // 7. 用户列表切换
            if(ui.userListToggle) {
                ui.userListToggle.onclick = () => ui.userList.classList.toggle('hidden');
            }

            function connect() {
                pollMessages();
                if(pollInterval) clearInterval(pollInterval);
                pollInterval = setInterval(pollMessages, POLL_RATE);
            }

            async function pollMessages() {
                if(!roomId) return;
                try {
                    const res = await fetch(\`/api/room/\${encodeURIComponent(roomId)}/messages?user=\${encodeURIComponent(username)}\`);
                    const data = await res.json();
                    if (data.messages.length > 0) lastActivity = Math.max(lastActivity, ...data.messages.map(m => m.timestamp));
                    renderUsers(data.users);
                    renderMessages(data.messages);
                } catch(e) {}
            }

            function renderUsers(users) {
                if(ui.userList) ui.userList.innerHTML = '<h3>在线用户</h3>' + (users.length ? users.map(u => \`<div><i class="fas fa-user-circle"></i> \${u}</div>\`).join('') : '<div style="color:#999">暂无</div>');
            }

            async function renderMessages(msgs) {
                const htmls = await Promise.all(msgs.map(async m => {
                    const type = m.username === username ? 'message-right' : 'message-left';
                    let msg = m.message;
                    if (roomPassword) msg = await e2eeDecrypt(msg, roomPassword);
                    const content = (typeof marked !== 'undefined') ? marked.parse(msg) : msg;
                    return \`<div class="message \${type}">
                        <div class="message-username">\${m.username} <span style="font-weight:normal;color:#999">\${new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
                        <div>\${content}</div>
                    </div>\`;
                }));
                if(ui.chat) {
                    ui.chat.innerHTML = htmls.length ? htmls.join('') : '<div style="text-align:center;color:#999;margin-top:20px;">暂无消息</div>';
                    ui.chat.scrollTop = ui.chat.scrollHeight;
                }
            }

        } catch (err) {
            console.error(err);
            alert('初始化异常，请刷新页面');
        }
    });
    `;

    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>6eye Chat</title>
        <link rel="stylesheet" href="/src/vendor/fontawesome/css/all.min.css">
        <script src="/src/vendor/marked/marked.min.js"></script>
        <style>${css}</style>
    </head>
    <body>
        <div id="app">
            <header>
                <h1><i class="fas fa-eye"></i> MO留書</h1>
                <div class="controls">
                    <div id="join-ui">
                        <input type="password" id="room-key" placeholder="访问密码 (可选)" style="width:110px">
                        <input type="text" id="room-id" placeholder="房间ID" style="width:90px">
                        <button id="join-room"><i class="fas fa-sign-in-alt"></i> 进入</button>
                    </div>
                    <div id="room-ui">
                        <div id="timer-wrapper">
                            <span id="cleanup-timer"></span>
                            <button id="cancel-cleanup" title="取消倒计时"><i class="fas fa-times-circle"></i></button>
                        </div>
                        <span id="current-room-id"></span>
                        <button id="userlist-toggle"><i class="fas fa-users"></i> 用户</button>
                        <button id="leave-room"><i class="fas fa-sign-out-alt"></i> 离开</button>
                        <button id="destroy-room"><i class="fas fa-trash-alt"></i> 销毁</button>
                    </div>
                </div>
            </header>
            <main>
                <section id="chat">
                    <div style="text-align:center;color:#999;margin-top:50px">
                        <i class="fas fa-shield-alt fa-3x"></i><br><br>
                        请输入房间ID进入。<br>支持端到端加密与Markdown。
                    </div>
                </section>
                <section id="userlist" class="hidden"></section>
            </main>
            <footer>
                <input type="text" id="username" placeholder="您的称呼">
                <button id="join"><i class="fas fa-user-plus"></i> 加入聊天</button>
                <textarea id="message" placeholder="输入消息 (Markdown)" disabled></textarea>
                <button id="send" disabled><i class="fas fa-paper-plane"></i> 发送</button>
            </footer>
        </div>
        <script>${js}</script>
    </body>
    </html>
    `;
}
