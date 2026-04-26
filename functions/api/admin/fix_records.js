/**
 * POST /api/admin/fix_records
 * 將所有舊數據的版本標籤更新為當前最新版本
 */
export async function onRequestPost(context) {
    const { request, env } = context;
    const db = env.DB;
    
    try {
        // 1. 權限驗證
        const adminRes = await verifyAdmin(request, env);
        if (adminRes.error) return adminRes.response;

        // 2. 獲取當前版本配置
        const config = await db.prepare("SELECT value FROM configs WHERE key = 'current_version'").first();
        if (!config) {
            return new Response(JSON.stringify({ error: "Current version not configured" }), { status: 500 });
        }
        const currentVersion = config.value;

        // 3. 執行更新邏輯
        const result = await db.prepare("UPDATE match_records SET version = ? WHERE version != ?")
            .bind(currentVersion, currentVersion)
            .run();

        return new Response(JSON.stringify({ 
            success: true, 
            message: `數據修復完成，已更新 ${result.meta.rows_affected} 筆記錄至版本 ${currentVersion}`,
            updated_count: result.meta.rows_affected
        }), { 
            headers: { "Content-Type": "application/json" } 
        });
        
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

async function verifyAdmin(request, env) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return { error: true, response: new Response("Auth required", { status: 401 }) };
    }
    
    try {
        const token = authHeader.split(" ")[1];
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, '+').replace(/_/g, '/')));
        const uid = payload.uid || payload.sub;
        
        const user = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(uid).first();
        const role = user ? user.role : "user";
        
        if (role.toLowerCase() !== "admin") {
            return { error: true, response: new Response("Admin required", { status: 403 }) };
        }
        return { error: false };
    } catch (e) {
        return { error: true, response: new Response("Invalid token", { status: 401 }) };
    }
}
