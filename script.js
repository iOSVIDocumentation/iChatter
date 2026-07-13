// Конфигурация бэкенда (адрес твоего туннеля Cloudflare)
var BACKEND_URL = "https://moss-perspective-stands-copying.trycloudflare.com";

var socket;
var currentActiveChatPartner = null;
var currentRoom = null;
var myUsername = localStorage.getItem('ichatter_username') || "User_" + Math.floor(Math.random() * 1000);
var chatSettings = {};
var activeDialogs = []; // Список чатов изначально пуст, как при регистрации!

try {
    if (localStorage.getItem('ichatter_settings')) {
        chatSettings = JSON.parse(localStorage.getItem('ichatter_settings'));
    }
} catch(e) {
    console.log("Ошибка загрузки настроек");
}

// Безопасная инициализация для iOS 6 Safari
if (document.addEventListener) {
    document.addEventListener("DOMContentLoaded", function() {
        initApp();
    });
} else {
    window.onload = function() {
        initApp();
    };
}

function initApp() {
    // Чиним отображение главного body для старого WebKit
    var mainBody = document.getElementById("main-body");
    if (mainBody) {
        mainBody.style.display = "-webkit-box";
        mainBody.style.display = "-webkit-flex";
        mainBody.style.display = "flex";
    }

    // Чиним контейнер сайдбара
    var sidebar = document.getElementById("sidebar");
    if (sidebar) {
        sidebar.style.display = "-webkit-box";
        sidebar.style.display = "-webkit-flex";
        sidebar.style.display = "flex";
        sidebar.style.webkitBoxOrient = "vertical";
    }

    // Выводим имя пользователя в профиль (верхний левый угол)
    var profileNameBtn = document.getElementById("my-profile-name");
    if (profileNameBtn) {
        profileNameBtn.innerText = myUsername;
    }

    // Подключаем сокеты
    initSocket();

    // Обработчик отправки сообщений из формы
    var form = document.getElementById("form");
    if (form) {
        form.addEventListener("submit", function(e) {
            e.preventDefault();
            sendMessage();
        });
    }

    // Оживляем кнопки поиска и настроек из твоего HTML
    initSearchAndSettings();

    // Отрендерить пустой список диалогов
    renderChatsList();
}

function initSocket() {
    if (typeof io === "undefined") {
        console.log("Socket.io не найден!");
        return;
    }

    socket = io(BACKEND_URL, {
        transports: ['websocket', 'polling']
    });

    socket.on("connect", function() {
        console.log("Успешно подключено к бэкенду!");
        socket.emit("user_join", { username: myUsername });
    });

    socket.on("receive_message", function(data) {
        if (data.room === currentRoom) {
            displayNewMessage(data);
        }
    });
}

// Рендеринг списка чатов под дизайн окон авторизации/регистрации
function renderChatsList() {
    var chatsList = document.getElementById("chats-list");
    if (!chatsList) return;

    chatsList.innerHTML = "";
    
    // Если чатов нет (как после регистрации)
    if (activeDialogs.length === 0) {
        var emptyNotice = document.createElement("div");
        emptyNotice.style.padding = "30px 15px";
        emptyNotice.style.color = "#555555";
        emptyNotice.style.textAlign = "center";
        emptyNotice.style.fontSize = "13px";
        emptyNotice.style.fontFamily = "Helvetica Neue, Arial, sans-serif";
        emptyNotice.style.textShadow = "0 1px 0 rgba(255,255,255,0.6)";
        emptyNotice.innerText = "Нет активных диалогов.\nНажмите 🔍 чтобы найти собеседника.";
        chatsList.appendChild(emptyNotice);
        return;
    }
    
    // Если чаты есть, строим их по структуре твоего HTML
    for (var i = 0; i < activeDialogs.length; i++) {
        (function(user) {
            var item = document.createElement("div");
            
            // Задаем классы из твоего файла стилей
            item.className = "chat-item";
            if (currentActiveChatPartner === user) {
                item.className += " active";
            }
            
            // Добавляем ретро-флекс для iOS 6, чтобы элементы не сжимались
            item.style.display = "-webkit-box";
            item.style.display = "-webkit-flex";
            item.style.display = "flex";
            item.style.webkitBoxAlign = "center";
            item.style.alignItems = "center";

            // Внутренний блок диалога с глянцевой круглой аватаркой в стиле iOS
            item.innerHTML = 
                '<div class="chat-info-block" style="display:-webkit-box; display:flex; -webkit-box-align:center; align-items:center; gap:12px;">' +
                    '<div class="avatar-placeholder" style="' +
                        'background: -webkit-linear-gradient(top, #7abcff 0%, #4096ee 100%); ' +
                        'background: linear-gradient(to bottom, #7abcff 0%, #4096ee 100%); ' +
                        'width: 40px; height: 40px; border-radius: 50%; color: #fff; ' +
                        'display: -webkit-box; display: flex; -webkit-box-pack: center; justify-content: center; ' +
                        '-webkit-box-align: center; align-items: center; ' +
                        'font-weight: bold; border: 1px solid #286096; box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 2px rgba(0,0,0,0.3);">' + 
                        user[0].toUpperCase() + 
                    '</div>' +
                    '<div style="-webkit-box-flex: 1; flex-grow: 1;">' +
                        '<strong style="color: var(--text-main); font-size: 15px; font-family: Helvetica Neue, Arial;">' + user + '</strong>' +
                    '</div>' +
                '</div>' +
                '<div class="status-dot online" style="margin-top:0; margin-left:auto;">●</div>';
            
            item.onclick = function() {
                startChatWithUser(user);
            };
            
            chatsList.appendChild(item);
        })(activeDialogs[i]);
    }
}

