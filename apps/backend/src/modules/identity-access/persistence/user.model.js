// @ts-check
import mongoose from 'mongoose';

/**
 * @typedef {'pending' | 'active' | 'deactivated'} UserStatus
 * @typedef {{
 *   _id: mongoose.Types.ObjectId;
 *   email: string;
 *   normalizedEmail: string;
 *   displayName: string;
 *   passwordHash: string | null;
 *   status: UserStatus;
 *   isPlatformUser: boolean;
 *   platformPermissions: string[];
 *   createdAt: Date;
 *   updatedAt: Date;
 *   version: number;
 * }} UserDocument
 */

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true },
    normalizedEmail: { type: String, required: true, trim: true, lowercase: true },
    displayName: { type: String, required: true, trim: true },
    passwordHash: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'active', 'deactivated'],
      default: 'pending',
      required: true,
    },
    isPlatformUser: { type: Boolean, default: false },
    platformPermissions: { type: [String], default: [] },
    version: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'users',
    optimisticConcurrency: true,
  },
);

userSchema.index({ normalizedEmail: 1 }, { unique: true });
userSchema.index({ status: 1, createdAt: -1 });

export const UserModel = mongoose.model('User', userSchema);
