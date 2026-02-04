const sdk = require('node-appwrite');
const crypto = require('crypto');

module.exports = async function (context) {
  const req = context.req;
  const res = context.res;
  const log = context.log || console.log;

  log('شروع فانکشن');

  const client = new sdk.Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_FUNCTION_API_KEY);

  const databases = new sdk.Databases(client);

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
    return res.json({ error: 'JSON نامعتبر' }, 400);
  }

  log('Body:', body);
  const action = body.action;

  /* ===================== CREATE INVITE ===================== */

  if (action === 'create-invite') {
    const ownerId = body.owner_user_id;
    if (!ownerId) return res.json({ error: 'owner_user_id لازم است' }, 400);

    try {
      await databases.getDocument(DB_ID, USERS, ownerId);
    } catch {
      return res.json({ error: 'کاربر والد پیدا نشد' }, 404);
    }

    const code = crypto.randomBytes(16).toString('hex');

    await databases.createDocument(
      DB_ID,
      INVITES,
      sdk.ID.unique(),
      {
        code,
        owner_user_id: ownerId,
        is_used: false,
        created_at: new Date().toISOString(),
        used_by_user_id: null,
        used_at: null
      }
    );

    log('کد ساخته شد:', code);
    return res.json({ success: true, code });
  }

  /* ===================== USE INVITE ===================== */

  if (action === 'use-invite') {
    const code = body.code;
    const newUserId = body.new_user_id;

    if (!code || !newUserId)
      return res.json({ error: 'code و new_user_id لازم است' }, 400);

    // پیدا کردن کد دعوت
    const inviteRes = await databases.listDocuments(DB_ID, INVITES, [
      sdk.Query.equal('code', code),
      sdk.Query.equal('is_used', false)
    ]);

    if (inviteRes.total === 0)
      return res.json({ error: 'کد نامعتبر یا مصرف شده' }, 400);

    const invite = inviteRes.documents[0];
    const ownerId = invite.owner_user_id;

    // چک نساختن دوباره
    try {
      await databases.getDocument(DB_ID, USERS, newUserId);
      return res.json({ error: 'این کاربر قبلاً ثبت شده' }, 400);
    } catch {}

    // گرفتن والد
    const parent = await databases.getDocument(DB_ID, USERS, ownerId);

    let side = null;

    if (!parent.left_child) side = 'left';
    else if (!parent.right_child) side = 'right';
    else
      return res.json({ error: 'هر دو سمت پر است (نسخه ساده)' }, 400);

    // ساخت یوزر جدید
    await databases.createDocument(
      DB_ID,
      USERS,
      newUserId,
      {
        telegram_id: newUserId,
        parent_id: ownerId,
        reserved_side: side,
        left_child: null,
        right_child: null,
        subtree_size: 0,
        created_at: new Date().toISOString()
      }
    );

    // آپدیت والد
    const updateData = {};
    updateData[`${side}_child`] = newUserId;

    await databases.updateDocument(
      DB_ID,
      USERS,
      ownerId,
      updateData
    );

    // سوزاندن کد
    await databases.updateDocument(
      DB_ID,
      INVITES,
      invite.$id,
      {
        is_used: true,
        used_by_user_id: newUserId,
        used_at: new Date().toISOString()
      }
    );

    log('ثبت‌نام موفق:', newUserId, 'زیر', ownerId, 'سمت', side);

    return res.json({
      success: true,
      placed_under: ownerId,
      side: side
    });
  }

  return res.json({ error: 'action نامعتبر' }, 400);
};
