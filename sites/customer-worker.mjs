/** Customer static entry point. Unknown routes, including /admin, remain HTTP 404. */
const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      const response = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
      return withSecurityHeaders(response);
    }

    const response = await env.ASSETS.fetch(request);
    return withSecurityHeaders(response);
  },
};

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  secured.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  return secured;
}

export default worker;
