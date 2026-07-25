// Thin LLM wrapper for script/concept generation. Uses the OpenAI API (the
// key the pipeline already depends on); the model is swappable via LLM_MODEL.
// Responses are requested as JSON, validated with zod, and retried once with
// the validation errors fed back to the model.

import OpenAI from 'openai';
import type {ZodType} from 'zod';

export const llmModel = () => process.env.LLM_MODEL ?? 'gpt-5.1';

const client = () => new OpenAI({apiKey: process.env.OPENAI_API_KEY});

const requestJson = async (system: string, user: string): Promise<string> => {
  const response = await client().chat.completions.create({
    model: llmModel(),
    messages: [
      {role: 'system', content: system},
      {role: 'user', content: user},
    ],
    response_format: {type: 'json_object'},
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('LLM returned an empty response.');
  return content;
};

export const generateStructured = async <T>(options: {system: string; user: string; schema: ZodType<T>}): Promise<T> => {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for concept generation.');

  let raw = await requestJson(options.system, options.user);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    const result = parsed === undefined ? undefined : options.schema.safeParse(parsed);
    if (result?.success) return result.data;

    const issues =
      result && !result.success
        ? result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')
        : 'Response was not valid JSON.';
    if (attempt === 1) {
      throw new Error(`LLM output failed validation after retry:\n${issues}`);
    }
    raw = await requestJson(
      options.system,
      `${options.user}\n\nYour previous attempt failed validation with these errors — return corrected JSON only:\n${issues}\n\nPrevious attempt:\n${raw}`,
    );
  }
  throw new Error('unreachable');
};
