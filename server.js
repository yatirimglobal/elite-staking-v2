const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- YAPILANDIRMA (TÜM BİLGİLERİN EKLENDİ) ---
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://tgadmin:1Furkan2@cluster0.4bwu4ys.mongodb.net/?appName=Cluster0";
const BOT_TOKEN = process.env.BOT_TOKEN || "8612171484:AAG-k7i3gwsmDoemUZ2c_T57C47l03JOeyU";
const ADMIN_ID = process.env.ADMIN_ID || "1694656329";

// --- VERİTABANI BAĞLANTISI ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Bağlantısı Başarılı"))
    .catch(err => console.error("❌ MongoDB Bağlantı Hatası:", err));

// --- VERİ MODELLERİ ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
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

// --- TELEGRAM BİLDİRİM FONKSİYONU ---
async function notifyAdmin(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (e) { console.error("Telegram Bildirim Hatası"); }
}

// --- KULLANICI İŞLEMLERİ ---

// Kullanıcı Kaydı ve Senkronizasyon
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, name } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, name, investments: [] });
            await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).send(e.message); }
});

// Yeni Yatırım Başlatma
app.post('/api/invest', async (req, res) => {
    try {
        const { telegramId, planDays, amount, profit } = req.body;
        const user = await User.findOne({ telegramId });
        const newInv = { planDays, amount, totalProfit: profit, status: 'Onay Bekliyor' };
        user.investments.push(newInv);
        await user.save();
        
        notifyAdmin(`🔔 <b>YENİ YATIRIM TALEBİ</b>\n\n👤: ${user.name}\n💰: $${amount}\n🗓: ${planDays} Gün`);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// Yatırım İptal Etme (Cüzdan Adresiyle Birlikte)
app.post('/api/cancel-invest', async (req, res) => {
    try {
        const { telegramId, investId, refundWallet } = req.body;
        const user = await User.findOne({ telegramId });
        const inv = user.investments.id(investId);

        if (inv) {
            const refundAmount = inv.amount * 0.98; // %2 Kesinti
            const logMsg = `⚠️ <b>YATIRIM İPTAL EDİLDİ</b>\n\n👤: ${user.name}\n💰 İade: $${refundAmount.toFixed(2)}\n🏦 Cüzdan: <code>${refundWallet}</code>\n\nLütfen manuel iade yapın.`;
            
            user.investments.pull({ _id: investId });
            await user.save();
            await notifyAdmin(logMsg);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Yatırım bulunamadı" });
        }
    } catch (e) { res.status(500).send(e.message); }
});

// Para Çekme Talebi
app.post('/api/withdraw', async (req, res) => {
    try {
        const { telegramId, amount, wallet } = req.body;
        const user = await User.findOne({ telegramId });
        notifyAdmin(`💰 <b>PARA ÇEKME TALEBİ</b>\n\n👤: ${user.name}\n💵: $${amount}\n🏦: <code>${wallet}</code>`);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// --- ADMIN İŞLEMLERİ ---

// Yatırımı Onayla
app.post('/api/admin/approve', async (req, res) => {
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        const inv = user.investments.id(investId);
        if (inv) {
            inv.status = 'Aktif';
            inv.createdAt = new Date();
            await user.save();
            res.json({ success: true });
        }
    } catch (e) { res.status(500).send(e.message); }
});

// --- BAŞLATMA ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT} portunda başarıyla çalışıyor!`);
});