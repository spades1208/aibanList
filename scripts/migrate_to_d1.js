/**
 * migrate_to_d1.js - 資料遷移腳本 (本地執行)
 * 作用：將 Firestore 資料導出，透過 API 導入至 Cloudflare D1
 * 
 * 執行前：
 * 1. npm install firebase-admin axios
 * 2. 修改 TARGET_API_BASE
 */

const admin = require('firebase-admin');
const axios = require('axios');
const path = require('path');

// 1. 設定 Firebase Admin
// 指向您的 serviceAccountKey.json 位置
const serviceAccount = require('../backend/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 2. 設定 Cloudflare API 目標 (請修改為您的 Pages 網址)
const TARGET_API_BASE = 'http://localhost:5000'; // 建議部署後改為 https://xxx.pages.dev

async function migrate() {
  console.log("🚀 開始從 Firestore 讀取資料...");
  
  try {
    // 取得所有集合內容
    const [mapsSnap, survsSnap, huntsSnap, recordsSnap] = await Promise.all([
      db.collection('maps').get(),
      db.collection('survivors').get(),
      db.collection('hunters').get(),
      db.collection('match_records').get()
    ]);

    const data = {
      maps: mapsSnap.docs.map(d => d.data().name),
      survivors: survsSnap.docs.map(d => d.data().name || d.id),
      hunters: huntsSnap.docs.map(d => d.data().name || d.id),
      records: recordsSnap.docs.map(d => {
        const dd = d.data();
        let reported_at = null;
        if (dd.reported_at) {
          // Firestore Timestamp 轉 ISO String
          reported_at = typeof dd.reported_at.toDate === 'function' ? dd.reported_at.toDate().toISOString() : dd.reported_at;
        }
        return {
          map_name: dd.map_name,
          ban_survivors: dd.ban_survivors,
          hunter_name: dd.hunter_name,
          version: dd.version,
          badge_level: dd.badge_level,
          reported_at: reported_at,
          source: dd.source || 'migration_script'
        };
      })
    };

    console.log(`📊 準備完畢：${data.maps.length} 個地圖, ${data.survivors.length} 個求生者, ${data.hunters.length} 個監管者, ${data.records.length} 條戰績。`);
    console.log(`🔗 正在傳送至 API: ${TARGET_API_BASE}/api/admin/setup ...`);

    const response = await axios.post(`${TARGET_API_BASE}/api/admin/setup`, data);

    if (response.data.success) {
      console.log("✅ 遷移成功！");
      console.log(`已成功插入共 ${response.data.count} 筆 D1 操作項。`);
    } else {
      console.error("❌ 遷移失敗：", response.data);
    }

  } catch (error) {
    console.error("💥 遷移過程中發生錯誤：", error.response ? error.response.data : error.message);
  }
}

migrate();
