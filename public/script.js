// public/script.js
let ws;
let username = '';
let joined = false;
let roomId = '';
let roomLocked = false;

const MESSAGE_TYPES = {
    USER_LIST: 'userList',
    MESSAGE: 'message',
    HISTORY: 'history',
    JOIN_SUCCESS: 'joinSuccess',
    JOIN_ERROR: 'joinError',
    ROOM_DESTROYED: 'roomDestroyed',
    INACTIVE: 'inactive',
    JOIN: 'join',
    DESTROY: 'destroy',
    SYSTEM: 'system', // For system messages like join/leave
    FILE_MESSAGE: 'file_message' // New type for sending files
};

// DOM Elements
let roomIdInput, joinRoomButton, currentRoomIdElement, usernameLabel, usernameInput, joinButton,
    messageInput, sendButton, chatElement, userListElement, destroyRoomButton,
    themeToggleButton, userlistToggleButton, fileInputElement, attachFileButton;

// Function to establish WebSocket connection
function connect() {
    // Close existing connection if any
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.close(1000, 'New connection requested'); // Normal closure
        } catch (e) {
            console.warn("关闭现有 WebSocket 时出错:", e);
        }
    }

    // Ensure roomId is not empty before trying to connect
    if (!roomId) {
        console.error("房间 ID 为空，无法连接。");
        alert("请输入有效的房间 ID。");
        roomLocked = false; // Unlock room input
        if (currentRoomIdElement) currentRoomIdElement.textContent = '当前房间: 未加入';
        return;
    }

    // Determine WebSocket protocol based on current page protocol
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${location.host}/${encodeURIComponent(roomId)}`);

    ws.onopen = () => {
        console.log('WebSocket 连接已建立。');
        if (destroyRoomButton) destroyRoomButton.disabled = false;
        // Automatically try to join with existing username if available
        if (username && !joined) {
            sendJoinRequest(username);
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case MESSAGE_TYPES.USER_LIST:
                    updateUserList(data.users);
                    break;
                case MESSAGE_TYPES.MESSAGE:
                    addMessageToChat(data.username, data.message, MESSAGE_TYPES.MESSAGE, data.timestamp);
                    break;
                case MESSAGE_TYPES.FILE_MESSAGE: // Handle incoming file messages
                    addMessageToChat(data.username, data.file, MESSAGE_TYPES.FILE_MESSAGE, data.timestamp);
                    break;
                case MESSAGE_TYPES.HISTORY:
                    if (chatElement) chatElement.innerHTML = ''; // Clear chat before loading history
                    data.messages.forEach(msg => {
                        // Adapt based on how history messages are structured (text vs file placeholder)
                        if (msg.type === MESSAGE_TYPES.FILE_MESSAGE && msg.file && typeof msg.file === 'object') {
                             // This handles live-like file objects if they were somehow stored fully in history (not current server logic)
                             // Or, more likely, this is for the placeholder structure from server.js
                             addMessageToChat(msg.username, msg.file, MESSAGE_TYPES.FILE_MESSAGE, msg.timestamp);
                        } else if (msg.type === MESSAGE_TYPES.FILE_MESSAGE && typeof msg.message === 'string') {
                            // This is the expected path for history: message is a placeholder string
                            // We need to parse it or pass it to addMessageToChat to display as a placeholder
                            addMessageToChat(msg.username, { name: msg.message, type: 'placeholder' }, MESSAGE_TYPES.FILE_MESSAGE, msg.timestamp);
                        } else if (msg.message) { // Assuming old messages are text
                             addMessageToChat(msg.username, msg.message, MESSAGE_TYPES.MESSAGE, msg.timestamp);
                        }
                    });
                    break;
                case MESSAGE_TYPES.JOIN_SUCCESS:
                    joined = true;
                    if (messageInput) messageInput.disabled = false;
                    if (sendButton) sendButton.disabled = false;
                    if (attachFileButton) attachFileButton.disabled = false; // Enable attach button
                    if (usernameLabel) usernameLabel.style.display = 'none';
                    if (usernameInput) usernameInput.style.display = 'none';
                    if (joinButton) joinButton.style.display = 'none';
                    console.log('成功加入房间。');
                    break;
                case MESSAGE_TYPES.JOIN_ERROR:
                    alert(data.message || '用户名已存在或无效，请重新输入');
                    // Do not reset username here, let user decide to change or retry
                    if (usernameLabel) usernameLabel.style.display = 'block';
                    if (usernameInput) usernameInput.style.display = 'block';
                    if (joinButton) joinButton.style.display = 'block';
                    if (messageInput) messageInput.disabled = true;
                    if (sendButton) sendButton.disabled = true;
                    if (attachFileButton) attachFileButton.disabled = true; // Disable attach button
                    joined = false;
                    break;
                case MESSAGE_TYPES.ROOM_DESTROYED:
                    alert(data.message || '房间已被销毁。');
                    if (ws) ws.close(1000, 'RoomDestroyed'); // This will trigger onclose
                    break;
                case MESSAGE_TYPES.INACTIVE:
                    alert(data.message || '由于长时间未活动，您已断开连接。');
                    if (ws) ws.close(1000, 'Inactive'); // This will trigger onclose
                    break;
                case MESSAGE_TYPES.SYSTEM:
                    addSystemMessageToChat(data.message);
                    break;
                default:
                    console.warn('收到未知消息类型:', data.type, data);
            }
        } catch (error) {
            console.error('消息解析失败或处理失败:', error, event.data);
        }
    };

    ws.onclose = (event) => {
        console.log(`WebSocket 连接已关闭。代码: ${event.code}, 原因: "${event.reason}", 清洁: ${event.wasClean}`);
        joined = false;
        // username = ''; // Don't reset username, user might want to rejoin same room with same name

        if (messageInput) messageInput.disabled = true;
        if (sendButton) sendButton.disabled = true;
        if (attachFileButton) attachFileButton.disabled = true; // Disable attach button
        if (destroyRoomButton) destroyRoomButton.disabled = true;

        if (usernameLabel) usernameLabel.style.display = 'block';
        if (usernameInput) usernameInput.style.display = 'block';
        if (joinButton) joinButton.style.display = 'block';

        if (chatElement) chatElement.innerHTML = ''; // Clear chat on disconnect
        updateUserList([]);

        // Alert only for unexpected disconnections
        const specialReasons = [MESSAGE_TYPES.INACTIVE, MESSAGE_TYPES.ROOM_DESTROYED, 'New connection requested', 'UserLeft', 'Room destroyed'];
        if (!specialReasons.includes(event.reason) && event.code !== 1000 && event.code !== 1005) {
            alert(`连接意外断开 (代码: ${event.code})，请重新加入`);
        }
        resetRoomUIState(); // Reset UI related to room state
    };

    ws.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        // alert('WebSocket连接发生错误，请尝试重新加入。'); // Can be noisy
    };
}

// Function to reset UI elements related to room state
function resetRoomUIState() {
    roomId = ''; // Clear current room ID
    roomLocked = false;
    if (roomIdInput) roomIdInput.value = '';
    if (currentRoomIdElement) currentRoomIdElement.textContent = '当前房间: 未加入';
    if (destroyRoomButton) destroyRoomButton.disabled = true;
    if (messageInput) messageInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
    if (attachFileButton) attachFileButton.disabled = true; // Ensure attach button is disabled

    // Show username input fields if not joined
    if (!joined) {
        if (usernameLabel) usernameLabel.style.display = 'block';
        if (usernameInput) usernameInput.style.display = 'block';
        if (joinButton) joinButton.style.display = 'block';
    }
}


document.addEventListener('DOMContentLoaded', () => {
    // Fetch DOM elements
    roomIdInput = document.getElementById('room-id');
    joinRoomButton = document.getElementById('join-room');
    currentRoomIdElement = document.getElementById('current-room-id');
    usernameLabel = document.getElementById('username-label');
    usernameInput = document.getElementById('username');
    joinButton = document.getElementById('join');
    messageInput = document.getElementById('message');
    sendButton = document.getElementById('send');
    chatElement = document.getElementById('chat');
    userListElement = document.getElementById('userlist');
    destroyRoomButton = document.getElementById('destroy-room');
    themeToggleButton = document.getElementById('theme-toggle');
    userlistToggleButton = document.getElementById('userlist-toggle');
    fileInputElement = document.getElementById('file-input'); // Get the file input
    attachFileButton = document.getElementById('attach-file'); // Get the attach file button

    // Basic check for critical elements
    const criticalElements = [roomIdInput, joinRoomButton, currentRoomIdElement, usernameInput, joinButton, messageInput, sendButton, chatElement, userListElement, destroyRoomButton, themeToggleButton, userlistToggleButton, fileInputElement, attachFileButton];
    if (criticalElements.some(el => !el)) {
        console.error("一个或多个必要的DOM元素未找到。请检查HTML的ID是否正确。");
        alert("页面初始化失败，部分功能可能无法使用。请刷新页面或联系管理员。");
        return;
    }
    resetRoomUIState(); // Initialize UI state on load

    // Event listener for "Join Room" button
    const handleJoinRoom = () => {
        if (roomLocked && roomId) { // If already in a room or attempting to join one
             if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                alert('您已在房间中或正在连接。如需更换房间，请刷新页面或等待当前连接关闭。');
                return;
            }
        }
        const id = roomIdInput.value.trim();
        if (!id) {
            alert('请输入房间 ID');
            return;
        }
        roomId = id;
        roomLocked = true;
        currentRoomIdElement.textContent = `当前房间: ${roomId}`;
        // roomIdInput.value = ''; // Don't clear, user might want to see what they typed if connection fails
        connect();
    };
    joinRoomButton.addEventListener('click', handleJoinRoom);
    // joinRoomButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleJoinRoom(); }); // ontouchstart in HTML

    // Event listener for "Join" (with username) button
    const handleJoin = () => {
        const name = usernameInput.value.trim();
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
            console.log('WebSocket 未打开，尝试在加入前连接...');
            alert('连接尚未建立或已断开，请先确保成功进入房间。');
            return;
        }
        username = name; // Set username here before sending join request
        sendJoinRequest(name);
    };

    function sendJoinRequest(name) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({ type: MESSAGE_TYPES.JOIN, username: name }));
            } catch (error) {
                console.error("发送加入请求失败:", error);
                alert("发送加入请求失败，连接可能已断开。");
            }
        } else {
            alert("无法发送加入请求，连接未打开。");
        }
    }
    joinButton.addEventListener('click', handleJoin);
    // joinButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleJoin(); });

    // Event listener for "Send" message button
    const handleSend = () => {
        const msg = messageInput.value.trim();
        if (!msg) return; // Don't send empty messages
        if (ws && ws.readyState === WebSocket.OPEN && joined) {
            try {
                ws.send(JSON.stringify({ type: MESSAGE_TYPES.MESSAGE, message: msg }));
                messageInput.value = ''; // Clear input after sending
                messageInput.focus(); // Re-focus for next message
            } catch (error) {
                console.error("发送消息失败:", error);
                alert("发送消息失败，连接可能已断开。");
            }
        } else {
            alert("未连接到聊天室或未加入，无法发送消息。");
        }
    };
    sendButton.addEventListener('click', handleSend);
    // sendButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleSend(); });

    // Event listener for Enter key in message input
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { // Send on Enter, allow Shift+Enter for newline
            e.preventDefault(); // Prevent default Enter behavior (newline in textarea)
            handleSend();
        }
    });

    // Event listener for "Attach File" button
    attachFileButton.addEventListener('click', () => {
        if (joined) {
            fileInputElement.click(); // Programmatically click the hidden file input
        } else {
            alert("请先加入房间才能发送文件。");
        }
    });

    // Event listener for file selection
    fileInputElement.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return; // No file selected

        if (!joined || !ws || ws.readyState !== WebSocket.OPEN) {
            alert("未连接到聊天室或未加入，无法发送文件。");
            fileInputElement.value = ''; // Reset file input
            return;
        }

        // Basic file size check (e.g., 10MB limit for this example for Base64)
        // For production, larger files should be chunked or uploaded to a dedicated server.
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            alert(`文件过大 (${(file.size / 1024 / 1024).toFixed(2)} MB)。最大允许 ${maxSize / 1024 / 1024} MB。`);
            fileInputElement.value = ''; // Reset file input
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const fileData = e.target.result; // Base64 string (data:mime/type;base64,...)
            try {
                ws.send(JSON.stringify({
                    type: MESSAGE_TYPES.FILE_MESSAGE,
                    file: {
                        name: file.name, // Original filename
                        type: file.type, // MIME type (e.g., "image/jpeg", "video/mp4")
                        data: fileData   // Base64 encoded content
                    }
                }));
            } catch (error) {
                console.error("发送文件失败:", error);
                // This catch might not catch WebSocket send errors if the error is within ws.send itself
                // (e.g., if data is too large for configured maxPayload on server, though client check helps)
                alert("发送文件失败，连接可能已断开或数据过大。");
            }
        };
        reader.onerror = (error) => {
            console.error("读取文件失败:", error);
            alert("读取文件失败。");
        };
        reader.readAsDataURL(file); // Read file as Base64 data URL
        fileInputElement.value = ''; // Reset file input to allow selecting the same file again if needed
    });


    // Event listener for "Theme Toggle" button
    const handleThemeToggle = () => {
        document.body.classList.toggle('dark-mode');
        document.body.classList.toggle('light-mode'); // Ensure one is always present
        // Update button text based on current mode
        themeToggleButton.textContent = document.body.classList.contains('dark-mode') ? '☀️ 明亮主题' : '🌗 暗黑主题';
    };
    themeToggleButton.addEventListener('click', handleThemeToggle);
    // themeToggleButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleThemeToggle(); });

    // Event listener for "User List Toggle" button
    const handleUserlistToggle = () => {
        if (userListElement) userListElement.classList.toggle('hidden');
    };
    userlistToggleButton.addEventListener('click', handleUserlistToggle);
    // userlistToggleButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleUserlistToggle(); });

    // Event listener for "Destroy Room" button
    const handleDestroyRoom = () => {
        if (destroyRoomButton && destroyRoomButton.disabled) return; // Prevent action if disabled
        if (confirm('确定要销毁房间吗？所有聊天记录将被删除！')) {
            if (ws && ws.readyState === WebSocket.OPEN && joined) {
                try {
                    ws.send(JSON.stringify({ type: MESSAGE_TYPES.DESTROY }));
                } catch (error) {
                    console.error("发送销毁房间请求失败:", error);
                    alert("发送销毁房间请求失败，连接可能已断开。");
                }
            } else {
                alert("未连接到聊天室或未加入，无法销毁房间。");
            }
        }
    };
    destroyRoomButton.addEventListener('click', handleDestroyRoom);
    // destroyRoomButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleDestroyRoom(); });

    // Initialize theme button text correctly on load
    themeToggleButton.textContent = document.body.classList.contains('dark-mode') ? '☀️ 明亮主题' : '🌗 暗黑主题';
});

// Function to add a message (text or file) to the chat display
function addMessageToChat(user, content, type, timestamp) {
    if (!chatElement) return;
    const div = document.createElement('div');
    const messageOwnerClass = (user === username && username !== '') ? 'message-right' : 'message-left';
    div.className = `message ${messageOwnerClass}`;

    const userSpan = document.createElement('span');
    userSpan.className = 'message-username';
    userSpan.textContent = `${user}:`; // Display username
    div.appendChild(userSpan);

    if (type === MESSAGE_TYPES.FILE_MESSAGE && typeof content === 'object' && content !== null) {
        const fileInfo = content; // content is { name, type, data } for live files
                                  // or { name, type: 'placeholder'} for history placeholders (where content.name is the placeholder text)
        const fileDisplayContainer = document.createElement('div');
        fileDisplayContainer.className = 'message-file';

        if (fileInfo.type.startsWith('image/') && fileInfo.data) {
            const img = document.createElement('img');
            img.src = fileInfo.data; // Base64 data URL
            img.alt = fileInfo.name; // Filename as alt text
            img.onload = () => { // Scroll to bottom after image has loaded and dimensions are known
                chatElement.scrollTop = chatElement.scrollHeight;
            };
            fileDisplayContainer.appendChild(img);
        } else if (fileInfo.type.startsWith('video/') && fileInfo.data) {
            const video = document.createElement('video');
            video.src = fileInfo.data; // Base64 data URL
            video.controls = true;    // Show default video controls
            video.onloadeddata = () => { // Scroll after video metadata (and thus dimensions) are loaded
                chatElement.scrollTop = chatElement.scrollHeight;
            };
            fileDisplayContainer.appendChild(video);
        } else {
            // Fallback for other file types or if data is missing (e.g., placeholder from history)
            const p = document.createElement('p');
            p.className = 'message-text'; // Use message-text for consistent styling
            if (fileInfo.type === 'placeholder') {
                p.textContent = fileInfo.name; // Display the placeholder text directly
            } else if (fileInfo.name) { // For live files that aren't image/video or if data is somehow missing
                 p.textContent = `[文件: ${fileInfo.name} (${fileInfo.type || '未知类型'})]`;
            } else {
                 p.textContent = `[收到一个文件，但无法显示详情]`;
            }
            fileDisplayContainer.appendChild(p);
        }
        div.appendChild(fileDisplayContainer);

    } else if (type === MESSAGE_TYPES.MESSAGE && typeof content === 'string') {
        const messageSpan = document.createElement('span');
        messageSpan.className = 'message-text';
        messageSpan.textContent = content; // Regular text message
        div.appendChild(messageSpan);
    } else {
        // Handle unexpected content format gracefully
        console.warn("addMessageToChat: 未知内容类型或格式", { user, content, type, timestamp });
        const p = document.createElement('p');
        p.className = 'message-text';
        p.textContent = "[无法显示的消息内容]";
        div.appendChild(p);
    }
    
    chatElement.appendChild(div);
    // Debounce scroll or use requestAnimationFrame for smoother scrolling, especially with media
    requestAnimationFrame(() => {
        chatElement.scrollTop = chatElement.scrollHeight;
    });
}

// Function to add a system message (e.g., user join/leave) to the chat
function addSystemMessageToChat(message) {
    if (!chatElement) return;
    const div = document.createElement('div');
    div.className = 'message system-message'; // Specific class for system messages

    const messageSpan = document.createElement('span');
    // No username span for system messages
    messageSpan.textContent = message;
    div.appendChild(messageSpan);

    chatElement.appendChild(div);
    chatElement.scrollTop = chatElement.scrollHeight; // Scroll to bottom
}


// Function to update the displayed user list
function updateUserList(users) {
    if (!userListElement) return;
    userListElement.innerHTML = '<h3>当前在线用户：</h3>'; // Keep title
    if (users && users.length > 0) {
        users
            .filter(user => user && typeof user === 'string' && user.trim() !== '') // Ensure user is a non-empty string
            .forEach(user => {
                const div = document.createElement('div');
                div.className = 'userlist-entry';
                div.textContent = user;
                userListElement.appendChild(div);
            });
    } else {
        const div = document.createElement('div');
        div.textContent = "暂无其他用户";
        div.className = 'userlist-empty';
        userListElement.appendChild(div);
    }
}
