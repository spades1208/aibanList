export async function onRequest(context) {
    const response = await context.next();
    const origin = context.request.headers.get("Origin");
    
    // 允許來自 localhost:5500 或 網頁原生的請求
    if (origin && (origin.includes("localhost") || origin.includes("127.0.0.1") || origin.includes("aibanlist.pages.dev"))) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        response.headers.set("Access-Control-Max-Age", "86400");
    }

    // 處理瀏覽器的 OPTIONS 預檢請求
    if (context.request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": origin || "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Max-Age": "86400",
            }
        });
    }

    return response;
}
