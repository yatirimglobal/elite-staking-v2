const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Arayüz dosyalarını (HTML, CSS, JS) 'public' klasöründen sunar
app.use(express.static('public'));

// --- YAPILANDIRMA ---
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://tgadmin:1Furkan2@cluster0.4bwu4ys.mongodb.net/?appName=Cluster0";
const BOT_TOKEN = process.env.BOT_TOKEN || "8612171484:AAG-k7i3gwsmDoemUZ2c_T57C47l03JOeyU";
const ADMIN_ID = process.env.ADMIN_ID || "1694656329";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Bağlantısı Başarılı"))
    .catch(err => console.error("❌ MongoDB Bağlantı Hatası:", err));

const User = mongoose.model('User', new mongoose.Schema({
    telegramId: String,
    name: String,
    investments: [{
        planDays: Number,
        amount: Number,
        status: { type: String, default: 'Onay Bekliyor' },
        createdAt: { type: Date, default: Date.now }
    }]
}));

async function notifyAdmin(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_ID, text: text, parse_mode: 'HTML'
        });
    } catch (e) { console.error("Admin Bildirim Hatası"); }
}

// API: Yeni Yatırım
app.post('/api/invest', async (req, res) => {
    try {
        const { telegramId, name, planDays, amount } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) user = new User({ telegramId, name, investments: [] });
        
        user.investments.push({ planDays, amount });
        await user.save();
        
        await notifyAdmin(`🔔 <b>YENİ YATIRIM</b>\n👤: ${name}\n💰: $${amount}\n🗓: ${planDays} Gün`);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Sistem ${PORT} portunda yayında!`));
