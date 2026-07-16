export type Answer = {
  label: string;
  value: string; // empty string = skipped
};

export function questionGenPrompt(idea: string): string {
  return `You generate clarifying questions for a prompt-enhancement tool.

You will receive a raw project idea. The user will already answer fixed
questions about: goal/outcome, scope/size, design direction, tech stack
and versions, constraints/non-goals. Do NOT repeat those topics.

Return 2-4 questions that target genuinely load-bearing ambiguities
SPECIFIC to this idea — decisions that would change what gets built.
Skip anything cosmetic or answerable by a sensible default.

Return ONLY a JSON array in this exact shape, no prose outside it:
[{"q": "the question", "hint": "one-line example answer"}]

RAW IDEA:
${idea}`;
}

export function enhancePrompt(opts: {
  profile: string;
  idea: string;
  answers: Answer[];
}): string {
  const answered = opts.answers
    .filter((a) => a.value.trim().length > 0)
    .map((a) => `- ${a.label}: ${a.value.trim()}`)
    .join("\n");
  const skipped = opts.answers
    .filter((a) => a.value.trim().length === 0)
    .map((a) => `- ${a.label}`)
    .join("\n");

  return `You rewrite raw project ideas into precise, personal prompts for an AI
coding agent (usually Claude Code). You are a prompt engineer, not a
builder — output the prompt and nothing else.

RULES
- Preserve the user's intent exactly. Never add features, scope, or
  tech the user did not ask for.
- Concrete beats vague: replace adjectives like "nice" or "modern" with
  the specific choices found in the profile and answers.
- The tech section is law: reproduce pinned versions verbatim, forbid
  substitutions, and include the instruction to consult current docs
  when the user enabled it.
- Unanswered questions go into <open_decisions> as explicit choices for
  the builder to raise — never silently decide them yourself.
- Write in second person, addressed to the builder AI.
- Output ONLY the enhanced prompt in this structure (plain text with
  these XML-style section tags, no markdown fences around it):

<context>       what this is, who it's for, why it exists
<task>          what to build, precisely scoped
<design_language>  from the profile + answers (palette, type, shape, density, voice)
<tech_constraints> pinned stack, versions, doc-consultation instruction, forbidden substitutions
<working_agreements> honesty rules, scope discipline, verification habits from the profile
<open_decisions>   unanswered questions, stated as decisions to surface
<verification>     how the builder should prove it works

INPUTS

[user profile — apply this taste everywhere the answers don't override it]
${opts.profile}

[raw idea]
${opts.idea}

[answers]
${answered || "(none provided)"}

[skipped questions — these become <open_decisions>]
${skipped || "(none)"}`;
}

/** Leniently pull the first JSON array out of model output. */
export function parseQuestions(
  raw: string
): { q: string; hint?: string }[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is { q: string; hint?: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof item.q === "string" &&
          item.q.trim().length > 0
      )
      .slice(0, 4)
      .map((item) => ({
        q: item.q.trim(),
        hint: typeof item.hint === "string" ? item.hint.trim() : undefined,
      }));
  } catch {
    return [];
  }
}
