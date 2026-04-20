const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));

// --- GÜVENLİK AYARI ---
const ADMIN_PASSWORD = "1Fr.1806Rf21"; 

const dbURI = "mongodb+srv://tgadmin:1Furkan2@cluster0.4bwu4ys.mongodb.net/cryptoInvest?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(dbURI).then(() => console.log("✅ MongoDB Bağlı")).catch(err => console.log("❌ DB Hatası:", err));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true },
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

// KULLANICI YOLLARI
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, name } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) { user = new User({ telegramId, name: name || "Kullanıcı", investments: [] }); await user.save(); }
        res.json(user);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/invest', async (req, res) => {
    try {
        const { telegramId, planDays, amount, profit } = req.body;
        let user = await User.findOne({ telegramId });
        user.investments.push({ planDays: Number(planDays), amount: Number(amount), totalProfit: Number(profit), status: 'Onay Bekliyor', createdAt: new Date() });
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/cancel-invest', async (req, res) => {
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        const invest = user.investments.id(investId);
        if(invest) {
            invest.amount = invest.amount * 0.98; // %2 Komisyon kesintisi
            invest.status = 'Iptal Edildi';
            await user.save();
            res.json({ success: true });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- ŞİFRE KORUMALI ADMIN YOLLARI ---
app.post('/api/admin/all', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz Erişim" });
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/approve', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz Erişim" });
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        const invest = user.investments.id(investId);
        if(invest) {
            invest.status = 'Aktif';
            invest.createdAt = new Date(); // Geri sayımı onay anında başlatır
            await user.save();
            res.json({ success: true });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/admin/delete-invest', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz Erişim" });
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        if(user) { user.investments.pull({ _id: investId }); await user.save(); res.json({ success: true }); }
    } catch (e) { res.status(500).json({ success: false }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Güvenli Sunucu Aktif: ${PORT}`));