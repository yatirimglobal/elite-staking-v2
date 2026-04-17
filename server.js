const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// --- AYARLAR ---
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // HTML dosyalarına erişim sağlar

// --- VERİTABANI BAĞLANTISI ---
// Not: IP iznini (0.0.0.0/0) MongoDB Atlas'tan verdiğinden emin ol!
const dbURI = "mongodb+srv://tgadmin:1Furkan2@cluster0.4bwu4ys.mongodb.net/cryptoInvest?retryWrites=true&w=majority";

mongoose.connect(dbURI)
  .then(() => console.log("✅ MongoDB Bağlantısı Başarılı"))
  .catch(err => console.log("❌ MongoDB Hatası:", err.message));

// --- VERİ MODELİ ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    name: String,
    investments: [{
        planDays: Number,
        amount: Number,
        totalProfit: Number,
        status: { 
            type: String, 
            default: 'Onay Bekliyor', 
            enum: ['Onay Bekliyor', 'Aktif', 'Çekim Talebi', 'İptal Talebi', 'Tamamlandı'] 
        },
        userWallet: String,
        createdAt: { type: Date, default: Date.now },
        approvedAt: Date
    }]
});

const User = mongoose.model('User', UserSchema);

// --- API YOLLARI (ROUTES) ---

// 1. Kullanıcı Girişi / Kaydı
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, name } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, name, investments: [] });
            await user.save();
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Yeni Yatırım Bildirimi (Miktar Dahil)
app.post('/api/invest', async (req, res) => {
    try {
        const { telegramId, planDays, amount, profit } = req.body;
        const user = await User.findOne({ telegramId });
        if (user) {
            user.investments.push({ 
                planDays: Number(planDays), 
                amount: Number(amount), 
                totalProfit: Number(profit), 
                status: 'Onay Bekliyor' 
            });
            await user.save();
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Para Çekme veya İptal Talebi
app.post('/api/request-payout', async (req, res) => {
    try {
        const { telegramId, invId, address, type } = req.body;
        const user = await User.findOne({ telegramId });
        if (user) {
            const inv = user.investments.id(invId);
            if (inv) {
                inv.status = (type === 'cancel') ? 'İptal Talebi' : 'Çekim Talebi';
                inv.userWallet = address;
                await user.save();
                res.json({ success: true });
            }
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Admin: Tüm Verileri Getir
app.get('/api/admin/all', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Admin: Yatırımı Onayla (Kazanç Sayacı Başlar)
app.post('/api/admin/approve', async (req, res) => {
    try {
        const { telegramId, investmentId } = req.body;
        const user = await User.findOne({ telegramId });
        if (user) {
            const inv = user.investments.id(investmentId);
            if (inv) {
                inv.status = 'Aktif';
                inv.approvedAt = new Date();
                await user.save();
                res.json({ success: true });
            }
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Admin: Ödemeyi Tamamla ve Kapat
app.post('/api/admin/finalize', async (req, res) => {
    try {
        const { telegramId, investmentId } = req.body;
        const user = await User.findOne({ telegramId });
        if (user) {
            const inv = user.investments.id(investmentId);
            if (inv) {
                inv.status = 'Tamamlandı';
                await user.save();
                res.json({ success: true });
            }
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SUNUCU BAŞLATMA ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda aktif.`);
});
