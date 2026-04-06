/**
 * POST /api/auth/verify
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;
  try {
    const body = await request.json();
    const idToken = body.id_token;
    if (!idToken) return new Response(JSON.stringify({ error: "Missing id_token" }), { status: 400 });

    const payload = await verifyFirebaseToken(idToken, "aibanlist");
    if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });

    const uid = payload.uid || payload.sub;
    const email = payload.email || "";
    const name = payload.name || "";
    const picture = payload.picture || "";

    await db.prepare("INSERT INTO users (id, email, display_name, photo_url) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name, photo_url=excluded.photo_url").bind(uid, email, name, picture).run();

    const { results } = await db.prepare("SELECT role FROM users WHERE id = ?").bind(uid).all();
    let role = (results && results.length > 0) ? results[0].role : "user";
    if (email.toLowerCase() === "waviskimo@gmail.com") {
      role = "admin";
      await db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(uid).run();
    }

    return new Response(JSON.stringify({ uid, email, display_name: name, photo_url: picture, role }), { headers: { "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
}

async function verifyFirebaseToken(token, projectId) {
  try {
    const parts = token.split('.');
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const binString = atob(base64);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
    }
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (payload.aud !== projectId) return null;
    return payload;
  } catch (e) { return null; }
}
