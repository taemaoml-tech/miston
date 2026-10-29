import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { emitStarUpdate } from '../sockets/emitter';
import { asyncHandler } from '../utils/http';
import {
  claimDailyReward,
  equipItem,
  getInventory,
  getStarOverview,
  listShop,
  purchaseItem,
  unequipItem,
} from '../star/service';

const router = Router();
router.use(requireAuth);

const shopQuery = z.object({
  category: z.enum(['profile', 'chats', 'emoji', 'collections']).optional(),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary', 'seasonal']).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['recommended', 'price-asc', 'price-desc', 'rarity', 'new']).optional(),
});
const inventoryQuery = z.object({
  sort: z.enum(['recent', 'price', 'rarity', 'name', 'equipped']).default('recent'),
});
const itemParams = z.object({ itemId: z.string().trim().min(1).max(80) });

router.get('/overview', asyncHandler(async (req, res) => {
  res.json(await getStarOverview(req.auth!.userId));
}));

router.post('/daily', asyncHandler(async (req, res) => {
  const result = await claimDailyReward(req.auth!.userId);
  if (result.claimed) emitStarUpdate(req.auth!.userId, result);
  res.json(result);
}));

router.get('/shop', asyncHandler(async (req, res) => {
  const filters = shopQuery.parse(req.query);
  res.json(await listShop(req.auth!.userId, filters));
}));

router.post('/shop/:itemId/purchase', asyncHandler(async (req, res) => {
  const { itemId } = itemParams.parse(req.params);
  const result = await purchaseItem(req.auth!.userId, itemId);
  emitStarUpdate(req.auth!.userId, result);
  res.status(201).json(result);
}));

router.get('/inventory', asyncHandler(async (req, res) => {
  const { sort } = inventoryQuery.parse(req.query);
  res.json(await getInventory(req.auth!.userId, sort));
}));

router.post('/inventory/:itemId/equip', asyncHandler(async (req, res) => {
  const { itemId } = itemParams.parse(req.params);
  const result = await equipItem(req.auth!.userId, itemId);
  res.json({ ...result, inventory: await getInventory(req.auth!.userId, 'equipped') });
}));

router.post('/inventory/:itemId/unequip', asyncHandler(async (req, res) => {
  const { itemId } = itemParams.parse(req.params);
  const result = await unequipItem(req.auth!.userId, itemId);
  res.json({ ...result, inventory: await getInventory(req.auth!.userId, 'equipped') });
}));

export default router;
