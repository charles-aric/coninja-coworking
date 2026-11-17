// Sends www.coninjacoworking.com/* to https://coninjacoworking.com/* with a permanent redirect,
// keeping the path and query string.
// Deployed automatically by Cloudflare Workers Builds on every push to main.
export default {
  fetch(request) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.hostname = 'coninjacoworking.com';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  },
};
