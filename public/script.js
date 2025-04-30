let ws;
let username = '';
let joined = false;
let roomId = '';

async function generateRoomId(password) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
}

function connect(roomId) {
    ws = new WebSocket(`wss://${location.host}/${roomId}`);
    ws.onopen = () => {
        console.log('连接成功');
    };
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('收到消息:', data);
            switch (data.type) {
                case 'userList':
                    console.log('更新用户列表:', data.users);
                    updateUserList(data.users);
                    if (!joined && data.users.includes(username)) {
                        console.log('通过 userList 确认加入成功，启用消息输入框');
                        joined = true;
                        document.getElementById('message').disabled = false;
                        document.getElementById('send').disabled = false;
                        document.getElementById('username-label').style.display = 'none';
                        document.getElementById('username').style.display = 'none';
                        document.getElementById('join').style.display = 'none';
                    }
                    break;
                case 'message':
                    console.log('收到聊天消息:', data.message);
                    addMessage(data.username, data.message);
                    break;
                case 'joinSuccess':
                    console.log('收到 joinSuccess，启用消息输入框');
                    joined = true;
                    document.getElementById('message').disabled = false;
                    document.getElementById('send').disabled = false;
                    document.getElementById('username-label').style.display = 'none';
                    document.getElementById('username').style.display = 'none';
                    document.getElementById('join').style.display = 'none';
                    break;
                case 'joinError':
                    console.log('加入失败:', data.message);
                    alert(data.message || '用户名已存在，请重新输入');
                    joined = false;
                    username = '';
                    document.getElementById('username').value = '';
                    document.getElementById('username-label').style.display = 'block';
                    document.getElementById('username').style.display = 'block';
                    document.getElementById('join').style.display = 'block';
                    document.getElementById('message').disabled = true;
                    document.getElementById('send').disabled = true;
                    break;
                case 'roomDestroyed':
                    console.log('房间被销毁:', roomId);
                    document.getElementById('chat').innerHTML = '';
                    updateUserList([]);
                    alert(data.message);
                    window.location.reload();
                    break;
                default:
                    console.warn('未知消息类型:', data);
                    break;
            }
        } catch (error) {
            console.error('消息解析失败:', error);
        }
    };
    ws.onclose = () => {
        console.log('连接关闭');
        joined = false;
        username = '';
        document.getElementById('message').disabled = true;
        document.getElementById('send').disabled = true;
        document.getElementById('username-label').style.display = 'block';
        document.getElementById('username').style.display = 'block';
        document.getElementById('join').style.display = 'block';
    };
}

document.getElementById('enter-room').onclick = () => {
    const password = document.getElementById('room-password').value.trim();
    if (!password) {
        alert('请输入密码');
        return;
    }
    generateRoomId(password).then(id => {
        roomId = id;
        document.getElementById('room-id').textContent = roomId;
        document.getElementById('room-id-display').style.display = 'block';
        document.getElementById('entry').style.display = 'none';
        document.getElementById('chat-container').style.display = 'block';
        connect(roomId);
    }).catch(error => {
        console.error('生成房间号失败:', error);
        alert('生成房间号失败，请重试');
    });
};

document.getElementById('join').onclick = () => {
    const input = document.getElementById('username');
    const name = input.value.trim();
    if (!name) {
        alert('请输入用户名');
        return;
    }
    if (joined) {
        alert('已加入聊天室');
        return;
    }
    console.log('尝试加入，用户名:', name);
    username = name;
    ws.send(JSON.stringify({ type: 'join', username }));
    document.getElementById('username-label').style.display = 'none';
    document.getElementById('username').style.display = 'none';
    document.getElementById('join').style.display = 'none';
};

document.getElementById('send').onclick = () => {
    const input = document.getElementById('message');
    const msg = input.value.trim();
    if (!msg) return;
    ws.send(JSON.stringify({ type: 'message', message: msg }));
    input.value = '';
};

document.getElementById('message').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('send').click();
    }
});

document.getElementById('theme-toggle').onclick = () => {
    document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode');
};

document.getElementById('userlist-toggle').onclick = () => {
    document.getElementById('userlist').classList.toggle('hidden');
};

document.getElementById('destroy-room').onclick = () => {
    if (confirm('确定要销毁房间吗？所有聊天记录将被删除！')) {
        ws.send(JSON.stringify({ type: 'destroy' }));
    }
};

function addMessage(user, message) {
    const chat = document.get completing the server-side logic for WebSocket connections, message handling, and room destruction.

### public/style.css
```css
body {
    margin: 0;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

#app {
    display: flex;
    flex-direction: column;
    height: 100vh;
}

#entry {
    text-align: center;
    padding: 50px;
}

#entry h2 {
    margin-bottom: 20px;
}

#entry input[type="password"] {
    padding: 8px;
    width: 200px;
    margin-right: 10px;
}

#entry button {
    padding: 8px 16px;
}

#room-id-display {
    margin-top: 10px;
}

header {
    background: #4CAF50;
    color: white;
    padding: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

header h1 {
    margin: 0;
}

.controls button {
    margin-left: 10px;
}

main {
    flex: 1;
    display: flex;
    overflow: hidden;
}

#chat {
    flex: 3;
    padding: 10px;
    overflow-y: auto;
    background: #f9f9f9;
}

#userlist {
    flex: 1;
    padding: 10px;
    border-left: 1px solid #ccc;
    overflow-y: auto;
    background: #fff;
}

#userlist.hidden {
    display: none;
}

footer {
    display: flex;
    padding: 10px;
    background: #eee;
    align-items: center;
}

footer label {
    margin-right: 10px;
    font-size: 14px;
}

footer input[type="text"] {
    padding: 8px;
    margin-right: 10px;
}

footer #username {
    width: 150px;
}

footer #message {
    flex: 1;
}

footer button {
    padding: 8px 16px;
}

.message-left {
    background: #e0f7fa;
    color: #333;
    padding: 8px;
    margin: 5px 0;
    border-radius: 5px;
    text-align: left;
}

.message-right {
    background: #c8e6c9;
    color: #333;
    padding: 8px;
    margin: 5px 0;
    border-radius: 5px;
    text-align: right;
}

body.dark-mode {
    background: #121212;
    color: #e0e0e0;
}

body.dark-mode #entry {
    background: #1e1e1e;
}

body.dark-mode header {
    background: #333;
}

body.dark-mode #chat {
    background: #1e1e1e;
}

body.dark-mode #userlist {
    background: #2c2c2c;
}

body.dark-mode footer {
    background: #333;
}

body.dark-mode .message-left {
    background: #4a636e;
    color: #f0f0f0;
}

body.dark-mode .message-right {
    background: #4a704a;
    color: #f0f0f0;
}

@media (max-width: 600px) {
    footer {
        flex-wrap: wrap;
        gap: 8px;
    }

    footer label {
        width: 100%;
        margin-right: 0;
        text-align: left;
    }

    footer #username {
        width: 100%;
        max-width: 200px;
    }

    footer #message {
        width: 100%;
        flex: none;
    }

    footer button {
        padding: 8px 12px;
        width: auto;
    }

    footer #join,
    footer #send {
        flex: 1;
        min-width: 80px;
    }
}
