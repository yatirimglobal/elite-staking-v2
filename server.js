const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));

// --- GÜVENLİK VE AYARLAR ---
const ADMIN_PASSWORD = "1Fr.1806Rf21"; 
const dbURI = "mongodb+srv://tgadmin:1Furkan2@cluster0.4bwu4ys.mongodb.net/cryptoInvest?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(dbURI).then(() => console.log("✅ MongoDB Bağlı")).catch(err => console.log("❌ DB Hatası:", err));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true },
    name: String,
    investments: [{
        planDays: Number, amount: Number, totalProfit: Number,
        status: { type: String, default: 'Onay Bekliyor' },
        createdAt: { type: Date, default: Date.now }
    }],
    withdrawals: [{ // Çekim talepleri için yeni alan
        amount: Number,
        wallet: String,
        status: { type: String, default: 'Beklemede' },
        date: { type: Date, default: Date.now }
    }]
});
const User = mongoose.model('User', UserSchema);

// KULLANICI SENKRONİZASYON
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, name } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) { user = new User({ telegramId, name, investments: [], withdrawals: [] }); await user.save(); }
        res.json(user);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// YATIRIM BİLDİRİMİ
app.post('/api/invest', async (req, res) => {
    const { telegramId, planDays, amount, profit } = req.body;
    let user = await User.findOne({ telegramId });
    user.investments.push({ planDays: Number(planDays), amount: Number(amount), totalProfit: Number(profit) });
    await user.save();
    res.json({ success: true });
});

// PARA ÇEKME TALEBİ OLUŞTURMA
app.post('/api/withdraw', async (req, res) => {
    try {
        const { telegramId, amount, wallet } = req.body;
        const user = await User.findOne({ telegramId });
        if(user) {
            user.withdrawals.push({ amount: Number(amount), wallet, status: 'Beklemede' });
            await user.save();
            res.json({ success: true });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// KESİNTİLİ İPTAL
app.post('/api/cancel-invest', async (req, res) => {
    const { telegramId, investId } = req.body;
    const user = await User.findOne({ telegramId });
    const invest = user.investments.id(investId);
    if(invest) {
        invest.amount = invest.amount * 0.98; // %2 Kesinti
        invest.status = 'Iptal Edildi';
        await user.save();
        res.json({ success: true });
    }
});

// --- ADMIN YOLLARI ---
app.post('/api/admin/all', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
    const users = await User.find();
    res.json(users);
});

app.post('/api/admin/approve', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
    const { telegramId, investId } = req.body;
    const user = await User.findOne({ telegramId });
    const inv = user.investments.id(investId);
    if(inv) { inv.status = 'Aktif'; inv.createdAt = new Date(); await user.save(); res.json({ success: true }); }
});

app.post('/api/admin/delete-invest', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
    const { telegramId, investId } = req.body;
    const user = await User.findOne({ telegramId });
    if(user) { user.investments.pull({ _id: investId }); await user.save(); res.json({ success: true }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu Aktif`));