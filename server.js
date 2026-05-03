const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- ÖNEMLİ DEĞİŞİKLİK: STATİK DOSYALARI ANA DİZİNDEN OKU ---
app.use(express.static(__dirname)); 

// --- YAPILANDIRILMIŞ AYARLAR ---
const BOT_TOKEN = '8612171484:AAG-k7i3gwsmDoemUZ2c_T57C47l03JOeyU';
const ADMIN_ID = '1694656329'; 
const ADMIN_PASSWORD = '1Fr.1806Rf21'; 
const MONGO_URI = 'mongodb+srv://tgadmin:1Furkan2@cluster0.4bwu4ys.mongodb.net/?appName=Cluster0';

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
        status: { type: String, default: 'Onay Bekliyor' }, 
        returnWallet: { type: String, default: '' }, 
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

// --- API UÇ NOKTALARI ---

// Ana sayfa isteği geldiğinde index.html'i gönder
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Admin sayfası isteği
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.post('/api/user/data', async (req, res) => {
    try {
        const { telegramId } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = await User.create({ telegramId, investments: [], withdrawals: [] });
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invest/new', async (req, res) => {
    try {
        const { telegramId, amount, planDays } = req.body;
        const dailyRate = planDays === 10 ? 0.04 : 0.05;
        const totalProfit = amount * dailyRate * planDays;

        const user = await User.findOne({ telegramId });
        user.investments.push({ amount: Number(amount), planDays, dailyRate, totalProfit });
        await user.save();

        bot.sendMessage(ADMIN_ID, `💰 *YENİ YATIRIM TALEBİ*\n\n👤 Kullanıcı: \`${telegramId}\` \n💵 Miktar: $${amount}\n📅 Plan: ${planDays} Gün`, { parse_mode: 'Markdown' });
        res.sendStatus(200);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invest/cancel-request', async (req, res) => {
    try {
        const { telegramId, investId, returnWallet } = req.body;
        const user = await User.findOne({ telegramId });
        const inv = user.investments.id(investId);

        if (inv && inv.status === 'Aktif') {
            inv.status = 'İptal Bekliyor';
            inv.returnWallet = returnWallet;
            await user.save();

            bot.sendMessage(ADMIN_ID, `⚠️ *İPTAL TALEBİ*\n\n👤 Kullanıcı: \`${telegramId}\` \n💵 Anapara: $${inv.amount}\n🏦 İade Adresi: \`${returnWallet}\``, { parse_mode: 'Markdown' });
            res.sendStatus(200);
        } else { res.status(400).send("Hata."); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/all', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.sendStatus(401);
    const users = await User.find();
    res.json(users);
});

app.post('/api/admin/approve', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.sendStatus(401);
    const { telegramId, investId } = req.body;
    const user = await User.findOne({ telegramId });
    const inv = user.investments.id(investId);
    inv.status = 'Aktif';
    inv.createdAt = new Date();
    await user.save();
    res.sendStatus(200);
});

app.post('/api/admin/delete-invest', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.sendStatus(401);
    const { telegramId, investId } = req.body;
    const user = await User.findOne({ telegramId });
    user.investments.pull(investId);
    await user.save();
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif.`));
