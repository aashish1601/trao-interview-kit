import type { Question, Requirement } from "../../domain/kit.js";

export function findUncoveredRequirements(requirements: Requirement[], questions: Question[]): Requirement[] {
  const covered = new Set(questions.flatMap((question) => question.requirement_ids));
  return requirements.filter((requirement) => !covered.has(requirement.id));
}
