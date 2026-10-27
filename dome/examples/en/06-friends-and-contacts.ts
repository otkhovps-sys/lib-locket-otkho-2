// Example: 06-friends-and-contacts.
import { createClient } from '../client.js';
const client = await createClient();
console.log(await client.friends.getAllFriends());
console.log(await client.friends.getFriendRequests());
// await client.friends.sendRequestByUsername('friend_username');
// await client.friends.acceptRequest('FRIEND_UID');

