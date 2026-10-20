import mongoose, { Schema } from "mongoose";

const userSchema = new Schema({
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true, versionKey: false });

export const User: any = mongoose.models.User ?? mongoose.model("User", userSchema);
