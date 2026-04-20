const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// GÜVENLİK VE CORS AYARLARI
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));

// MONGODB BAĞLANTISI
const dbURI = "mongodb+srv://tgadmin:1Furkan2@cluster0.4bwu4ys.mongodb.net/cryptoInvest?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(dbURI)
  .then(() => console.log("✅ MongoDB Bağlantısı Başarılı"))
  .catch(err => console.log("❌ MongoDB Hatası:", err.message));

// VERİ MODELİ
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true },
    name: String,
    investments: [{
        planDays: Number,
        amount: Number,
        totalProfit: Number,
        status: { type: String, default: 'Onay Bekliyor' }, // 'Onay Bekliyor', 'Aktif', 'Iptal Edildi', 'Tamamlandı'
        createdAt: { type: Date, default: Date.now }
    }]
});

const User = mongoose.model('User', UserSchema);

// --- KULLANICI YOLLARI ---

// Kullanıcıyı veritabanına kaydeder veya bilgilerini getirir
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, name } = req.body;
        if(!telegramId) return res.status(400).json({error: "ID eksik"});
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, name: name || "Bilinmiyor", investments: [] });
            await user.save();
        }
        res.json(user);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Yeni yatırım bildirimini kaydeder
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
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Kullanıcının yatırımını iptal etmesi
app.post('/api/cancel-invest', async (req, res) => {
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false });

        const invest = user.investments.id(investId);
        if(invest) {
            invest.status = 'Iptal Edildi';
            await user.save();
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- ADMIN YOLLARI ---

// Tüm kullanıcıları ve yatırımları listeler (Admin Paneli için)
app.get('/api/admin/all', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Yatırımı onaylama (Geri sayımı başlatır)
app.post('/api/admin/approve', async (req, res) => {
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        const invest = user.investments.id(investId);
        if(invest) {
            invest.status = 'Aktif';
            invest.createdAt = new Date(); // Onay saati = Geri sayım başlangıcı
            await user.save();
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// Yatırımı silme (Admin Paneli için)
app.post('/api/admin/delete-invest', async (req, res) => {
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        if(user) {
            user.investments.pull({ _id: investId });
            await user.save();
            res.json({ success: true });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// TEST YOLU
app.get('/api/test', (req, res) => res.json({ status: "Sistem Aktif" }));

// SUNUCU BAŞLATMA
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu her yöne açık: ${PORT}`);
});