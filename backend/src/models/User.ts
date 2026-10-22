import { Schema, model, HydratedDocument, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export const USER_ROLES = ['admin', 'operator', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface IUser {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  avatar?: string;
  title?: string;
  active: boolean;
  lastLoginAt?: Date;
  passwordResetTokenHash?: string;
  passwordResetExpires?: Date;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    emailNotifications: boolean;
    defaultEnvironment: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: USER_ROLES, default: 'viewer', index: true },
    avatar: { type: String },
    title: { type: String, trim: true, maxlength: 80 },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
      emailNotifications: { type: Boolean, default: true },
      defaultEnvironment: { type: String, default: 'all' },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.password;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpires;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export type UserModel = Model<IUser, Record<string, never>, IUserMethods>;
export const User = model<IUser, UserModel>('User', userSchema);
