import { get, post, put } from './api';
import type { LoginPayload, RegisterPayload, User, UserPreferences } from '../types/auth';

export const authService = {
  login: (payload: LoginPayload) => post<{ user: User }>('/auth/login', payload).then((d) => d.user),
  register: (payload: RegisterPayload) => post<{ user: User }>('/auth/register', payload).then((d) => d.user),
  logout: () => post<null>('/auth/logout'),
  me: () => get<{ user: User }>('/auth/me').then((d) => d.user),
  updateProfile: (data: { name?: string; title?: string; avatar?: string; preferences?: Partial<UserPreferences> }) =>
    put<{ user: User }>('/auth/me', data).then((d) => d.user),
  changePassword: (currentPassword: string, newPassword: string) => put<null>('/auth/password', { currentPassword, newPassword }),
  forgotPassword: (email: string) => post<null>('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => post<null>('/auth/reset-password', { token, password }),
};
