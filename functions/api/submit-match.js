/**
 * POST /api/submit-match
 */
export async function onRequestPost(context) {
    const { request, env } = context;
    const db = env.DB;
    try {
        const body = await request.json();
        const { map_name, ban_survivors, hunter_name, badge_level } = body;
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) return new Response("Auth required", { status: 401 });
        
        const idToken = authHeader.split(" ")[1];
        const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const uid = payload.uid || payload.sub;
        const name = payload.name || "Unknown User";

        const configRes = await db.prepare("SELECT value FROM configs WHERE key = 'current_version' LIMIT 1").first();
        const current_version = configRes ? configRes.value : "Season 41";

        const survivorsStr = Array.isArray(ban_survivors) ? JSON.stringify(ban_survivors) : "[]";
        await db.prepare("INSERT INTO match_records (map_name, ban_survivors, hunter_name, version, badge_level, source, added_by_uid, added_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(map_name, survivorsStr, hunter_name, current_version, badge_level || "C", "feedback", uid, name).run();

        return new Response(JSON.stringify({ status: "success" }), { headers: { "Content-Type": "application/json" } });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
}
