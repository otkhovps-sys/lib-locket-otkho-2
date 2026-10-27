// Example: 02-user-profile.
import { createClient } from '../client.js';
const client = await createClient();
console.log(await client.user.getProfile());
// await client.user.updateName('First', 'Last');
// await client.user.updateBirthdate('2000-01-01');
// await client.user.updateAvatar('avatar.jpg');
// await client.user.syncClientData({ pushNotifications: true });

