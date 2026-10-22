import { Types } from 'mongoose';
import { Notification, type NotificationType } from '../models/Notification';
import { AppError } from '../utils/http';

export async function notify(input: {
  type: NotificationType;
  title: string;
  message?: string;
  severity?: 'critical' | 'warning' | 'info' | 'success';
  link?: string;
}): Promise<void> {
  await Notification.create({ ...input, severity: input.severity ?? 'info' });
}

export async function listNotifications(userId: string, limit = 20) {
  const uid = new Types.ObjectId(userId);
  const [items, unread] = await Promise.all([
    Notification.find().sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ readBy: { $ne: uid } }),
  ]);
  return {
    unread,
    items: items.map((n) => ({
      _id: String(n._id),
      type: n.type,
      title: n.title,
      message: n.message,
      severity: n.severity,
      link: n.link,
      createdAt: n.createdAt,
      read: (n.readBy ?? []).some((id) => String(id) === userId),
    })),
  };
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  if (!Types.ObjectId.isValid(notificationId)) throw new AppError(400, 'Invalid notification id');
  const result = await Notification.updateOne(
    { _id: notificationId },
    { $addToSet: { readBy: new Types.ObjectId(userId) } },
  );
  if (result.matchedCount === 0) throw new AppError(404, 'Notification not found');
}

export async function markAllRead(userId: string): Promise<number> {
  const uid = new Types.ObjectId(userId);
  const result = await Notification.updateMany({ readBy: { $ne: uid } }, { $addToSet: { readBy: uid } });
  return result.modifiedCount;
}
