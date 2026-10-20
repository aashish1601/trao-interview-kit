import mongoose, { Schema } from "mongoose";

const kitSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  input: {
    jd: { type: String, required: true, maxlength: 100000 },
    company_url: { type: String, required: true },
    days: { type: Number, required: true, min: 1, max: 60 },
  },
  idempotencyKey: { type: String, required: true },
  status: { type: String, enum: ["queued", "running", "ready", "failed", "regenerating"], default: "queued", index: true },
  progress: { stage: { type: String, default: "queued" }, percent: { type: Number, default: 0 }, message: { type: String, default: "Waiting to start" } },
  generationError: { code: String, message: String },
  kit: { type: Schema.Types.Mixed, default: null },
  editState: { type: Schema.Types.Mixed, default: {} },
  researchContext: { type: Schema.Types.Mixed, default: {} },
  degraded: { type: Boolean, default: false },
}, { timestamps: true, minimize: false, versionKey: false });

kitSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
kitSchema.index({ userId: 1, updatedAt: -1 });

export const KitModel: any = mongoose.models.Kit ?? mongoose.model("Kit", kitSchema);
