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
            "里奧的回憶": { "隱士": 10.0, "歌劇演員": 10.0, "『使徒』": 5.0 },
            "永眠鎮": { "隱士": 10.0, "宿傘之魂": 8.0, "守夜人": 8.0 },
            "紅教堂": { "紅蝶": 10.0, "守夜人": 10.0, "漁女": 5.0 },
            "聖心醫院": { "時空之影": 10.0, "雕刻家": 10.0, "夢之女巫": 5.0 },
            "軍工廠": { "歌劇演員": 10.0, "漁女": 10.0, "廠長": 5.0 },
            "月亮河公園": { "『傑克』": 8.0, "蜘蛛": 8.0, "宿傘之魂": 5.0 },
            "湖景村": { "漁女": 12.0, "黃衣之主": 8.0, "『使徒』": 5.0 },
        };
        const BADGE_WEIGHTS = { "S": 5.0, "A": 3.0, "B": 1.5, "C": 1.0, "unknown": 1.0 };
        const MATCH_WEIGHTS = { 3: 1.0, 2: 0.6, 1: 0.3 };

        const { results } = await db.prepare("SELECT * FROM match_records WHERE map_name = ?").bind(map_name).all();
        const counts = {};
        const base_data = MAP_BASE_SCORES[map_name] || {};
        for (const [h, score] of Object.entries(base_data)) counts[h] = score;

        let total_score = Object.values(counts).reduce((a, b) => a + b, 0);
        const inputBans = new Set(ban_survivors || []);
        let maxMatchesFound = 0;

        results.forEach(record => {
            let recordBans = [];
            try { recordBans = JSON.parse(record.ban_survivors || "[]"); } 
            catch (e) { recordBans = (record.ban_survivors || "").split(",").map(b => b.trim()); }
            const recordBansSet = new Set(recordBans);
            const intersection = [...inputBans].filter(x => recordBansSet.has(x));
            const matchCount = intersection.length;
            if (matchCount > 0 || inputBans.size === 0) {
                const weightTier = inputBans.size > 0 ? (MATCH_WEIGHTS[matchCount] || 0.1) : 1.0;
                if (matchCount > maxMatchesFound) maxMatchesFound = matchCount;
                const hunter = record.hunter_name || "未知監管者";
                const badge = record.badge_level || "unknown";
                const badgeWeight = BADGE_WEIGHTS[badge] || 1.0;
                const contribution = weightTier * badgeWeight;
                counts[hunter] = (counts[hunter] || 0) + contribution;
                total_score += contribution;
            }
        });

        if (total_score <= 0) return new Response(JSON.stringify({ predictions: [], total_score: 0, precision_label: "數據稀缺" }), { headers: { "Content-Type": "application/json" } });
        const sortedHunters = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const predictions = sortedHunters.map(([h, c]) => ({ hunter_name: h, score: Math.round(c * 10) / 10, percentage: ((c / total_score) * 100).toFixed(1) + "%" }));

        return new Response(JSON.stringify({ predictions, total_score: Math.round(total_score * 10) / 10, precision_label: "數據精準" }), { headers: { "Content-Type": "application/json" } });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
}
