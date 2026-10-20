import { z } from "zod";
import type { Kit } from "./kit.js";

const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(["technical", "behavioural", "domain"]),
  priority: z.enum(["must", "nice"]),
}).strict();

const questionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string()),
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
  prompt: z.string().min(1),
  answer_outline: z.string().min(1),
  difficulty: z.number().int().min(1).max(3),
}).strict();

const flashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string()),
}).strict();

const scheduleDaySchema = z.object({
  day: z.number().int().min(1),
  focus: z.string().min(1),
  question_ids: z.array(z.string()),
  minutes: z.number().int().min(0).max(1440),
}).strict();

export const kitSchema = z.object({
  source: z.object({
    company: z.string(), company_url: z.string().url(), role: z.string(), location: z.string(),
    jd_chars: z.number().int().nonnegative(), researched_at: z.string().min(1), pages_used: z.array(z.string().url()),
  }).strict(),
  company_brief: z.object({ summary: z.string(), what_they_do: z.string(), sources: z.array(z.string().url()) }).strict(),
  role: z.object({ title: z.string(), seniority: z.string(), responsibilities: z.array(z.string()), requirements: z.array(requirementSchema) }).strict(),
  questions: z.array(questionSchema),
  flashcards: z.array(flashcardSchema),
  schedule: z.object({ days_available: z.number().int().min(1).max(60), days: z.array(scheduleDaySchema) }).strict(),
  coverage: z.object({ uncovered_requirement_ids: z.array(z.string()), passes: z.number().int().min(1).max(3) }).strict(),
  research: z.object({
    attempted: z.array(z.object({ url: z.string(), status: z.enum(["used", "skipped", "failed"]), reason: z.string().optional() }).strict()),
    discussion_found: z.boolean(), notes: z.array(z.string()),
  }).strict().optional(),
}).strict();

export const caseInputSchema = z.object({
  id: z.string().min(1).max(120),
  jd: z.string().min(1).max(100000),
  company_url: z.string().url(),
  days: z.number().int().min(1).max(60),
}).strict();

export const kitEditStateSchema = z.object({
  items: z.record(z.string(), z.object({ origin: z.enum(["generated", "user"]), edited: z.boolean(), pinned: z.boolean() }).strict()),
  sections: z.record(z.string(), z.object({ edited: z.boolean(), pinned: z.boolean() }).strict()),
  practice: z.record(z.string(), z.object({ confidence: z.number().int().min(1).max(5), reviewed_at: z.string().datetime({ offset: true }) }).strict()),
  nextIds: z.object({ question: z.number().int().min(1), flashcard: z.number().int().min(1) }).strict(),
}).strict();

export const createKitInputSchema = z.object({
  jd: z.string().trim().min(1).max(100000),
  company_url: z.string().trim().url(),
  days: z.coerce.number().int().min(1).max(60),
}).strict();

export type CreateKitInput = z.infer<typeof createKitInputSchema>;

export function validateKit(value: unknown): { success: true; data: Kit } | { success: false; errors: string[] } {
  const parsed = kitSchema.safeParse(value);
  if (!parsed.success) return { success: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };

  const kit = parsed.data;
  const errors: string[] = [];
  const requirementIds = kit.role.requirements.map((item) => item.id);
  const questionIds = kit.questions.map((item) => item.id);
  const flashcardIds = kit.flashcards.map((item) => item.id);
  const unique = (ids: string[], label: string) => {
    if (new Set(ids).size !== ids.length) errors.push(`${label} IDs must be unique`);
  };
  unique(requirementIds, "Requirement");
  unique(questionIds, "Question");
  unique(flashcardIds, "Flashcard");
  const reqSet = new Set(requirementIds);
  const qSet = new Set(questionIds);
  for (const question of kit.questions) {
    if (question.requirement_ids.some((id) => !reqSet.has(id))) errors.push(`${question.id} references an unknown requirement`);
  }
  for (const card of kit.flashcards) {
    if (card.requirement_ids.some((id) => !reqSet.has(id))) errors.push(`${card.id} references an unknown requirement`);
  }
  if (kit.schedule.days_available !== kit.schedule.days.length) errors.push("Schedule must contain exactly days_available days");
  if (kit.schedule.days.some((day, index) => day.day !== index + 1)) errors.push("Schedule day numbers must be consecutive starting at 1");
  if (kit.schedule.days.some((day) => day.question_ids.some((id) => !qSet.has(id)))) errors.push("Schedule references an unknown question");
  const scheduledAll = new Set(kit.schedule.days.flatMap((day) => day.question_ids));
  if (questionIds.some((id) => !scheduledAll.has(id))) errors.push("Every generated question must appear in the schedule");
  const covered = new Set(kit.questions.flatMap((question) => question.requirement_ids));
  const uncovered = kit.role.requirements.filter((requirement) => !covered.has(requirement.id)).map((item) => item.id);
  if (JSON.stringify([...kit.coverage.uncovered_requirement_ids].sort()) !== JSON.stringify([...uncovered].sort())) errors.push("coverage.uncovered_requirement_ids must match question references");
  const uncoveredMust = kit.role.requirements.filter((requirement) => requirement.priority === "must" && !covered.has(requirement.id));
  if (uncoveredMust.length) errors.push(`Must-have requirements lack questions: ${uncoveredMust.map((item) => item.id).join(", ")}`);
  const scheduledQuestionIds = new Set(kit.schedule.days.flatMap((day) => day.question_ids));
  const unscheduledMust = kit.role.requirements.filter((requirement) => requirement.priority === "must" && !kit.questions.some((question) => question.requirement_ids.includes(requirement.id) && scheduledQuestionIds.has(question.id)));
  if (unscheduledMust.length) errors.push(`Must-have requirements lack scheduled questions: ${unscheduledMust.map((item) => item.id).join(", ")}`);
  return errors.length ? { success: false, errors } : { success: true, data: kit as Kit };
}
