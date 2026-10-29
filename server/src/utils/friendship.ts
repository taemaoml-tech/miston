import type { FriendshipState } from '../types/domain';

export function friendshipState(row: Record<string, unknown>, userId: string): FriendshipState {
  if (row.friend_status === 'accepted') return 'friends';
  if (row.friend_status === 'pending') {
    return String(row.friend_requester_id) === userId ? 'outgoing' : 'incoming';
  }
  return 'none';
}
