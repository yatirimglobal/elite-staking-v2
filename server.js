const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- YAPILANDIRMA ---
const BOT_TOKEN = 'TOKEN_BURAYA';
const ADMIN_ID = 'ID_BURAYA'; // Kendi Telegram ID'n
const ADMIN_PASSWORD = 'SIFRE_BURAYA'; // Admin paneli giriş şifren
const MONGO_URI = 'MONGO_URI_BURAYA';

// Bot ve Veritabanı Bağlantısı
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB bağlantısı başarılı."))
    .catch(err => console.error("MongoDB hatası:", err));

// --- VERİ MODELLERİ ---
const UserSchema = new mongoose.Schema({
    telegramId: String,
    investments: [{
        amount: Number,
        planDays: Number,
        dailyRate: Number,
        totalProfit: Number,
        status: { type: String, default: 'Onay Bekliyor' }, // 'Aktif', 'İptal Bekliyor', 'Tamamlandı'
        returnWallet: { type: String, default: '' }, // İptal sırasında girilen iade adresi
        createdAt: { type: Date, default: Date.now }
    }],
    withdrawals: [{
        amount: Number,
        wallet: String,
        status: { type: String, default: 'Beklemede' },
        date: { type: Date, default: Date.now }
    }]
});

const User = mongoose.model('User', UserSchema);

// --- KULLANICI API UÇ NOKTALARI ---

// Kullanıcı verilerini getir veya yeni kullanıcı oluştur
app.post('/api/user/data', async (req, res) => {
    try {
        const { telegramId } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = await User.create({ telegramId, investments: [], withdrawals: [] });
        }
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Yeni yatırım talebi oluştur
app.post('/api/invest/new', async (req, res) => {
    try {
        const { telegramId, amount, planDays } = req.body;
        const dailyRate = planDays === 10 ? 0.04 : 0.05;
        const totalProfit = amount * dailyRate * planDays;

        const user = await User.findOne({ telegramId });
        user.investments.push({ 
            amount: Number(amount), 
            planDays, 
            dailyRate, 
            totalProfit 
        });
        await user.save();

        bot.sendMessage(ADMIN_ID, `💰 *YENİ YATIRIM TALEBİ*\n\n👤 Kullanıcı: \`${telegramId}\` \n💵 Miktar: $${amount}\n📅 Plan: ${planDays} Gün`, { parse_mode: 'Markdown' });
        res.sendStatus(200);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// İptal ve İade Talebi Oluştur
app.post('/api/invest/cancel-request', async (req, res) => {
    try {
        const { telegramId, investId, returnWallet } = req.body;
        const user = await User.findOne({ telegramId });
        const inv = user.investments.id(investId);

        if (inv && inv.status === 'Aktif') {
            inv.status = 'İptal Bekliyor';
            inv.returnWallet = returnWallet;
            await user.save();

            bot.sendMessage(ADMIN_ID, `⚠️ *İPTAL TALEBİ ALINDI*\n\n👤 Kullanıcı: \`${telegramId}\` \n💵 Anapara: $${inv.amount}\n🏦 İade Adresi: \`${returnWallet}\` \n\n_Lütfen %2 kesinti yaparak iadeyi yapın ve panelden onaylayın._`, { parse_mode: 'Markdown' });
            res.sendStatus(200);
        } else {
            res.status(400).send("İptal edilecek uygun yatırım bulunamadı.");
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Para Çekme Talebi
app.post('/api/withdraw/new', async (req, res) => {
    try {
        const { telegramId, amount, wallet } = req.body;
        const user = await User.findOne({ telegramId });
        
        user.withdrawals.push({ amount, wallet });
        await user.save();

        bot.sendMessage(ADMIN_ID, `🏦 *PARA ÇEKME TALEBİ*\n\n👤 Kullanıcı: \`${telegramId}\` \n💵 Miktar: $${amount}\n💳 Cüzdan: \`${wallet}\``, { parse_mode: 'Markdown' });
        res.sendStatus(200);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ADMIN API UÇ NOKTALARI (Şifre Korumalı) ---

// Tüm kullanıcıları ve verileri listele
app.post('/api/admin/all', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.sendStatus(401);
    const users = await User.find();
    res.json(users);
});

// Yatırımı Onayla (Aktif Et)
app.post('/api/admin/approve', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.sendStatus(401);
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        const inv = user.investments.id(investId);
        inv.status = 'Aktif';
        inv.createdAt = new Date(); // Kâr sayacı onay anında başlar
        await user.save();
        res.sendStatus(200);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// Çekim Talebini Onayla (Ödendi İşaretle)
app.post('/api/admin/approve-withdraw', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.sendStatus(401);
    try {
        const { telegramId, withdrawId } = req.body;
        const user = await User.findOne({ telegramId });
        const w = user.withdrawals.id(withdrawId);
        w.status = 'Tamamlandı';
        await user.save();
        res.sendStatus(200);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// Yatırım Kaydını Sil (İade sonrası temizlik veya reddetme)
app.post('/api/admin/delete-invest', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.sendStatus(401);
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        user.investments.pull(investId);
        await user.save();
        res.sendStatus(200);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// Sunucuyu Başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});