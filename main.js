const sdk = require('node-appwrite');
const crypto = require('crypto');

module.exports = async function (context) {
  const req = context.req;
  const res = context.res;
  const log = context.log || console.log;

  log('شروع فانکشن');

  // اتصال به Appwrite
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

  const databases = new sdk.Databases(client);

  // IDs واقعی
  const DB_ID = '697d0453002392b0eca0';
  const USERS = 'useres';
  const INVITES = 'invite_codes';

  // parse body
  let body = {};
  try {
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else if (req.payload) {
      body = typeof req.payload === 'string' ? JSON.parse(req.payload) : req.payload;
    }
  } catch (e) {
    log('خطا در parse body:', e.message);
    return res.json({ error: 'JSON نامعتبر' }, 400);
  }

  log('Body:', body);

  const action = body.action;

  // فقط یک اکشن فعلاً
  if (action !== 'create-invite') {
    return res.json({ error: 'action نامعتبر' }, 400);
  }

  const ownerId = body.owner_user_id;
  if (!ownerId) {
    return res.json({ error: 'owner_user_id لازم است' }, 400);
  }

  // چک وجود کاربر
  try {
    const user = await databases.getDocument(DB_ID, USERS, ownerId);
    log('کاربر پیدا شد:', user.$id);
  } catch (e) {
    log('کاربر پیدا نشد:', e.message);
    return res.json({ error: 'کاربر والد پیدا نشد' }, 404);
  }

  // ساخت کد دعوت
  const code = crypto.randomBytes(16).toString('hex');

  // ذخیره در invite_codes
  await databases.createDocument(
    DB_ID,
    INVITES,
    sdk.ID.unique(),
    {
      code: code,
      owner_user_id: ownerId,
      is_used: false,
      created_at: new Date().toISOString(),
      used_by_user_id: null,
      used_at: null
    }
  );

  log('کد ساخته شد:', code);

  return res.json({
    success: true,
    code: code
  });
};
