// Ví dụ: 05-feed-views-reactions.
import { createClient } from '../client.js';
const client = await createClient();
const feed = await client.moments.getLatest();
console.log(feed);
const momentUid = process.argv[2];
if (momentUid) console.log(await client.moments.getViews(momentUid));
// await client.moments.react('MOMENT_UID', '❤️');
// await client.moments.markAsViewed('MOMENT_UID');

