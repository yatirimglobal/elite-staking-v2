const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));

const dbURI = "mongodb+srv://tgadmin:1Furkan2@cluster0.4bwu4ys.mongodb.net/cryptoInvest?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(dbURI)
  .then(() => console.log("✅ MongoDB Bağlantısı Başarılı"))
  .catch(err => console.log("❌ MongoDB Hatası:", err.message));

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

// KULLANICI SENKRONİZASYON
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, name } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, name: name || "Bilinmiyor", investments: [] });
            await user.save();
        }
        res.json(user);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// YATIRIM BİLDİRİMİ
app.post('/api/invest', async (req, res) => {
    try {
        const { telegramId, planDays, amount, profit } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) user = new User({ telegramId, name: "Yeni Kullanıcı", investments: [] });
        
        user.investments.push({ 
            planDays: Number(planDays), 
            amount: Number(amount), 
            totalProfit: Number(profit),
            status: 'Onay Bekliyor',
            createdAt: new Date()
        });
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// KESİNTİLİ İPTAL İŞLEMİ
app.post('/api/cancel-invest', async (req, res) => {
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        const invest = user.investments.id(investId);
        if(invest) {
            // %2 Komisyon Kesintisi Uygula
            const kesinti = invest.amount * 0.02;
            invest.amount = invest.amount - kesinti; 
            invest.status = 'Iptal Edildi';
            
            await user.save();
            res.json({ success: true, newAmount: invest.amount });
        } else {
            res.status(404).json({ success: false });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// ADMIN: TÜM VERİLER
app.get('/api/admin/all', async (req, res) => {
    const users = await User.find();
    res.json(users);
});

// ADMIN: ONAYLA
app.post('/api/admin/approve', async (req, res) => {
    const { telegramId, investId } = req.body;
    const user = await User.findOne({ telegramId });
    const invest = user.investments.id(investId);
    if(invest) {
        invest.status = 'Aktif';
        invest.createdAt = new Date();
        await user.save();
        res.json({ success: true });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu Aktif: ${PORT}`));