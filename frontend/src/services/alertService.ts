import { del, get, getPaginated, post, put } from './api';
import type { Alert, AlertCounts, AlertRule, AlertRulePayload, AlertStatus, Notification } from '../types/alert';
import type { Severity } from '../types/common';

export interface AlertQuery {
  page?: number;
  limit?: number;
  status?: string;
  severity?: string;
  provider?: string;
  type?: string;
  search?: string;
}

export const alertService = {
  list: (q: AlertQuery) => getPaginated<Alert, { counts: AlertCounts }>('/alerts', { ...q }),
  create: (data: { title: string; description?: string; severity: Severity; provider?: string; resourceName?: string; type?: string }) =>
    post<Alert>('/alerts', data),
  update: (id: string, data: { title?: string; description?: string; severity?: Severity; status?: AlertStatus }) => put<Alert>(`/alerts/${id}`, data),
  acknowledge: (id: string) => post<Alert>(`/alerts/${id}/acknowledge`),
  resolve: (id: string) => post<Alert>(`/alerts/${id}/resolve`),
  remove: (id: string) => del(`/alerts/${id}`),

  rules: () => get<AlertRule[]>('/alert-rules'),
  createRule: (data: AlertRulePayload) => post<AlertRule>('/alert-rules', data),
  updateRule: (id: string, data: Partial<AlertRulePayload>) => put<AlertRule>(`/alert-rules/${id}`, data),
  deleteRule: (id: string) => del(`/alert-rules/${id}`),

  notifications: () => get<{ unread: number; items: Notification[] }>('/notifications'),
  markRead: (id: string) => post(`/notifications/${id}/read`),
  markAllRead: () => post<{ count: number }>('/notifications/read-all'),
};
