let ws;
let username = '';
let joined = false;
let roomId = '';

function generateRoomId(password) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
        .then(hash => {
            return Array.from(new Uint8Array(hash))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
                .slice(0, 16); // 取前16位作为房间号
        });
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
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = user === username ? 'message-right' : 'message-left';
    div.textContent = `${user}: ${message}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function updateUserList(users) {
    const list = document.getElementById('userlist');
    list.innerHTML = '<h3>在线用户</h3>';
    users.filter(user => user !== null).forEach(user => {
        const div = document.createElement('div');
        div.textContent = user;
        list.appendChild(div);
    });
}
