/**
 * setup.js - 數據初始化接口 (內部使用)
 * 接收整包 JSON 並寫入 D1
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  try {
    const data = await request.json();
    const { maps, survivors, hunters, records } = data;

    const batches = [];

    // 1. 插入地圖
    if (maps && maps.length > 0) {
      maps.forEach(name => {
        batches.push(db.prepare("INSERT OR IGNORE INTO maps (name) VALUES (?)").bind(name));
      });
    }

    // 2. 插入角色
    if (survivors && survivors.length > 0) {
      survivors.forEach(name => {
        batches.push(db.prepare("INSERT OR IGNORE INTO survivors (name) VALUES (?)").bind(name));
      });
    }
    if (hunters && hunters.length > 0) {
      hunters.forEach(name => {
        batches.push(db.prepare("INSERT OR IGNORE INTO hunters (name) VALUES (?)").bind(name));
      });
    }

    // 3. 插入戰績 (每 50 筆一組 Batch 避免過載)
    if (records && records.length > 0) {
      records.forEach(r => {
        const bans = JSON.stringify(r.ban_survivors || []);
        batches.push(
          db.prepare("INSERT INTO match_records (map_name, ban_survivors, hunter_name, version, badge_level, reported_at, source) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(r.map_name, bans, r.hunter_name, r.version || "Season 41", r.badge_level || "C", r.reported_at || new Date().toISOString(), r.source || "migration")
        );
      });
    }

    // 分批執行 (Cloudflare D1 batch 有上限)
    const chunkSize = 50;
    for (let i = 0; i < batches.length; i += chunkSize) {
      await db.batch(batches.slice(i, i + chunkSize));
    }

    return new Response(JSON.stringify({ success: true, count: batches.length }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
