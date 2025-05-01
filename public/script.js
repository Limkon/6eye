let ws;
let username = '';
let joined = false;
let roomId = '';

function connect() {
    ws = new WebSocket(`wss://${location.host}/${roomId}`);
    ws.onopen = () => {
        console.log('连接成功');
        document.getElementById('destroy-room').disabled = false;
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
                case 'history':
                    console.log('收到历史消息:', data.messages);
                    data.messages.forEach(msg => {
                        addMessage(msg.username, msg.message);
                    });
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
                    console.log('房间被销毁');
                    document.getElementById('chat').innerHTML = '';
                    updateUserList([]);
                    alert(data.message);
                    joined = false;
                    username = '';
                    roomId = '';
                    document.getElementById('room-id').value = '';
                    document.getElementById('current-room-id').textContent = '';
                    document.getElementById('username-label').style.display = 'block';
                    document.getElementById('username').style.display = 'block';
                    document.getElementById('join').style.display = 'block';
                    document.getElementById('message').disabled = true;
                    document.getElementById('send').disabled = true;
                    document.getElementById('destroy-room').disabled = true;
                    ws.close();
                    break;
                case 'inactive':
                    console.log('因不活跃被断开:', data.message);
                    alert(data.message);
                    joined = false;
                    username = '';
                    roomId = '';
                    document.getElementById('room-id').value = '';
                    document.getElementById('current-room-id').textContent = '';
                    document.getElementById('chat').innerHTML = '';
                    updateUserList([]);
                    document.getElementById('username-label').style.display = 'block';
                    document.getElementById('username').style.display = 'block';
                    document.getElementById('join').style.display = 'block';
                    document.getElementById('message').disabled = true;
                    document.getElementById('send').disabled = true;
                    document.getElementById('destroy-room').disabled = true;
                    ws.close();
                    break;
                default:
                    console.warn('未知消息类型:', data);
                    break;
            }
        } catch (error) {
            console.error('消息解析失败:', error);
        }
    };
    ws.onclose = (event) => {
        console.log(`连接关闭，代码: ${event.code}, 原因: ${event.reason}`);
        joined = false;
        username = '';
        document.getElementById('message').disabled = true;
        document.getElementById('send').disabled = true;
        document.getElementById('username-label').style.display = 'block';
        document.getElementById('username').style.display = 'block';
        document.getElementById('join').style.display = 'block';
        document.getElementById('chat').innerHTML = '';
        updateUserList([]);
        document.getElementById('destroy-room').disabled = true;
        if (event.code === 1000 && event.reason === 'Inactive') {
            // 已在 inactive 消息中处理
        } else {
            alert('连接断开，请重新加入');
            roomId = '';
            document.getElementById('room-id').value = '';
            document.getElementById('current-room-id').textContent = '';
        }
    };
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('join-room').onclick = () => {
        const input = document.getElementById('room-id');
        const id = input.value.trim();
        if (!id) {
            alert('请输入房间 ID');
            return;
        }
        roomId = id;
        document.getElementById('current-room-id').textContent = `当前房间: ${roomId}`;
        connect();
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
        if (!roomId) {
            alert('请先进入一个房间');
            return;
        }
        console.log('尝试加入，用户名:', name);
        username = name;
        ws.send(JSON.stringify({ type: 'join', username }));
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
});

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
