import { query } from './pool';

export async function listServers(userId: string, onlyId?: string) {
  const servers = await query<Record<string, unknown>>(
    `SELECT s.*, sm.role AS my_role FROM servers s
     JOIN server_members sm ON sm.server_id = s.id
     WHERE sm.user_id = $1 AND ($2::uuid IS NULL OR s.id = $2)
     ORDER BY s.created_at DESC`,
    [userId, onlyId ?? null],
  );
  if (servers.rows.length === 0) return [];
  const ids = servers.rows.map((row) => String(row.id));
  const [channels, members] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT c.id, c.server_id, c.kind, c.title, c.avatar_url, c.created_at,
              COALESCE((
                SELECT COUNT(*)::int FROM messages m
                WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
                  AND m.sender_id <> $2
                  AND m.id > COALESCE(cm.last_read_message_id, 0)
                  AND m.id > cm.cleared_after_id
              ), 0) AS unread_count
       FROM conversations c
       LEFT JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $2
       WHERE c.server_id = ANY($1::uuid[]) AND c.kind = 'channel'
       ORDER BY c.created_at ASC`,
      [ids, userId],
    ),
    query<Record<string, unknown>>(
      `SELECT sm.server_id, sm.user_id, sm.role, sm.joined_at,
              u.username, u.display_name, u.avatar_url
       FROM server_members sm JOIN users u ON u.id = sm.user_id
       WHERE sm.server_id = ANY($1::uuid[]) ORDER BY u.username`,
      [ids],
    ),
  ]);

  return servers.rows.map((row) => {
    const id = String(row.id);
    return {
      id,
      name: String(row.name),
      iconUrl: row.icon_url == null ? null : String(row.icon_url),
      ownerId: String(row.owner_id),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      role: String(row.my_role),
      channels: channels.rows.filter((channel) => channel.server_id === id).map((channel) => ({
        id: String(channel.id),
        serverId: id,
        kind: 'channel',
        title: String(channel.title),
        avatarUrl: channel.avatar_url == null ? null : String(channel.avatar_url),
        createdAt: channel.created_at instanceof Date ? channel.created_at.toISOString() : String(channel.created_at),
        unreadCount: Number(channel.unread_count ?? 0),
      })),
      members: members.rows.filter((member) => member.server_id === id).map((member) => ({
        id: String(member.user_id),
        username: String(member.username),
        displayName: String(member.display_name),
        avatarUrl: member.avatar_url == null ? null : String(member.avatar_url),
        role: String(member.role),
        joinedAt: member.joined_at instanceof Date ? member.joined_at.toISOString() : String(member.joined_at),
      })),
      memberCount: members.rows.filter((member) => member.server_id === id).length,
    };
  });
}
