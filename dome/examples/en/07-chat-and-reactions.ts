// Example: 07-chat-and-reactions.
import { argument, createClient } from '../client.js';
const client = await createClient();
const otherUserId = argument('friend UID');
console.log(await client.chat.getMessages({ otherUserId }));
if (process.argv.includes('--listen')) {
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop);
    try { await client.chat.listenRealtime(otherUserId, message => console.log(message), { signal: controller.signal }); }
    finally { process.off('SIGINT', stop); }
}
// await client.chat.sendMessage(otherUserId, 'Hello!');

