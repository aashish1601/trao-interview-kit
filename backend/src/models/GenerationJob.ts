import mongoose, { Schema } from "mongoose";

const generationJobSchema = new Schema({
  kitId: { type: Schema.Types.ObjectId, ref: "Kit", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["initial", "regeneration"], required: true },
  target: { type: String },
  force: { type: Boolean, default: false },
  status: { type: String, enum: ["queued", "running", "completed", "failed"], default: "queued", index: true },
  startedAt: { type: Date },
  completedAt: { type: Date },
  error: { code: String, message: String },
}, { timestamps: true, versionKey: false });

generationJobSchema.index({ status: 1, createdAt: 1 });
export const GenerationJob: any = mongoose.models.GenerationJob ?? mongoose.model("GenerationJob", generationJobSchema);
