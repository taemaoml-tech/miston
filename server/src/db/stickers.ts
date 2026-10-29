import { query } from './pool';
import { serializeSticker, serializeStickerPack } from '../utils/serializers';
import { AppError } from '../utils/errors';
import type { Sticker, StickerCategory, StickerPack } from '../types/domain';

export const STICKER_CATEGORY_NAMES: Record<StickerCategory, string> = {
  emotions: 'Емоції',
  memes: 'Меми',
  animals: 'Тварини',
  games: 'Ігри',
  holidays: 'Свята',
  anime: 'Аніме',
  reactions: 'Реакції',
  custom: 'Мої набори',
};

export const MAX_STICKERS_PER_PACK = 60;
export const MAX_PACKS_PER_USER = 10;
export const RECENT_STICKERS_KEPT = 40;

// Built-in packs belong to everyone; a custom pack is usable by its owner and,
// once published, by the rest of the messenger.
function accessible(userParam: string): string {
  return `p.category <> 'custom' OR p.owner_id = ${userParam} OR (p.is_public AND p.owner_id IS NOT NULL)`;
}

export async function listStickerLibrary(userId: string): Promise<StickerPack[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT p.id AS pack_id, p.slug AS pack_slug, p.name, p.description, p.category,
            p.cover_asset, p.is_animated, p.owner_id, p.is_public,
            s.id, s.pack_id AS sticker_pack_id, s.slug AS sticker_slug,
            s.label, s.keywords, s.asset, s.animation, s.width, s.height
     FROM sticker_packs p
     LEFT JOIN stickers s ON s.pack_id = p.id
     WHERE ${accessible('$1')}
     ORDER BY p.sort_order, p.name, s.sort_order, s.label`,
    [userId],
  );

  const packs = new Map<string, { row: Record<string, unknown>; stickers: Sticker[] }>();
  for (const row of result.rows) {
    const packId = String(row.pack_id);
    const entry = packs.get(packId) ?? {
      row: {
        id: packId,
        slug: row.pack_slug,
        name: row.name,
        description: row.description,
        category: row.category,
        cover_asset: row.cover_asset,
        is_animated: row.is_animated,
        owner_id: row.owner_id,
      },
      stickers: [] as Sticker[],
    };
    if (row.id) {
      entry.stickers.push(serializeSticker({
        id: row.id,
        pack_id: row.sticker_pack_id,
        slug: row.sticker_slug,
        label: row.label,
        keywords: row.keywords,
        asset: row.asset,
        animation: row.animation,
        width: row.width,
        height: row.height,
      }));
    }
    packs.set(packId, entry);
  }

  return [...packs.values()].map(({ row, stickers }) =>
    serializeStickerPack(row, stickers, String(row.owner_id ?? '') === userId));
}

export async function getUsableSticker(stickerId: string, userId: string): Promise<Sticker | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT s.* FROM stickers s
     JOIN sticker_packs p ON p.id = s.pack_id
     WHERE s.id = $1 AND (${accessible('$2')})`,
    [stickerId, userId],
  );
  const row = result.rows[0];
  return row ? serializeSticker(row) : null;
}

