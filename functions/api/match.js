/**
 * match.js - 戰績管理 API
 * GET: 取得分頁戰績 (後台用)
 * POST: 提交新戰績
 * DELETE: 刪除特定戰績
 */

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);

  // --- GET: 取得戰績清單 (分頁與過濾) ---
  if (request.method === "GET") {
    try {
      const mapName = url.searchParams.get("map") || "";
      const hunterName = url.searchParams.get("hunter") || "";
      const limit = parseInt(url.searchParams.get("limit")) || 15;
      const offset = parseInt(url.searchParams.get("offset")) || 0;

      let queryStr = "SELECT * FROM match_records";
      const params = [];
      const conditions = [];

      if (mapName) {
        conditions.push("map_name = ?");
        params.push(mapName);
      }
      if (hunterName) {
        conditions.push("hunter_name = ?");
        params.push(hunterName);
      }

      if (conditions.length > 0) {
        queryStr += " WHERE " + conditions.join(" AND ");
      }

      queryStr += " ORDER BY reported_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const records = await db.prepare(queryStr).bind(...params).all();
      
      return new Response(JSON.stringify({
        records: records.results || [],
        hasMore: (records.results || []).length === limit
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  // --- POST: 提交新戰績 (前端使用者或管理員) ---
  if (request.method === "POST") {
    try {
      const body = await request.json();
      const { map_name, ban_survivors, hunter_name, version, badge_level, source } = body;

      if (!map_name || !hunter_name) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
      }

      // 將陣列轉為 JSON 字串存儲
      const survivorsStr = Array.isArray(ban_survivors) ? JSON.stringify(ban_survivors) : "[]";

      await db.prepare(
        "INSERT INTO match_records (map_name, ban_survivors, hunter_name, version, badge_level, source) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(
        map_name, 
        survivorsStr, 
        hunter_name, 
        version || "Season 41", 
        badge_level || "C", 
        source || "api_frontend"
      ).run();

      return new Response(JSON.stringify({ success: true }), { 
        status: 201, 
        headers: { "Content-Type": "application/json" } 
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  // --- DELETE: 刪除戰績 (僅限管理員) ---
  if (request.method === "DELETE") {
    try {
      const recordId = url.searchParams.get("id");
      if (!recordId) return new Response("Missing id", { status: 400 });

      // TODO: 在此處加入身份驗證邏輯 (Firebase Token Verification)
      
      await db.prepare("DELETE FROM match_records WHERE id = ?").bind(recordId).run();
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}
