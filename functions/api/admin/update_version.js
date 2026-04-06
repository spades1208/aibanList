/**
 * POST /api/admin/update_version
 */
export async function onRequestPost(context) {
    const { request, env } = context;
    const db = env.DB;
    try {
        const adminRes = await verifyAdmin(request, env);
        if (adminRes.error) return adminRes.response;

        const body = await request.json();
        const { new_version } = body;
        if (!new_version) return new Response(JSON.stringify({ error: "Missing version" }), { status: 400 });
        await db.prepare("UPDATE configs SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'current_version'").bind(new_version).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
}

async function verifyAdmin(request, env) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return { error: true, response: new Response("Auth required", { status: 401 }) };
    const payload = JSON.parse(atob(authHeader.split(" ")[1].split(".")[1].replace(/-/g, '+').replace(/_/g, '/')));
    const { results } = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(payload.uid || payload.sub).all();
    const role = (results && results.length > 0) ? results[0].role : "user";
    if (role.toLowerCase() !== "admin") return { error: true, response: new Response("Admin required", { status: 403 }) };
    return { error: false };
}
