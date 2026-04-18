/**
 * GET/DELETE /api/admin/records
 */
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);

    const adminRes = await verifyAdmin(request, env);
    if (adminRes.error) return adminRes.response;

    if (request.method === "GET") {
        try {
            const page = parseInt(url.searchParams.get("page")) || 1;
            const pageSize = parseInt(url.searchParams.get("page_size")) || 15;
            const mapName = url.searchParams.get("map_name");
            const hunterName = url.searchParams.get("hunter_name");

            let whereClauses = []; let params = [];
            if (mapName) { whereClauses.push("map_name = ?"); params.push(mapName); }
            if (hunterName) { whereClauses.push("hunter_name = ?"); params.push(hunterName); }
            const whereSql = whereClauses.length > 0 ? " WHERE " + whereClauses.join(" AND ") : "";

            const countRes = await db.prepare(`SELECT COUNT(*) as total FROM match_records ${whereSql}`).bind(...params).first();
            const total_count = countRes ? countRes.total : 0;

            const offset = (page - 1) * pageSize;
            const { results } = await db.prepare(`
                SELECT r.*, u.is_blacklisted 
                FROM match_records r
                LEFT JOIN users u ON r.added_by_uid = u.id
                ${whereSql} 
                ORDER BY r.id DESC 
                LIMIT ? OFFSET ?
            `).bind(...params, pageSize, offset).all();
            const records = (results || []).map(r => {
                try { r.ban_survivors = JSON.parse(r.ban_survivors || "[]"); } catch (e) { r.ban_survivors = []; }
                return r;
            });

            return new Response(JSON.stringify({ records, total_count, page, page_size: pageSize }), { headers: { "Content-Type": "application/json" } });
        } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
    }

    if (request.method === "DELETE") {
        try {
            // Support both /api/admin/records/ID and /api/admin/records?id=ID
            let recordId = url.searchParams.get("id");
            if (!recordId) {
                const pathParts = url.pathname.split('/');
                recordId = pathParts[pathParts.length - 1];
            }
            
            if (!recordId || recordId === "records") return new Response(JSON.stringify({ error: "Missing ID" }), { status: 400 });

            await db.prepare("DELETE FROM match_records WHERE id = ?").bind(recordId).run();
            return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
    }
    return new Response("Method not allowed", { status: 405 });
}

async function verifyAdmin(request, env) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return { error: true, response: new Response("Auth required", { status: 401 }) };
    
    try {
        const token = authHeader.split(" ")[1];
        const parts = token.split('.');
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const binString = atob(base64);
        const bytes = new Uint8Array(binString.length);
        for (let i = 0; i < binString.length; i++) { bytes[i] = binString.charCodeAt(i); }
        const payload = JSON.parse(new TextDecoder().decode(bytes));

        const { results } = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(payload.uid || payload.sub).all();
        const role = (results && results.length > 0) ? results[0].role : "user";
        if (role.toLowerCase() !== "admin") return { error: true, response: new Response("Admin required", { status: 403 }) };
        return { error: false };
    } catch (e) {
        return { error: true, response: new Response("Auth parse failed", { status: 401 }) };
    }
}
