// Example: 03-post-image-moment.
import { argument, createClient } from '../client.js';
const client = await createClient();
const image = argument('image path or URL');
console.log(await client.moments.post({ image, caption: 'Hello!', isPrivate: true }));

