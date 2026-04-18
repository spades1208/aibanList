/**
 * POST /api/predict
 */
export async function onRequestPost(context) {
    const { request, env } = context;
    const db = env.DB;
    try {
        const body = await request.json();
        const { map_name, ban_survivors } = body;
        if (!map_name) return new Response(JSON.stringify({ error: "Missing map_name" }), { status: 400 });

        const MAP_BASE_SCORES = {
            "里奧的回憶": { "隱士": 0.1, "歌劇演員": 0.1, "『使徒』": 0.05 },
            "永眠鎮": { "隱士": 0.1, "宿傘之魂": 0.08, "守夜人": 0.08 },
            "紅教堂": { "紅蝶": 0.1, "守夜人": 0.1, "漁女": 0.05 },
            "聖心醫院": { "時空之影": 0.1, "雕刻家": 0.1, "夢之女巫": 0.05 },
            "軍工廠": { "歌劇演員": 0.1, "漁女": 0.1, "廠長": 0.05 },
            "月亮河公園": { "『傑克』": 0.08, "蜘蛛": 0.08, "宿傘之魂": 0.05 },
            "湖景村": { "漁女": 0.12, "黃衣之主": 0.08, "『使徒』": 0.05 },
        };
        const BADGE_WEIGHTS = { "S": 5.0, "A": 3.0, "B": 1.5, "C": 1.0, "unknown": 1.0 };
        const MATCH_WEIGHTS = { 3: 1.0, 2: 0.6, 1: 0.3 };

        const { results } = await db.prepare(`
            SELECT r.* FROM match_records r
            LEFT JOIN users u ON r.added_by_uid = u.id
            WHERE r.map_name = ? AND (u.is_blacklisted IS NULL OR u.is_blacklisted = 0)
        `).bind(map_name).all();

        const counts = {};
        const base_data = MAP_BASE_SCORES[map_name] || {};
        for (const [h, score] of Object.entries(base_data)) {
            counts[h] = score;
        }

        let total_score = Object.values(counts).reduce((a, b) => a + b, 0);
        const inputBans = new Set(ban_survivors || []);

        results.forEach(record => {
            let recordBans = [];
            try { recordBans = JSON.parse(record.ban_survivors || "[]"); } 
            catch (e) { recordBans = (record.ban_survivors || "").split(",").map(b => b.trim()); }
            const recordBansSet = new Set(recordBans);
            const intersection = [...inputBans].filter(x => recordBansSet.has(x));
            const matchCount = intersection.length;
            
            // 計算匹配權重
            let weightTier = 0.01; // 極低基礎分 (完全沒匹配)
            if (inputBans.size > 0) {
                if (matchCount > 0) {
                    weightTier = MATCH_WEIGHTS[matchCount] || 0.1;
                }
            } else {
                weightTier = 1.0; // 若用戶沒選 Ban 位，則視為全量匹配
            }

            const hunter = record.hunter_name || "未知監管者";
            const badge = record.badge_level || "unknown";
            const badgeWeight = BADGE_WEIGHTS[badge] || 1.0;
            const contribution = weightTier * badgeWeight;
            
            counts[hunter] = (counts[hunter] || 0) + contribution;
            total_score += contribution;
        });

        if (total_score <= 0) return new Response(JSON.stringify({ predictions: [], total_score: 0, precision_label: "數據稀缺" }), { headers: { "Content-Type": "application/json" } });
        const sortedHunters = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const predictions = sortedHunters.map(([h, c]) => ({ 
            hunter_name: h, 
            score: Math.round(c * 10) / 10, 
            weight: Math.round(c * 10) / 10, // 回傳加權權重 N
            percentage: ((c / total_score) * 100).toFixed(1) + "%" 
        }));

        return new Response(JSON.stringify({ predictions, total_score: Math.round(total_score * 10) / 10, precision_label: "數據精準" }), { headers: { "Content-Type": "application/json" } });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
}
