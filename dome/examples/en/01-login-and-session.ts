// Example: 01-login-and-session.
import { createClient } from '../client.js';
const client = await createClient();
console.log({ uid: client.session.uid, authenticated: client.isAuthenticated() });
await client.session.getValidToken();
console.log(client.device.toJSON());

