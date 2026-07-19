const appRoutes = new Set(["/", "/login", "/auth/callback", "/team"]);

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response = await env.ASSETS.fetch(request);

    if (
      response.status === 404 &&
      request.method === "GET" &&
      appRoutes.has(url.pathname) &&
      request.headers.get("accept")?.includes("text/html")
    ) {
      response = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }

    return withSecurityHeaders(response);
  },
};

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  secured.headers.set("Cache-Control", "no-store");
  secured.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  secured.headers.set("Referrer-Policy", "no-referrer");
  secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return secured;
}

export default worker;
