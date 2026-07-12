// Конфигурация бэкенда (адрес твоего туннеля)
var BACKEND_URL = "https://colour-slowly-complications-trade.trycloudflare.com";

var socket;
var currentActiveChatPartner = null;
var currentRoom = null;
var myUsername = localStorage.getItem('ichatter_username') || "User_" + Math.floor(Math.random() * 1000);
var chatSettings = {};

try {
    if (localStorage.getItem('ichatter_settings')) {
        chatSettings = JSON.parse(localStorage.getItem('ichatter_settings'));
    }
} catch(e) {
    console.log("Ошибка загрузки настроек");
}

// Безопасный запуск после загрузки страницы для iOS 6
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
    // Показываем основной блок чата и задаем ему базовые свойства, если флексы не сработают
    var mainBody = document.getElementById("main-body");
    if (mainBody) {
        mainBody.style.display = "block"; 
        mainBody.style.display = "-webkit-box";
        mainBody.style.display = "-webkit-flex";
        mainBody.style.display = "flex";
    }

    // Обновляем имя профиля на кнопке (если элемент есть)
    var profileNameBtn = document.getElementById("my-profile-name");
    if (profileNameBtn) {
        profileNameBtn.innerText = myUsername;
    }

    // Запускаем сокеты
    initSocket();

    // Навешиваем обработчик на форму отправки сообщений
    var form = document.getElementById("form");
    if (form) {
        form.addEventListener("submit", function(e) {
            e.preventDefault();
            sendMessage();
        });
    }

    // Привязываем поиск и настройки к твоим кнопкам-иконкам
    initSearchAndSettings();

    // Загружаем список чатов
    renderChatsList();
}

function initSocket() {
    if (typeof io === "undefined") {
        console.log("Socket.io не найден! Проверь подключение скрипта бэкенда.");
        return;
    }

    socket = io(BACKEND_URL, {
        transports: ['websocket', 'polling']
    });

    socket.on("connect", function() {
        console.log("Успешно подключено к бэкенду чата!");
        socket.emit("user_join", { username: myUsername });
    });

    socket.on("receive_message", function(data) {
        if (data.room === currentRoom) {
            displayNewMessage(data);
        }
    });
}

function renderChatsList() {
    var chatsList = document.getElementById("chats-list");
    if (!chatsList) return;

    chatsList.innerHTML = "";
    
    // Список контактов (демо-данные)
    var demoChats = ["Ostap", "Friend_Germany", "Developer"];
    
    for (var i = 0; i < demoChats.length; i++) {
        (function(user) {
            var item = document.createElement("div");
            item.className = "chat-item";
            if (currentActiveChatPartner === user) {
                item.className += " active";
            }
            
            item.innerHTML = '<div class="chat-info-block" style="display:-webkit-box; display:flex; -webkit-box-align:center; align-items:center; padding:10px; cursor:pointer;">' +
                '<div class="avatar-placeholder" style="background:#4a6c9b; width:35px; height:35px; border-radius:50%; color:#fff; text-align:center; line-height:35px; margin-right:10px; font-weight:bold;">' + user[0] + '</div>' +
                '<strong style="color:#000; font-size:16px;">' + user + '</strong>' +
            '</div>';
            
            item.onclick = function() {
                startChatWithUser(user);
            };
            chatsList.appendChild(item);
        })(demoChats[i]);
    }
}

function initSearchAndSettings() {
    // 1. Привязка к кнопке-шестерёнке (Настройки)
    // Ищет элементы по классам или картинкам внутри кнопок верхнего бара
    var settingsBtns = document.querySelectorAll(".settings-btn, [class*='gear'], [class*='settings']");
    
    // Если по классам не нашлось, вешаем клик на вторую круглую кнопку вверху (судя по твоему скриншоту)
    if (settingsBtns.length === 0) {
        var allButtons = document.getElementsByTagName("button");
        if (allButtons.length >= 2) {
            // Предполагаем, что первая лупа, вторая шестеренка
            allButtons[1].onclick = function() { openMyProfile(); };
        }
    } else {
        for (var i = 0; i < settingsBtns.length; i++) {
            settingsBtns[i].onclick = function() {
                openMyProfile();
            };
        }
    }

    // 2. Привязка к кнопке-лупе (Поиск / Создание чата через prompt)
    var searchBtns = document.querySelectorAll(".search-btn, [class*='search']");
    if (searchBtns.length === 0 && document.getElementsByTagName("button").length > 0) {
        document.getElementsByTagName("button")[0].onclick = function() {
            triggerSearchPrompt();
        };
    } else {
        for (var j = 0; j < searchBtns.length; j++) {
            searchBtns[j].onclick = function() {
                triggerSearchPrompt();
            };
        }
    }

    // 3. Кнопка закрытия модалки настроек
    var closeSettingsBtn = document.getElementById("settings-close-btn");
    if (closeSettingsBtn) {
        closeSettingsBtn.onclick = function() {
            var modal = document.getElementById("settings-modal");
            if (modal) {
                modal.className = modal.className.replace(" active", "");
            }
        };
    }

    // 4. Кнопка "Назад" для мобильной версии/узких экранов iPad
    var backBtn = document.getElementById("btn-back");
    if (backBtn) {
        backBtn.onclick = function() {
            document.body.className = document.body.className.replace(" chat-opened", "");
        };
    }
}

// Функция вызова ретро-окна поиска, которая на 100% сработает везде
function triggerSearchPrompt() {
    var person = prompt("Введите имя пользователя для поиска или начала диалога:", "");
    if (person && person.trim() !== "") {
        startChatWithUser(person.trim());
    }
}

function startChatWithUser(username) {
    currentActiveChatPartner = username;
    currentRoom = [myUsername, username].sort().join("_");
    
    var placeholder = document.getElementById("no-chat-placeholder");
    if (placeholder) placeholder.style.display = "none";
    
    var chatArea = document.getElementById("chat-area");
    if (chatArea) {
        chatArea.style.display = "block";
        chatArea.style.display = "-webkit-box";
        chatArea.style.display = "-webkit-flex";
        chatArea.style.display = "flex";
    }
    
    var titleText = document.getElementById("chat-title-text");
    if (titleText) titleText.innerText = username;
    
    var messagesUl = document.getElementById("messages");
    if (messagesUl) messagesUl.innerHTML = "";
    
    if (socket) {
        socket.emit("join_room", { room: currentRoom });
    }
    
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
    messagesUl.scrollTop = messagesUl.scrollHeight;
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

function openMyProfile() {
    var modal = document.getElementById("settings-modal");
    if (modal) {
        if (modal.className.indexOf("active") === -1) {
            modal.className += " active";
        }
    } else {
        // Если модалки нет в HTML, просто даем сменить ник через prompt
        var newName = prompt("Ваш текущий ник: " + myUsername + "\nВведите новый ник:", myUsername);
        if (newName && newName.trim() !== "") {
            myUsername = newName.trim();
            localStorage.setItem('ichatter_username', myUsername);
            var profileNameBtn = document.getElementById("my-profile-name");
            if (profileNameBtn) profileNameBtn.innerText = myUsername;
            if (socket) socket.emit("user_join", { username: myUsername });
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
