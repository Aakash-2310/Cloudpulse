import { Schema, model, InferSchemaType } from 'mongoose';

export const NOTIFICATION_TYPES = ['alert', 'alert-resolved', 'connection-failure', 'cost-anomaly', 'system'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const notificationSchema = new Schema(
  {
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    severity: { type: String, enum: ['critical', 'warning', 'info', 'success'], default: 'info' },
    link: { type: String },
    /** Users who have read this notification. Notifications are broadcast to all users. */
    readBy: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true },
);

notificationSchema.index({ createdAt: -1 });
// Notifications older than 30 days are removed automatically.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60, name: 'notification_ttl' });

export type INotification = InferSchemaType<typeof notificationSchema>;
export const Notification = model('Notification', notificationSchema);
