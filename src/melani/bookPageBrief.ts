export type BookPageBrief = {
  heading: string;
  takeaways: string[];
  action: string | null;
  sourceWords: number;
};

const IDEA_WORDS =
  /\b(because|therefore|means|important|key|lesson|idea|reason|result|however|instead|ultimately|remember|understand|learn|fear|habit|money|work|build|create|change)\b/i;
const ACTION_WORDS =
  /\b(should|must|need to|start|stop|choose|write|practice|apply|ask|notice|track|focus|decide|use|avoid|keep|try|remember)\b/i;

function cleanSentence(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * An honest, instant page brief: every takeaway is lifted from the visible
 * text instead of inventing an AI interpretation when no model is available.
 */
export function buildBookPageBrief(
  rawText: string,
  heading = "Current page"
): BookPageBrief {
  const text = rawText.replace(/\s+/g, " ").trim();
  const sourceWords = text ? text.split(/\s+/).length : 0;
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z“"'])/)
    .map(cleanSentence)
    .filter((sentence) => sentence.length >= 38 && sentence.length <= 360);

  const ranked = sentences
    .map((sentence, index) => {
      const lengthScore =
        sentence.length >= 70 && sentence.length <= 220 ? 2 : 0;
      const ideaScore = IDEA_WORDS.test(sentence) ? 3 : 0;
      const actionScore = ACTION_WORDS.test(sentence) ? 1 : 0;
      const positionScore = index < Math.max(2, sentences.length * 0.25) ? 1 : 0;
      return {
        sentence,
        index,
        score: lengthScore + ideaScore + actionScore + positionScore,
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const seen = new Set<string>();
  const takeaways: string[] = [];
  for (const candidate of ranked) {
    const key = sentenceKey(candidate.sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    takeaways.push(candidate.sentence);
    if (takeaways.length === 4) break;
  }

  const action =
    ranked.find((candidate) => ACTION_WORDS.test(candidate.sentence))?.sentence ||
    null;

  return {
    heading: heading.trim() || "Current page",
    takeaways,
    action,
    sourceWords,
  };
}
