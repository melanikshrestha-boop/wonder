export type BooksTheme = "light" | "dark";
export type ReadingFont = "literary" | "classic" | "bookish" | "modern";

export type BooksPreferences = {
  theme: BooksTheme;
  font: ReadingFont;
};

export const READING_FONT_OPTIONS: Array<{
  id: ReadingFont;
  label: string;
  description: string;
  stack: string;
}> = [
  {
    id: "literary",
    label: "Literary",
    description: "Soft, editorial serif",
    stack: '"Source Serif 4", Georgia, "Times New Roman", ui-serif, serif',
  },
  {
    id: "classic",
    label: "Classic",
    description: "Familiar book serif",
    stack: 'Georgia, "Times New Roman", serif',
  },
  {
    id: "bookish",
    label: "Bookish",
    description: "Warm old-style serif",
    stack:
      '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", serif',
  },
  {
    id: "modern",
    label: "Modern",
    description: "Clean, relaxed sans",
    stack:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
];

const BOOKS_PREFERENCES_KEY = "wonder-bookshelf-preferences-v1";

function defaultTheme(): BooksTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("theme-light")
    ? "light"
    : "dark";
}

export function loadBooksPreferences(): BooksPreferences {
  const fallback: BooksPreferences = {
    theme: defaultTheme(),
    font: "literary",
  };
  try {
    const raw = localStorage.getItem(BOOKS_PREFERENCES_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<BooksPreferences>;
    return {
      theme:
        parsed.theme === "light" || parsed.theme === "dark"
          ? parsed.theme
          : fallback.theme,
      font: READING_FONT_OPTIONS.some((option) => option.id === parsed.font)
        ? (parsed.font as ReadingFont)
        : fallback.font,
    };
  } catch {
    return fallback;
  }
}

export function saveBooksPreferences(preferences: BooksPreferences) {
  try {
    localStorage.setItem(BOOKS_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    /* Reading preferences stay live even when storage is unavailable. */
  }
}

export function readingFontStack(font: ReadingFont): string {
  return (
    READING_FONT_OPTIONS.find((option) => option.id === font)?.stack ||
    READING_FONT_OPTIONS[0].stack
  );
}
