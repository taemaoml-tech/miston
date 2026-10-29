const connectionCounts = new Map<string, number>();

export function connectPresence(userId: string): boolean {
  const count = connectionCounts.get(userId) ?? 0;
  connectionCounts.set(userId, count + 1);
  return count === 0;
}

export function disconnectPresence(userId: string): boolean {
  const count = connectionCounts.get(userId) ?? 0;
  if (count <= 1) {
    connectionCounts.delete(userId);
    return true;
  }
  connectionCounts.set(userId, count - 1);
  return false;
}

export function getOnlineUserCount(): number {
  return connectionCounts.size;
}

export function getOnlineUserIds(): string[] {
  return [...connectionCounts.keys()];
}

export function isUserOnline(userId: string): boolean {
  return connectionCounts.has(userId);
}
