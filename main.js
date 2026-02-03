const sdk = require('node-appwrite');
const crypto = require('crypto');

module.exports = async function (context) {
  const req = context.req;
  const res = context.res;
  const log = context.log || console.log;
  const errorLog = context.error || console.error;

  log('Execution started');

  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

  const databases = new sdk.Databases(client);

  const DB_ID = 'main';
  const USERS = 'users';
  const INVITES = 'invite_codes';

  let body = {};
  try {
    body = typeof req.payload === 'string' ? JSON.parse(req.payload) : req.payload || {};
    log('Parsed body:', body);
  } catch (e) {
    log('JSON parse error:', e.message);
    return res.json({ error: 'invalid json' }, 400);
  }

  const action = body.action || '';
  log('Action received:', action);

  if (action === 'create-invite') {
    const ownerId = body.owner_user_id;
    if (!ownerId) return res.json({ error: 'owner_user_id لازم است' }, 400);

    try {
      await databases.getDocument(DB_ID, USERS, ownerId);
    } catch (e) {
      log('Owner not found:', e.message);
      return res.json({ error: 'کاربر والد پیدا نشد' }, 404);
    }

    const code = crypto.randomBytes(32).toString('hex');
    log('Generated code:', code);

    await databases.createDocument(DB_ID, INVITES, sdk.ID.unique(), {
      code,
      owner_user_id: ownerId,
      is_used: false,
      created_at: new Date().toISOString()
    });

    return res.json({ code });
  }

  // بخش register و get-user رو هم به همین شکل اضافه کن (فقط return res.json(...) باشه)

  log('No valid action');
  return res.json({ error: 'action نامعتبر' }, 400);
};
