# 💬 iChatter

**iChatter** is a stylish web messenger designed with the classic retro aesthetics of iOS 6, optimized for modern desktops, smartphones, and vintage legacy devices (iOS 6+, iPad, legacy Safari browsers).

---

## 🚀 Key Features

* 🔐 **Secure Authentication & Registration**:
  * Sign up and sign in using one-time 6-digit email verification codes.
  * Built-in password recovery/reset mechanism.
* 🛡 **Strong Cryptographic Data Protection**:
  * Passwords stored using salted **SHA-256** cryptographic hashes.
  * User emails and contact lists encrypted using **AES-256-CBC** symmetric encryption.
  * Server logs do not expose user emails (only nickname and code are printed).
  * Automatic database migration on launch with zero data loss.
* 💬 **Real-Time Messaging**:
  * Instant message delivery powered by **Socket.IO**.
  * Direct one-on-one dialogues and group chats.
  * Message read receipts, online indicators, and typing status.
* 🎙 **Media & Multimedia**:
  * Send photos, voice messages, and circular video notes.
  * Custom avatars and chat background wallpaper uploads.
* 📱 **Responsive Interface**:
  * Seamlessly adapts to iPhone, iPad, and desktop viewports.

---

## 🛠 System Requirements

* **Node.js** v14.x or higher
* **npm** (Node Package Manager)
* A Gmail account for sending verification emails (with an "App Password" generated)

---

## ⚙️ Installation & Setup

### 1. Clone the repository and install dependencies

```bash
git clone https://github.com/your-username/iChatter.git
cd iChatter
npm install
```

### 2. Configure Environment Variables (`.env`)

Create a `.env` file in the root directory and configure your mail credentials:

```env
# Server port
PORT=8080

# Gmail address for sending verification codes
EMAIL_USER=1r1krol4k2@gmail.com

# 16-character Gmail App Password
EMAIL_PASS=your_gmail_app_password
```

> **How to generate a Gmail App Password:**
> 1. Go to your [Google Account Security](https://myaccount.google.com/security) settings.
> 2. Enable **2-Step Verification** (if not already enabled).
> 3. Search for **App passwords**.
> 4. Create a new app password and copy the 16-letter code into `EMAIL_PASS`.

### 3. Start the Server

```bash
node server.js
```

The server will be available at `http://localhost:8080` (or `http://YOUR-SERVER-IP:8080`).

---

## 📖 How to Use iChatter

### 1. Register a New Account
1. Open `login.html` in your browser.
2. Switch to the **Register** tab.
3. Enter your **Email**, desired **Username**, and **Password**.
4. Click **Register**.
5. Enter the 6-digit code sent to your email (and shown in the server console) and click **Confirm** to enter the chat.

### 2. Log in
1. On the **Login** tab, enter your **Email** and **Password**.
2. Click **Login** and enter the verification code sent to your email.

### 3. Reset Password
1. If you forgot your password, switch to the **Reset** tab.
2. Enter your **Email** and click **Request Code**.
3. Enter the 6-digit reset code and your **New Password**.
4. Click **Save Password** — your password will be updated and hashed securely.

### 4. Finding Users and Adding Contacts
* Every user receives a unique **6-digit Search ID**.
* Enter the user's 6-digit ID in the search bar within `chat.html` to find them and start a conversation.

---

## 📁 Project Structure

```text
├── server.js          # Core backend (Express, Socket.IO, AES/SHA encryption)
├── login.html         # Login, registration, and password reset view
├── chat.html          # Main chat interface layout
├── script.js          # Client-side messaging and media logic
├── database.json      # Encrypted users, messages, and contacts store
├── tokens.json        # Active session tokens
├── .env               # Environment configuration and secrets
├── LICENSE            # Project license terms
└── README.md          # Project documentation
```

---

## 📜 License

This project is licensed under **All Rights Reserved (No Derivatives)**.
You may freely share and distribute the original source code with proper attribution. Unauthorized modifications, derivative works, and commercial use are strictly prohibited. See the [`LICENSE`](./LICENSE) file for details.
