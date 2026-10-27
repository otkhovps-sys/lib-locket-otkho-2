import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from './client.js';

export async function runDemo(language: 'en' | 'vi'): Promise<void> {
    const vi = language === 'vi';
    if (process.argv.includes('--help')) {
        console.log(vi ? 'SDK Locket: cấu hình LOCKET_EMAIL, LOCKET_PASSWORD hoặc LOCKET_SESSION_PATH rồi chạy lại.'
            : 'Locket SDK: set LOCKET_EMAIL and LOCKET_PASSWORD, or LOCKET_SESSION_PATH, then run again.');
        return;
    }
    const client = await createClient();
    const input = createInterface({ input: stdin, output: stdout });
    const ask = (en: string, vn: string) => input.question(vi ? vn : en);
    console.log(vi ? 'SDK Locket — nhập số để chọn chức năng.' : 'Locket SDK — choose an action.');
    try {
        while (true) {
            console.log(vi ? '1 Hồ sơ | 2 Bạn bè | 3 Bảng tin | 4 Đăng ảnh | 5 Đăng video | 6 Nhắn tin | 7 Lời mời | 8 Moment của tôi | 9 Hội thoại | q Thoát'
                : '1 Profile | 2 Friends | 3 Feed | 4 Post image | 5 Post video | 6 Send message | 7 Friend requests | 8 My moments | 9 Conversations | q Quit');
            const action = (await input.question('> ')).trim();
            if (action === 'q') break;
            try {
                switch (action) {
                    case '1': console.log(await client.user.getProfile()); break;
                    case '2': console.log(await client.friends.getAllFriends()); break;
                    case '3': console.log(await client.moments.getLatest()); break;
                    case '4': {
                        const image = await ask('Image path or URL: ', 'Đường dẫn hoặc URL ảnh: ');
                        const caption = await ask('Caption: ', 'Chú thích: ');
                        const isPrivate = (await ask('Private? [y/N]: ', 'Chỉ gửi cho mình? [y/N]: ')).toLowerCase() === 'y';
                        console.log(await client.moments.post({ image, caption, isPrivate })); break;
                    }
                    case '5': {
                        const video = await ask('Video path or URL: ', 'Đường dẫn hoặc URL video: ');
                        const isPrivate = (await ask('Private? [y/N]: ', 'Chỉ gửi cho mình? [y/N]: ')).toLowerCase() === 'y';
                        console.log(await client.moments.post({ video, isPrivate,
                            progressCallback: (percent, status) => console.log(`${percent}% ${status}`) })); break;
                    }
                    case '6': console.log(await client.chat.sendMessage(await ask('Friend UID: ', 'UID bạn bè: '), await ask('Message: ', 'Tin nhắn: '))); break;
                    case '7': console.log(await client.friends.getFriendRequests()); break;
                    case '8': console.log(await client.moments.getAllMyMoments({ limit: 20 })); break;
                    case '9': console.log(await client.chat.getConversations()); break;
                    default: console.log(vi ? 'Lựa chọn không hợp lệ.' : 'Invalid selection.');
                }
            } catch (error) { console.error(error instanceof Error ? error.message : error); }
        }
    } finally { input.close(); }
}