// Привязка к точным ID элементов из твоего HTML
function initSearchAndSettings() {
    // Кнопка Лупы (Поиск)
    var searchToggleBtn = document.getElementById("search-toggle-btn");
    if (searchToggleBtn) {
        searchToggleBtn.onclick = function() {
            // Переключаем видимость встроенной панели поиска, если она нужна
            var searchFrame = document.getElementById("search-frame");
            if (searchFrame) {
                if (searchFrame.className.indexOf("active") !== -1) {
                    searchFrame.className = searchFrame.className.replace(" active", "");
                } else {
                    searchFrame.className += " active";
                    var srcInput = document.getElementById("search-input");
                    if (srcInput) srcInput.focus();
                }
            }
            
            // Альтернативный надежный ввод имени для iOS 6 через prompt
            var person = prompt("Введите имя пользователя для начала чата:", "");
            if (person && person.trim() !== "") {
                var cleanName = person.trim();
                if (activeDialogs.indexOf(cleanName) === -1) {
                    activeDialogs.push(cleanName);
                }
                startChatWithUser(cleanName);
            }
        };
    }

    // Кнопка Шестерёнки (Настройки)
    var settingsToggleBtn = document.getElementById("settings-toggle-btn");
    if (settingsToggleBtn) {
        settingsToggleBtn.onclick = function() {
            openMyProfile();
        };
    }

    // Крестик закрытия модалки настроек
    var closeSettingsBtn = document.getElementById("settings-close-btn");
    if (closeSettingsBtn) {
        closeSettingsBtn.onclick = function() {
            var modal = document.getElementById("settings-modal");
            if (modal) {
                modal.className = modal.className.replace(" active", "");
            }
        };
    }

    // Кнопка возврата Назад (для iPad в портретном/мобильном режиме)
    var backBtn = document.getElementById("btn-back");
    if (backBtn) {
        backBtn.onclick = function() {
            document.body.className = document.body.className.replace(" chat-opened", "");
        };
    }
}

// Открытие чата с пользователем
function startChatWithUser(username) {
    currentActiveChatPartner = username;
    currentRoom = [myUsername, username].sort().join("_");
    
    // Скрываем заглушку "Выберите чат"
    var placeholder = document.getElementById("no-chat-placeholder");
    if (placeholder) placeholder.style.display = "none";
    
    // Показываем и разворачиваем область чата через префиксы WebKit
    var chatArea = document.getElementById("chat-area");
    if (chatArea) {
        chatArea.style.display = "-webkit-box";
        chatArea.style.display = "-webkit-flex";
        chatArea.style.display = "flex";
    }
    
    // Меняем заголовок чата на имя собеседника
    var titleText = document.getElementById("chat-title-text");
    if (titleText) titleText.innerText = username;
    
    // Очищаем окно сообщений перед загрузкой новых
    var messagesUl = document.getElementById("messages");
    if (messagesUl) messagesUl.innerHTML = "";
    
    if (socket) {
        socket.emit("join_room", { room: currentRoom });
    }
    
    // Перерендерить список, чтобы подсветить активный чат
    renderChatsList();
    
    if (document.body.className.indexOf("chat-opened") === -1) {
        document.body.className += " chat-opened";
    }
}

function sendMessage() {
    var input = document.getElementById("input");
    if (!input || !input.value.trim() || !currentRoom) return;

    var msgData = {
        room: currentRoom,
        sender: myUsername,
        text: input.value.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (socket) {
        socket.emit("send_message", msgData);
    }
    
    displayNewMessage(msgData);
    input.value = "";
}

function displayNewMessage(data) {
    var messagesUl = document.getElementById("messages");
    if (!messagesUl) return;

    var isMy = data.sender === myUsername;
    
    var container = document.createElement("div");
    container.className = "msg-container" + (isMy ? " my-wrapper" : "");

    var li = document.createElement("li");
    if (isMy) li.className = "my-msg";
    
    li.innerHTML = '<div>' + data.text + '</div>' +
        '<div class="msg-meta-line">' +
            '<span class="msg-time">' + data.time + '</span>' +
        '</div>';

    container.appendChild(li);
    messagesUl.appendChild(container);
    
    // Автоскролл вниз
    messagesUl.scrollTop = messagesUl.scrollHeight;
}

function openMyProfile() {
    var modal = document.getElementById("settings-modal");
    if (modal) {
        if (modal.className.indexOf("active") === -1) {
            modal.className += " active";
        }
        
        // Заполняем поле инпута в настройках текущим ником
        var nameInput = document.getElementById("profile-display-name");
        if (nameInput) nameInput.value = myUsername;
        
        var infoNick = document.getElementById("info-nick");
        if (infoNick) infoNick.innerText = "@" + myUsername.toLowerCase();
    }
}

// Функция сохранения имени из модалки настроек
function saveMyDisplayName(val) {
    if (val && val.trim() !== "") {
        myUsername = val.trim();
        localStorage.setItem('ichatter_username', myUsername);
        var profileNameBtn = document.getElementById("my-profile-name");
        if (profileNameBtn) profileNameBtn.innerText = myUsername;
    }
}

function toggleAttachmentMenu() {
    var bubble = document.getElementById("attachment-bubble");
    if (bubble) {
        if (bubble.className.indexOf("active") !== -1) {
            bubble.className = bubble.className.replace(" active", "");
        } else {
            bubble.className += " active";
        }
    }
}

function toggleChatMenu(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    var menu = document.getElementById("chat-options-menu");
    if (menu) {
        menu.style.display = menu.style.display === "block" ? "none" : "block";
    }
}

if (document.addEventListener) {
    document.addEventListener("click", function() {
        var menu = document.getElementById("chat-options-menu");
        if (menu) menu.style.display = "none";
    });
}
