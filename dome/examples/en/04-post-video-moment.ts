// Example: 04-post-video-moment.
import { argument, createClient } from '../client.js';
const client = await createClient();
const video = argument('video path or URL');
console.log(await client.moments.post({ video, isPrivate: true, priority: 'balanced',
    progressCallback: (percent, status) => console.log(`${percent}% ${status}`) }));

