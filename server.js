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

mongoose.connect(dbURI)
    .then(() => console.log("✅ MongoDB Bağlı"))
    .catch(err => console.log("❌ DB Hatası:", err));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true },
    name: String,
    investments: [{
        planDays: Number, 
        amount: Number, 
        totalProfit: Number,
        status: { type: String, default: 'Onay Bekliyor' },
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

// --- KULLANICI ROTalari ---

// Kullanıcı Verilerini Senkronize Et
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, name } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) { 
            user = new User({ telegramId, name, investments: [], withdrawals: [] }); 
            await user.save(); 
        }
        res.json(user);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Yeni Yatırım Bildirimi
app.post('/api/invest', async (req, res) => {
    try {
        const { telegramId, planDays, amount, profit } = req.body;
        let user = await User.findOne({ telegramId });
        if(user) {
            user.investments.push({ 
                planDays: Number(planDays), 
                amount: Number(amount), 
                totalProfit: Number(profit),
                status: 'Onay Bekliyor' 
            });
            await user.save();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Kullanıcı bulunamadı" });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Para Çekme Talebi
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

// Kesintili İptal (%2)
app.post('/api/cancel-invest', async (req, res) => {
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        const invest = user.investments.id(investId);
        if(invest && invest.status === 'Aktif') {
            invest.amount = invest.amount * 0.98; 
            invest.status = 'Iptal Edildi';
            await user.save();
            res.json({ success: true });
        } else {
            res.status(400).json({ error: "İptal edilemez" });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ADMIN ROTalari ---

// Tüm Verileri Getir (Kâr hesaplamalı)
app.post('/api/admin/all', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        const users = await User.find();
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Yatırımı Onayla
app.post('/api/admin/approve', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        const inv = user.investments.id(investId);
        if(inv) { 
            inv.status = 'Aktif'; 
            inv.createdAt = new Date(); // Süre onaylandığı an başlar
            await user.save(); 
            res.json({ success: true }); 
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Yatırımı Sil
app.post('/api/admin/delete-invest', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        if(user) { 
            user.investments.pull({ _id: investId }); 
            await user.save(); 
            res.json({ success: true }); 
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu Aktif - Port: ${PORT}`));