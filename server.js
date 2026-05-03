const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// --- VERİTABANI BAĞLANTISI ---
// MongoDB URL'ni buraya eklemeyi unutma
const MONGO_URI = process.env.MONGO_URI || "MONGODB_URL_BURAYA";
mongoose.connect(MONGO_URI).then(() => console.log("MongoDB Bağlandı")).catch(err => console.log(err));

// --- MODELLER ---
const UserSchema = new mongoose.Schema({
    telegramId: String,
    name: String,
    investments: [{
        planDays: Number,
        amount: Number,
        totalProfit: Number,
        status: { type: String, default: 'Onay Bekliyor' },
        createdAt: { type: Date, default: Date.now }
    }]
});
const User = mongoose.model('User', UserSchema);

// --- TELEGRAM AYARLARI ---
const BOT_TOKEN = process.env.BOT_TOKEN || "BOT_TOKEN_BURAYA";
const ADMIN_ID = process.env.ADMIN_ID || "SENIN_TELEGRAM_IDN";

async function notifyAdmin(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (e) { console.error("Telegram Bildirim Hatası:", e); }
}

// --- API ROTLARI ---

// Kullanıcı Senkronizasyonu
app.post('/api/sync', async (req, res) => {
    const { telegramId, name } = req.body;
    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, name, investments: [] });
        await user.save();
    }
    res.json(user);
});

// Yeni Yatırım Talebi
app.post('/api/invest', async (req, res) => {
    const { telegramId, planDays, amount, profit } = req.body;
    const user = await User.findOne({ telegramId });
    if (user) {
        const newInv = { planDays, amount, totalProfit: profit, status: 'Onay Bekliyor' };
        user.investments.push(newInv);
        await user.save();
        
        notifyAdmin(`🔔 <b>YENİ YATIRIM TALEBİ</b>\n\n👤 Kullanıcı: ${user.name}\n💰 Tutar: $${amount}\n🗓 Vade: ${planDays} Gün\n\nLütfen admin panelinden onaylayın.`);
        res.json({ success: true });
    }
});

// --- GÜNCELLENEN İPTAL ROTASI ---
app.post('/api/cancel-invest', async (req, res) => {
    try {
        const { telegramId, investId, refundWallet } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

        const inv = user.investments.id(investId);

        if (inv) {
            const refundAmount = inv.amount * 0.98; // %2 Kesinti
            const kesinti = inv.amount * 0.02;

            const logMsg = `
⚠️ <b>YATIRIM İPTAL TALEBİ</b>

👤 <b>Kullanıcı:</b> ${user.name} (<code>${telegramId}</code>)
💰 <b>İade Tutarı:</b> $${refundAmount.toFixed(2)}
📉 <b>Kesinti (%2):</b> $${kesinti.toFixed(2)}
🏦 <b>İade Cüzdanı (TRC20):</b> 
<code>${refundWallet}</code>

<i>Not: Yatırım sistemden silindi. Lütfen manuel olarak cüzdana transfer yapın.</i>`;

            // Yatırımı diziden kaldır
            user.investments.pull({ _id: investId });
            await user.save();

            // Admin'e (Sana) detaylı bildirim gönder
            await notifyAdmin(logMsg);

            res.json({ success: true, message: "İptal başarılı" });
        } else {
            res.status(404).json({ error: "Yatırım bulunamadı" });
        }
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: "Sunucu hatası" }); 
    }
});

// Para Çekme Talebi
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount, wallet } = req.body;
    const user = await User.findOne({ telegramId });
    
    notifyAdmin(`💰 <b>PARA ÇEKME TALEBİ</b>\n\n👤 Kullanıcı: ${user ? user.name : telegramId}\n💵 Tutar: $${amount}\n🏦 Cüzdan: <code>${wallet}</code>`);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT} portunda çalışıyor`));