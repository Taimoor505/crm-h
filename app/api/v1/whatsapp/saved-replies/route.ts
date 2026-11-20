import { json, userRoute } from '@/server/http';

// Starter replies (editable saved replies are a later feature).
const DEFAULTS = [
  { id: 'thanks', title: 'Thanks', body: 'Thanks for your enquiry! When is a good time to call you?' },
  { id: 'details', title: 'Details', body: 'Sharing the full details now. Let me know if you have any questions.' },
  { id: 'meeting', title: 'Book a meeting', body: 'Would you like to book a meeting this week? Let me know a day and time that suits you.' },
  { id: 'follow_up', title: 'Follow up', body: 'Just checking in. Are you still interested?' },
];

// GET /whatsapp/saved-replies
export const GET = userRoute({ allowWhenReadOnly: true }, async () => json({ data: DEFAULTS }));
