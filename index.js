const sdk = require('node-appwrite');
const crypto = require('crypto');

module.exports = async function main(req, res) {
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

  const databases = new sdk.Databases(client);

  const DB_ID = 'main';
  const USERS = 'users';
  const INVITES = 'invite_codes';

  let body;
  try {
    body = typeof req.payload === 'string' ? JSON.parse(req.payload) : req.payload || {};
  } catch (e) {
    return res.json({ error: 'invalid json' }, 400);
  }

  const action = body.action || '';

  if (action === 'create-invite') {
    const ownerId = body.owner_user_id;
    if (!ownerId) return res.json({ error: 'owner_user_id لازم است' }, 400);

    try {
      await databases.getDocument(DB_ID, USERS, ownerId);
    } catch {
      return res.json({ error: 'کاربر والد پیدا نشد' }, 404);
    }

    const code = crypto.randomBytes(32).toString('hex');

    await databases.createDocument(DB_ID, INVITES, sdk.ID.unique(), {
      code,
      owner_user_id: ownerId,
      is_used: false,
      created_at: new Date().toISOString()
    });

    return res.json({ code });
  }

  // بقیه کدت (register و get-user) رو هم همینجا کپی کن
  // فقط مطمئن شو همه return res.json(...) باشه

  return res.json({ error: 'action نامعتبر' }, 400);
};
