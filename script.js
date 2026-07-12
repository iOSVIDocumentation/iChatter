// Конфигурация бэкенда (адрес твоего туннеля Cloudflare/Ngrok)
const BACKEND_URL = "https://colour-slowly-complications-trade.trycloudflare.com";

let socket;
let currentActiveChatPartner = null;
let currentRoom = null;
let myUsername = localStorage.getItem('ichatter_username') || "User_" + Math.floor(Math.random() * 1000);
let chatSettings = JSON.parse(localStorage.getItem('ichatter_settings')) || {};

document.addEventListener("DOMContentLoaded", () => {
    // Принудительно инициализируем интерфейс
    initApp();
});

function initApp() {
    // Показываем основной блок чата
    const mainBody = document.getElementById("main-body");
    if (mainBody) mainBody.style.display = "flex";

    // Обновляем имя профиля на кнопке
    const profileNameBtn = document.getElementById("my-profile-name");
    if (profileNameBtn) profileNameBtn.innerText = myUsername;

    // Подключаемся к сокетам
    initSocket();

    // Вешаем обработчик на форму отправки
    const form = document.getElementById("form");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            sendMessage();
        });
    }

    // Загружаем тестовый список чатов
    renderChatsList();
}

function initSocket() {
    if (typeof io === "undefined") {
        console.error("Socket.io не загрузился. Проверь туннель бэкенда!");
        return;
    }

    // Подключение к твоему туннелю
    socket = io(BACKEND_URL, {
        transports: ['websocket', 'polling']
    });

    socket.on("connect", () => {
        console.log("Успешно подключено к бэкенду чата!");
        socket.emit("user_join", { username: myUsername });
    });

    socket.on("receive_message", (data) => {
        if (data.room === currentRoom) {
            displayNewMessage(data);
        }
    });
}

function renderChatsList() {
    const chatsList = document.getElementById("chats-list");
    if (!chatsList) return;

    chatsList.innerHTML = "";
    
    // Демонстрационные диалоги (замени или расширь логикой с бэкенда)
    const demoChats = ["Ostap", "Friend_Germany", "Developer"];
    
    demoChats.forEach(user => {
        const item = document.createElement("div");
        item.className = "chat-item";
        if (currentActiveChatPartner === user) item.classList.add("active");
        
        item.innerHTML = `
            <div class="chat-info-block">
                <div class="avatar-placeholder" style="background: #4a6c9b">${user[0]}</div>
                <strong>${user}</strong>
            </div>
        `;
        
        item.onclick = () => startChatWithUser(user);
        chatsList.appendChild(item);
    });
}

function startChatWithUser(username) {
    currentActiveChatPartner = username;
    currentRoom = [myUsername, username].sort().join("_"); // Простая комната для двоих
    
    document.getElementById("no-chat-placeholder").style.display = "none";
    document.getElementById("chat-area").style.display = "flex";
    document.getElementById("chat-title-text").innerText = username;
    
    document.getElementById("messages").innerHTML = ""; // Очищаем старое окно
    
    if (socket) {
        socket.emit("join_room", { room: currentRoom });
    }
    
    renderChatsList();
    
    // Мобильный фикс: добавляем класс для открытия чата во весь экран
    document.body.classList.add("chat-opened");
}

function sendMessage() {
    const input = document.getElementById("input");
    if (!input || !input.value.trim() || !currentRoom) return;

    const msgData = {
        room: currentRoom,
        sender: myUsername,
        text: input.value.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (socket) {
        socket.emit("send_message", msgData);
    }
    
    // Сразу отображаем у себя
    displayNewMessage(msgData);
    input.value = "";
}

function displayNewMessage(data) {
    const messagesUl = document.getElementById("messages");
    if (!messagesUl) return;

    const isMy = data.sender === myUsername;
    const container = document.createElement("div");
    container.className = `msg-container ${isMy ? 'my-wrapper' : ''}`;

    const li = document.createElement("li");
    li.className = isMy ? "my-msg" : "";
    li.innerHTML = `
        <div>${data.text}</div>
        <div class="msg-meta-line">
            <span class="msg-time">${data.time}</span>
        </div>
    `;

    container.appendChild(li);
    messagesUl.appendChild(container);
    messagesUl.scrollTop = messagesUl.scrollHeight;
}

// Функции-заглушки для элементов интерфейса, чтобы не было ошибок в консоли
function toggleAttachmentMenu() {
    document.getElementById("attachment-bubble").classList.toggle("active");
}
function openMyProfile() {
    document.getElementById("settings-modal").classList.add("active");
}
document.getElementById("settings-close-btn")?.addEventListener("click", () => {
    document.getElementById("settings-modal").classList.remove("active");
});
document.getElementById("btn-back")?.addEventListener("click", () => {
    document.body.classList.remove("chat-opened");
});
function toggleChatMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById("chat-options-menu");
    menu.style.display = menu.style.display === "block" ? "none" : "block";
}
document.addEventListener("click", () => {
    const menu = document.getElementById("chat-options-menu");
    if (menu) menu.style.display = "none";
});
