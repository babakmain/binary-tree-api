const sdk = require('node-appwrite');
const crypto = require('crypto');

module.exports = async function (req, res) {
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

  // create-invite
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

  // register
  if (action === 'register') {
    const { telegram_id, invite_code } = body;
    if (!telegram_id || !invite_code) return res.json({ error: 'telegram_id و invite_code لازم است' }, 400);

    const invites = await databases.listDocuments(DB_ID, INVITES, [
      sdk.Query.equal('code', invite_code),
      sdk.Query.equal('is_used', false)
    ]);

    if (invites.documents.length === 0) {
      return res.json({ error: 'کد دعوت نامعتبر یا قبلاً استفاده شده' }, 400);
    }

    const invite = invites.documents[0];
    const parentId = invite.owner_user_id;

    try {
      await databases.getDocument(DB_ID, USERS, telegram_id);
      return res.json({ error: 'این کاربر قبلاً ثبت شده' }, 409);
    } catch {}

    let current = parentId;
    let side = null;
    let depth = 0;
    const MAX_DEPTH = 100;

    while (depth < MAX_DEPTH) {
      const user = await databases.getDocument(DB_ID, USERS, current);

      if (!user.left_child) { side = 'left'; break; }
      if (!user.right_child) { side = 'right'; break; }

      const left = await databases.getDocument(DB_ID, USERS, user.left_child);
      const right = await databases.getDocument(DB_ID, USERS, user.right_child);

      current = left.subtree_size <= right.subtree_size ? user.left_child : user.right_child;
      depth++;
    }

    if (depth >= MAX_DEPTH) {
      return res.json({ error: 'درخت خیلی عمیق است' }, 500);
    }

    await databases.createDocument(DB_ID, USERS, telegram_id, {
      telegram_id,
      parent_id: current,
      reserved_side: null,
      left_child: null,
      right_child: null,
      subtree_size: 1,
      created_at: new Date().toISOString()
    });

    await databases.updateDocument(DB_ID, USERS, current, {
      [`${side}_child`]: telegram_id
    });

    let updater = current;
    while (updater) {
      const u = await databases.getDocument(DB_ID, USERS, updater);
      await databases.updateDocument(DB_ID, USERS, updater, {
        subtree_size: (u.subtree_size || 0) + 1
      });
      updater = u.parent_id || null;
    }

    await databases.updateDocument(DB_ID, INVITES, invite.$id, {
      is_used: true,
      used_by_user_id: telegram_id,
      used_at: new Date().toISOString()
    });

    return res.json({ success: true, user_id: telegram_id, placed_under: current, side });
  }

  // get-user
  if (action === 'get-user') {
    const telegram_id = body.telegram_id;
    if (!telegram_id) return res.json({ error: 'telegram_id لازم است' }, 400);

    try {
      const user = await databases.getDocument(DB_ID, USERS, telegram_id);
      return res.json({
        telegram_id: user.telegram_id,
        parent_id: user.parent_id,
        left_child: user.left_child,
        right_child: user.right_child,
        subtree_size: user.subtree_size
      });
    } catch {
      return res.json({ error: 'کاربر پیدا نشد' }, 404);
    }
  }

  return res.json({ error: 'action نامعتبر' }, 400);
};
