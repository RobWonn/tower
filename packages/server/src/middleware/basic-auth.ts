import type { FastifyRequest, FastifyReply } from 'fastify';

const BASIC_AUTH_USERNAME = process.env.AGENT_TOWER_AUTH_USER || 'luowang';
const BASIC_AUTH_PASSWORD = process.env.AGENT_TOWER_AUTH_PASS || 'Qq123456@';
const REALM = 'Agent Tower';

function parseBasicAuth(header: string): { username: string; password: string } | null {
  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
    const sep = decoded.indexOf(':');
    if (sep === -1) return null;
    return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

export function validateBasicAuth(username: string, password: string): boolean {
  return username === BASIC_AUTH_USERNAME && password === BASIC_AUTH_PASSWORD;
}

/**
 * Fastify onRequest hook: enforce HTTP Basic Auth on every request.
 */
export async function basicAuthHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = request.headers.authorization;
  if (auth) {
    const creds = parseBasicAuth(auth);
    if (creds && validateBasicAuth(creds.username, creds.password)) {
      return;
    }
  }

  reply
    .code(401)
    .header('WWW-Authenticate', `Basic realm="${REALM}"`)
    .send({ error: 'Unauthorized', message: 'Valid credentials required' });
}

/**
 * Socket.IO middleware: validate Basic Auth from handshake headers.
 */
export function basicAuthSocketMiddleware(
  socket: { request: { headers: Record<string, string | string[] | undefined> } },
  next: (err?: Error) => void,
) {
  const auth = socket.request.headers.authorization;
  if (typeof auth === 'string') {
    const creds = parseBasicAuth(auth);
    if (creds && validateBasicAuth(creds.username, creds.password)) {
      return next();
    }
  }
  next(new Error('Unauthorized: valid credentials required'));
}