export async function listFavoriteStickerIds(userId: string): Promise<string[]> {
  const result = await query<{ sticker_id: string }>(
    'SELECT sticker_id FROM sticker_favorites WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return result.rows.map((row) => row.sticker_id);
}

export async function listRecentStickerIds(userId: string, limit: number): Promise<string[]> {
  const result = await query<{ sticker_id: string }>(
    'SELECT sticker_id FROM sticker_recents WHERE user_id = $1 ORDER BY used_at DESC LIMIT $2',
    [userId, limit],
  );
  return result.rows.map((row) => row.sticker_id);
}

export async function recordStickerUse(userId: string, stickerId: string): Promise<void> {
  await query(
    `INSERT INTO sticker_recents (user_id, sticker_id, used_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id, sticker_id) DO UPDATE SET used_at = now()`,
    [userId, stickerId],
  );
  await query(
    `DELETE FROM sticker_recents
     WHERE user_id = $1 AND sticker_id NOT IN (
       SELECT sticker_id FROM sticker_recents WHERE user_id = $1 ORDER BY used_at DESC LIMIT $2
     )`,
    [userId, RECENT_STICKERS_KEPT],
  );
}

export async function setStickerFavorite(userId: string, stickerId: string, favorite: boolean): Promise<void> {
  if (favorite) {
    await query(
      'INSERT INTO sticker_favorites (user_id, sticker_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, stickerId],
    );
    return;
  }
  await query('DELETE FROM sticker_favorites WHERE user_id = $1 AND sticker_id = $2', [userId, stickerId]);
}

export async function createStickerPack(userId: string, input: { name: string; description: string }): Promise<StickerPack> {
  const owned = await query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM sticker_packs WHERE owner_id = $1', [userId],
  );
  if (Number(owned.rows[0]?.count ?? 0) >= MAX_PACKS_PER_USER) {
    throw new AppError(409, 'PACK_LIMIT', `Можна мати не більше ${MAX_PACKS_PER_USER} власних наборів`);
  }
  const slug = `custom-${userId.slice(0, 8)}-${Date.now().toString(36)}`;
  const inserted = await query<Record<string, unknown>>(
    `INSERT INTO sticker_packs (slug, name, description, category, owner_id, sort_order)
     VALUES ($1, $2, $3, 'custom', $4, 1000) RETURNING *`,
    [slug, input.name, input.description, userId],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error('Sticker pack insert returned no row');
  return serializeStickerPack(row, [], true);
}

export async function addStickerToPack(
  userId: string,
  packId: string,
  input: { label: string; asset: string; animation: string },
): Promise<Sticker> {
  const pack = await query<{ id: string; cover_asset: string }>(
    `SELECT p.id, p.cover_asset FROM sticker_packs p
     WHERE p.id = $1 AND p.owner_id = $2 AND p.category = 'custom'`,
    [packId, userId],
  );
  const packRow = pack.rows[0];
  if (!packRow) throw new AppError(404, 'PACK_NOT_FOUND', 'Ваш набір не знайдено');

  const count = await query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM stickers WHERE pack_id = $1', [packId],
  );
  if (Number(count.rows[0]?.count ?? 0) >= MAX_STICKERS_PER_PACK) {
    throw new AppError(409, 'STICKER_LIMIT', `У наборі може бути не більше ${MAX_STICKERS_PER_PACK} стікерів`);
  }

  const slug = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // Both uses of the label parameter are cast to text; PostgreSQL otherwise
  // deduces conflicting types (varchar column vs lower(text)).
  const inserted = await query<Record<string, unknown>>(
    `INSERT INTO stickers (pack_id, slug, label, keywords, asset, animation, sort_order)
     VALUES ($1, $2, $3::text, lower($3::text), $4, $5, (SELECT COUNT(*) FROM stickers WHERE pack_id = $1))
     RETURNING *`,
    [packId, slug, input.label, input.asset, input.animation],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error('Sticker insert returned no row');
  if (!packRow.cover_asset) {
    await query('UPDATE sticker_packs SET cover_asset = $2 WHERE id = $1', [packId, input.asset]);
  }
  return serializeSticker(row);
}

export async function updateStickerPack(
  userId: string,
  packId: string,
  input: { name?: string | undefined; description?: string | undefined; isPublic?: boolean | undefined },
): Promise<StickerPack | null> {
  const result = await query<Record<string, unknown>>(
    `UPDATE sticker_packs
     SET name = COALESCE($3, name),
         description = COALESCE($4, description),
         is_public = COALESCE($5, is_public)
     WHERE id = $1 AND owner_id = $2 AND category = 'custom'
     RETURNING *`,
    [packId, userId, input.name ?? null, input.description ?? null, input.isPublic ?? null],
  );
  const row = result.rows[0];
  if (!row) return null;
  const stickers = await query<Record<string, unknown>>(
    'SELECT * FROM stickers WHERE pack_id = $1 ORDER BY sort_order, label', [packId],
  );
  return serializeStickerPack(row, stickers.rows.map(serializeSticker), true);
}

/** Returns the stored files that referenced this pack, or null when nothing was deleted. */
export async function deleteStickerPack(userId: string, packId: string): Promise<string[] | null> {
  const assets = await query<{ asset: string }>(
    `SELECT s.asset FROM stickers s
     JOIN sticker_packs p ON p.id = s.pack_id
     WHERE s.pack_id = $1 AND p.owner_id = $2 AND p.category = 'custom'`,
    [packId, userId],
  );
  const deleted = await query(
    `DELETE FROM sticker_packs WHERE id = $1 AND owner_id = $2 AND category = 'custom'`,
    [packId, userId],
  );
  return deleted.rowCount === 0 ? null : assets.rows.map((row) => row.asset);
}

/** Returns the deleted sticker's own file so the caller can unlink it. */
export async function deleteSticker(userId: string, stickerId: string): Promise<string | null> {
  const deleted = await query<{ asset: string; pack_id: string }>(
    `DELETE FROM stickers s USING sticker_packs p
     WHERE s.id = $1 AND s.pack_id = p.id AND p.owner_id = $2 AND p.category = 'custom'
     RETURNING s.asset, s.pack_id`,
    [stickerId, userId],
  );
  const row = deleted.rows[0];
  if (!row) return null;
  const next = await query<{ asset: string }>(
    'SELECT asset FROM stickers WHERE pack_id = $1 ORDER BY sort_order LIMIT 1', [row.pack_id],
  );
  await query('UPDATE sticker_packs SET cover_asset = COALESCE($2, \'\') WHERE id = $1', [row.pack_id, next.rows[0]?.asset ?? null]);
  return row.asset;
}
