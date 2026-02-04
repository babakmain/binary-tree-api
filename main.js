const sdk = require('node-appwrite');
const crypto = require('crypto');

module.exports = async function (context) {
  const req = context.req;
  const res = context.res;
  const log = context.log || console.log;

  // ===== Appwrite Client =====
  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

  const databases = new sdk.Databases(client);

  // ===== IDs واقعی (از کنسول کپی کن) =====
  const DB_ID = '697d0453002392b0eca0';        // Database ID واقعی
  const USERS = 'ID_واقعی_useres';           // Collection ID واقعی
  const INVITES = 'ID_واقعی_invite_codes';   // Collection ID واقعی

  // ===== Parse Body =====
  let body = {};
  try {
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else if (req.payload) {
      body = typeof req.payload === 'string' ? JSON.parse(req.payload) : req.payload;
    }
  } catch (e) {
    log('JSON parse error:', e.message);
    return res.json({ error: 'json نامعتبر' }, 400);
  }

  const action = body.action;
  log('action:', action);

  // =========================
  // ACTION: create-invite
  // =========================
  if (action === 'create-invite') {
    const ownerId = body.owner_user_id;
    if (!ownerId) return res.json({ error: 'owner_user_id لازم است' }, 400);

    // چک وجود کاربر
    try {
      await databases.getDocument(DB_ID, USERS, ownerId);
    } catch (e) {
      log('user not found:', e.message);
      return res.json({ error: 'کاربر پیدا نشد' }, 404);
    }

    // ساخت کد امن
    const code = crypto.randomBytes(32).toString('hex');

    await databases.createDocument(
      DB_ID,
      INVITES,
      sdk.ID.unique(),
      {
        code,
        owner_user_id: ownerId,
        is_used: false,
        created_at: new Date().toISOString()
      }
    );

    return res.json({ code });
  }

  // =========================
  // ACTION: register
  // =========================
  if (action === 'register') {
    const telegramId = body.telegram_id;
    const inviteCode = body.invite_code;
    if (!telegramId || !inviteCode) {
      return res.json({ error: 'telegram_id و invite_code لازم است' }, 400);
    }

    // پیدا کردن کد
    const inviteList = await databases.listDocuments(DB_ID, INVITES, [
      sdk.Query.equal('code', inviteCode),
      sdk.Query.equal('is_used', false),
      sdk.Query.limit(1)
    ]);

    if (inviteList.total === 0) {
      return res.json({ error: 'کد نامعتبر یا مصرف شده' }, 400);
    }

    const inviteDoc = inviteList.documents[0];
    const parentId = inviteDoc.owner_user_id;

    // ساخت کاربر
    await databases.createDocument(
      DB_ID,
      USERS,
      telegramId, // خود telegram_id به‌عنوان documentId
      {
        telegram_id: telegramId,
        parent_id: parentId,
        left_child: null,
        right_child: null,
        subtree_size: 0,
        created_at: new Date().toISOString()
      }
    );

    // سوزاندن کد
    await databases.updateDocument(
      DB_ID,
      INVITES,
      inviteDoc.$id,
      {
        is_used: true,
        used_by_user_id: telegramId,
        used_at: new Date().toISOString()
      }
    );

    return res.json({ status: 'registered', parent_id: parentId });
  }

  return res.json({ error: 'action نامعتبر' }, 400);
};
