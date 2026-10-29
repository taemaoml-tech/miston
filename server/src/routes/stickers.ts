import { Router } from 'express';
import { z } from 'zod';
import {
  addStickerToPack, createStickerPack, deleteSticker, deleteStickerPack,
  getUsableSticker, listFavoriteStickerIds, listRecentStickerIds, listStickerLibrary,
  setStickerFavorite, STICKER_CATEGORY_NAMES, updateStickerPack,
} from '../db/stickers';
import { requireAuth } from '../middleware/auth';
import { assetFilename, removeUpload, safeOriginalName, stickerUpload } from '../middleware/uploads';
import { asyncHandler } from '../utils/http';
import { AppError, notFound } from '../utils/errors';
import { uuid } from '../utils/validation';

const router = Router();
router.use(requireAuth);

const packIdParams = z.object({ packId: uuid });
const stickerParams = z.object({ stickerId: uuid });
const createPackBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).default(''),
});
const updatePackBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(200).optional(),
  isPublic: z.coerce.boolean().optional(),
});
const favoriteBody = z.object({ favorite: z.coerce.boolean().default(true) });
const recentsQuery = z.object({ limit: z.coerce.number().int().min(1).max(40).default(24) });
const stickerBody = z.object({ label: z.string().trim().max(80).default('') });

function fallbackLabel(originalName: string): string {
  const base = safeOriginalName(originalName).replace(/\.[^./\\]+$/, '').trim();
  return (base || 'Стікер').slice(0, 80);
}

router.get('/', asyncHandler(async (req, res) => {
  const me = req.auth!.userId;
  const [packs, favorites, recents] = await Promise.all([
    listStickerLibrary(me),
    listFavoriteStickerIds(me),
    listRecentStickerIds(me, recentsQuery.parse(req.query).limit),
  ]);
  res.json({
    categories: Object.entries(STICKER_CATEGORY_NAMES).map(([key, name]) => ({ key, name })),
    packs,
    favorites,
    recents,
  });
}));

router.post('/packs', asyncHandler(async (req, res) => {
  const input = createPackBody.parse(req.body);
  const pack = await createStickerPack(req.auth!.userId, input);
  res.status(201).json({ pack });
}));

router.patch('/packs/:packId', asyncHandler(async (req, res) => {
  const { packId } = packIdParams.parse(req.params);
  const input = updatePackBody.parse(req.body);
  const pack = await updateStickerPack(req.auth!.userId, packId, input);
  if (!pack) throw notFound('Набір не знайдено');
  res.json({ pack });
}));

router.delete('/packs/:packId', asyncHandler(async (req, res) => {
  const { packId } = packIdParams.parse(req.params);
  const assets = await deleteStickerPack(req.auth!.userId, packId);
  if (assets === null) throw notFound('Набір не знайдено');
  await Promise.all(assets.map((asset) => removeUpload(assetFilename(asset))));
  res.status(204).send();
}));

router.post('/packs/:packId/stickers', stickerUpload.single('file'), asyncHandler(async (req, res) => {
  const { packId } = packIdParams.parse(req.params);
  if (!req.file) throw new AppError(400, 'STICKER_FILE_REQUIRED', 'Додайте файл стікера (PNG, WebP або GIF)');
  const { label } = stickerBody.parse(req.body);
  try {
    const sticker = await addStickerToPack(req.auth!.userId, packId, {
      label: label || fallbackLabel(req.file.originalname),
      asset: `/uploads/${req.file.filename}`,
      // The browser animates GIFs on its own; the flag tells the client not to
      // apply the SVG keyframe treatment.
      animation: req.file.mimetype.split(';', 1)[0] === 'image/gif' ? 'raster' : '',
    });
    res.status(201).json({ sticker });
  } catch (error) {
    await removeUpload(req.file.filename);
    throw error;
  }
}));

router.delete('/stickers/:stickerId', asyncHandler(async (req, res) => {
  const { stickerId } = stickerParams.parse(req.params);
  const asset = await deleteSticker(req.auth!.userId, stickerId);
  if (asset === null) throw notFound('Стікер не знайдено');
  await removeUpload(assetFilename(asset));
  res.status(204).send();
}));

router.put('/favorites/:stickerId', asyncHandler(async (req, res) => {
  const { stickerId } = stickerParams.parse(req.params);
  const { favorite } = favoriteBody.parse(req.body);
  const sticker = await getUsableSticker(stickerId, req.auth!.userId);
  if (!sticker) throw notFound('Стікер не знайдено');
  await setStickerFavorite(req.auth!.userId, stickerId, favorite);
  res.json({ stickerId, favorite });
}));

router.get('/favorites', asyncHandler(async (req, res) => {
  res.json({ favorites: await listFavoriteStickerIds(req.auth!.userId) });
}));

export default router;
