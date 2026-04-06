/**
 * GET/PATCH /api/admin/users
 */
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);

    const adminRes = await verifyAdmin(request, env);
    if (adminRes.error) return adminRes.response;

    if (request.method === "GET") {
        try {
            const { results } = await db.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
            return new Response(JSON.stringify(results || []), { headers: { "Content-Type": "application/json" } });
        } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
    }

    if (request.method === "PATCH") {
        try {
            const uid = url.searchParams.get("uid");
            const role = url.searchParams.get("role");
            if (!uid || !role) return new Response(JSON.stringify({ error: "Missing uid or role" }), { status: 400 });
            await db.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, uid).run();
            return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
    }
    return new Response("Method not allowed", { status: 405 });
}

async function verifyAdmin(request, env) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return { error: true, response: new Response("Auth required", { status: 401 }) };
    const payload = JSON.parse(atob(authHeader.split(" ")[1].split(".")[1].replace(/-/g, '+').replace(/_/g, '/')));
    const { results } = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(payload.uid || payload.sub).all();
    const role = (results && results.length > 0) ? results[0].role : "user";
    if (role.toLowerCase() !== "admin") return { error: true, response: new Response("Admin access required", { status: 403 }) };
    return { error: false };
}
