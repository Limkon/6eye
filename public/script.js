let ws;
let username = '';
let joined = false;
let roomId = '';
let roomLocked = false;

function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    ws = new WebSocket(`wss://${location.host}/${roomId}`);
    ws.onopen = () => {
        document.getElementById('destroy-room').disabled = false;
    };
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case 'userList':
                    updateUserList(data.users);
                    break;
                case 'message':
                    addMessage(data.username, data.message);
                    break;
                case 'history':
                    data.messages.forEach(msg => addMessage(msg.username, msg.message));
                    break;
                case 'joinSuccess':
                    joined = true;
                    document.getElementById('message').disabled = false;
                    document.getElementById('send').disabled = false;
                    document.getElementById('username-label').style.display = 'none';
                    document.getElementById('username').style.display = 'none';
                    document.getElementById('join').style.display = 'none';
                    break;
                case 'joinError':
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
                    document.getElementById('chat').innerHTML = '';
                    updateUserList([]);
                    alert(data.message);
                    resetRoom();
                    ws.close();
                    break;
                case 'inactive':
                    alert(data.message);
                    resetRoom();
                    ws.close();
                    break;
            }
        } catch (error) {
            console.error('消息解析失败:', error);
        }
    };
    ws.onclose = (event) => {
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
        if (event.code !== 1000 || (event.reason !== 'Inactive' && event.reason !== 'RoomDestroyed')) {
            alert('连接断开，请重新加入');
            resetRoom();
        }
    };
}

function resetRoom() {
    roomId = '';
    roomLocked = false;
    document.getElementById('room-id').value = '';
    document.getElementById('current-room-id').textContent = '';
}

document.addEventListener('DOMContentLoaded', () => {
    const joinRoomButton = document.getElementById('join-room');
    const handleJoinRoom = () => {
        if (roomLocked) {
            alert('您已在房间中，请退出后重新进入其他房间');
            return;
        }
        const input = document.getElementById('room-id');
        const id = input.value.trim();
        if (!id) {
            alert('请输入房间 ID');
            return;
        }
        roomId = id;
        roomLocked = true;
        document.getElementById('current-room-id').textContent = `当前房间: ${roomId}`;
        input.value = '';
        connect();
    };
    joinRoomButton.addEventListener('click', handleJoinRoom);
    joinRoomButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleJoinRoom();
    });

    const joinButton = document.getElementById('join');
    const handleJoin = () => {
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
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connect();
        }
        username = name;
        ws.send(JSON.stringify({ type: 'join', username }));
    };
    joinButton.addEventListener('click', handleJoin);
    joinButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleJoin();
    });

    const sendButton = document.getElementById('send');
    const handleSend = () => {
        const input = document.getElementById('message');
        const msg = input.value.trim();
        if (!msg) return;
        ws.send(JSON.stringify({ type: 'message', message: msg }));
        input.value = '';
    };
    sendButton.addEventListener('click', handleSend);
    sendButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleSend();
    });

    document.getElementById('message').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    const themeToggleButton = document.getElementById('theme-toggle');
    const handleThemeToggle = () => {
        document.body.classList.toggle('dark-mode');
        document.body.classList.toggle('light-mode');
    };
    themeToggleButton.addEventListener('click', handleThemeToggle);
    themeToggleButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleThemeToggle();
    });

    const userlistToggleButton = document.getElementById('userlist-toggle');
    const handleUserlistToggle = () => {
        document.getElementById('userlist').classList.toggle('hidden');
    };
    userlistToggleButton.addEventListener('click', handleUserlistToggle);
    userlistToggleButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleUserlistToggle();
    });

    const destroyRoomButton = document.getElementById('destroy-room');
    const handleDestroyRoom = () => {
        if (destroyRoomButton.disabled) return; // 检查禁用状态
        if (confirm('确定要销毁房间吗？所有聊天记录将被删除！')) {
            ws.send(JSON.stringify({ type: 'destroy' }));
        }
    };
    destroyRoomButton.addEventListener('click', handleDestroyRoom);
    destroyRoomButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleDestroyRoom();
    });
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
    list.innerHTML = '<h3>当前在线用户：</h3>';
    users.filter(user => user).forEach(user => {
        const div = document.createElement('div');
        div.textContent = user;
        list.appendChild(div);
    });
}
