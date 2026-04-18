export async function onRequestPatch(context) {
    const { request, env, params } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const uid = params.uid;
    const is_blacklisted = url.searchParams.get("is_blacklisted") === "true" ? 1 : 0;

    // 1. 驗證管理員權限
    const adminRes = await verifyAdmin(request, env);
    if (adminRes.error) return adminRes.response;

    if (!uid) return new Response(JSON.stringify({ error: "Missing UID" }), { status: 400 });

    try {
        await db.prepare("UPDATE users SET is_blacklisted = ? WHERE id = ?")
            .bind(is_blacklisted, uid)
            .run();
        return new Response(JSON.stringify({ success: true, is_blacklisted }), { 
            headers: { "Content-Type": "application/json" } 
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

async function verifyAdmin(request, env) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return { error: true, response: new Response("Auth required", { status: 401 }) };
    
    try {
        const token = authHeader.split(" ")[1];
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const { results } = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(payload.uid || payload.sub).all();
        const role = (results && results.length > 0) ? results[0].role : "user";
        if (role.toLowerCase() !== "admin") return { error: true, response: new Response("Admin required", { status: 403 }) };
        return { error: false };
    } catch (e) {
        return { error: true, response: new Response("Auth parse failed", { status: 401 }) };
    }
}
