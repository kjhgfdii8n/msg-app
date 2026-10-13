// Holt Seiten von MSG (und Instagram) für die Web-App, weil Browser das nicht direkt dürfen.
const ALLOWED = ['erstehilfe-fellbach.de', 'www.erstehilfe-ludwigsburg.de', 'erstehilfe-ludwigsburg.de', 'www.erstehilfe-fellbach.de', 'www.instagram.com'];

exports.handler = async (event) => {
  const u = event.queryStringParameters && event.queryStringParameters.u;
  let url;
  try { url = new URL(u); } catch (e) { return { statusCode: 400, body: 'bad url' }; }
  if (url.protocol !== 'https:' || !ALLOWED.includes(url.hostname)) return { statusCode: 403, body: 'not allowed' };
  try {
    const r = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9',
      },
    });
    const body = await r.text();
    return {
      statusCode: r.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120' },
      body,
    };
  } catch (e) {
    return { statusCode: 502, body: 'fetch failed' };
  }
};
