/**
 * Formula renderer — turns compact notation into real typeset mathematics.
 *
 *   "FV = PV(1 + r)^n"        renders with a true raised exponent
 *   "APY = (1 + APR/n)^n − 1"  renders with a horizontal fraction bar
 *
 * Output is MathML, which every current browser renders natively. That means
 * no library, no webfonts, no network, and correct typesetting in Safari —
 * which is where this app is actually used. KaTeX would pull ~270 KB plus
 * font files to do the same job.
 *
 * The parser is a standard tokenizer plus precedence climbing. Exponents and
 * subscripts are handled as postfix operators rather than binary ones, so
 * that in `PV(1 + r)^n` the exponent attaches to `(1 + r)` and not to the
 * whole product.
 *
 * All identifiers are XML-escaped on the way out. Input here is authored in
 * this repo rather than typed by a user, but a renderer that only happens to
 * be safe is not safe.
 */

// ─── Tokenizer ───────────────────────────────────────────────────────────────

type TokenKind = "num" | "ident" | "op" | "lparen" | "rparen" | "caret" | "under" | "comma";
type Token = { kind: TokenKind; text: string };

/** Operators, mapped to the glyph that should actually be displayed. */
const OPERATORS: Record<string, string> = {
  "+": "+",
  "-": "−", // proper minus, not a hyphen
  "−": "−",
  "*": "×",
  "×": "×",
  "·": "·", // middle-dot product (common in WHOOP / science notation)
  "÷": "÷",
  "=": "=",
  "≈": "≈",
  "<": "<",
  ">": ">",
  "≤": "≤",
  "≥": "≥",
};

const FUNCTIONS = new Set(["ln", "log", "exp", "min", "max", "abs"]);

function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i += 1; continue; }

    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j += 1;
      out.push({ kind: "num", text: input.slice(i, j) });
      i = j;
      continue;
    }
    // Identifiers may be multi-letter (FV, APR, CF), Greek (Δ, μ, σ), and may carry a %.
    if (/[A-Za-zΣ√Δδμσραλβε]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z]/.test(input[j])) j += 1;
      // Σ and √ stay single-character operators; other Greek may glue to letters (ΔT).
      if (j === i) {
        j = i + 1;
        if (ch !== "Σ" && ch !== "√") {
          while (j < input.length && /[A-Za-z]/.test(input[j])) j += 1;
        }
      }
      let text = input.slice(i, j);
      if (input[j] === "%") { text += "%"; j += 1; }
      // SpO2-style trailing digits stay on the name (before a real subscript _).
      if (/[A-Za-z%]/.test(text[text.length - 1] || "") === false) {
        /* ends with digit already or symbol */
      } else if (/[0-9]/.test(input[j] || "")) {
        let k = j;
        while (k < input.length && /[0-9]/.test(input[k])) k += 1;
        text += input.slice(j, k);
        j = k;
        if (input[j] === "%") { text += "%"; j += 1; }
      }
      out.push({ kind: "ident", text });
      i = j;
      continue;
    }
    if (ch === "(") { out.push({ kind: "lparen", text: ch }); i += 1; continue; }
    if (ch === ")") { out.push({ kind: "rparen", text: ch }); i += 1; continue; }
    if (ch === "^") { out.push({ kind: "caret", text: ch }); i += 1; continue; }
    if (ch === "_") { out.push({ kind: "under", text: ch }); i += 1; continue; }
    if (ch === ",") { out.push({ kind: "comma", text: ch }); i += 1; continue; }
    if (ch === "/") { out.push({ kind: "op", text: "/" }); i += 1; continue; }
    if (ch in OPERATORS) { out.push({ kind: "op", text: ch }); i += 1; continue; }

    // Unknown character: emit it as a literal operator rather than failing.
    out.push({ kind: "op", text: ch });
    i += 1;
  }
  return out;
}

// ─── Parser → MathML ─────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Binary precedence. `/` is a fraction and binds like multiplication. */
function precedenceOf(op: string): number {
  if (op === "=" || op === "≈" || op === "<" || op === ">" || op === "≤" || op === "≥") return 1;
  if (op === "+" || op === "-" || op === "−") return 2;
  if (op === "*" || op === "×" || op === "·" || op === "÷" || op === "/") return 3;
  return 0;
}

class Parser {
  private pos = 0;
  private tokens: Token[];

  // Written as an explicit field rather than a parameter property: Node's
  // type-stripping loader, which the test harness uses, cannot handle those.
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | null {
    return this.tokens[this.pos] ?? null;
  }
  private next(): Token | null {
    const t = this.tokens[this.pos] ?? null;
    this.pos += 1;
    return t;
  }

  parse(): string {
    const body = this.parseExpr(0);
    return body || "<mrow></mrow>";
  }

  /** Precedence climbing over binary operators, with implicit multiplication. */
  private parseExpr(minPrec: number): string {
    let left = this.parseUnary();

    for (;;) {
      const t = this.peek();
      if (!t) break;

      // Function argument lists: min(100, x) — comma is lower than every math op.
      if (t.kind === "comma") {
        if (minPrec > 0) break;
        this.next();
        const right = this.parseExpr(0);
        left = `${left}<mo>,</mo>${right}`;
        continue;
      }

      if (t.kind === "op") {
        const prec = precedenceOf(t.text);
        if (prec === 0 || prec < minPrec) break;
        this.next();
        if (t.text === "/") {
          // A fraction stacks its operands, so the right side binds tightly.
          // parseExpr(4) keeps chained × / · on the numerator/denominator out of the bar.
          const right = this.parseExpr(4);
          left = `<mfrac>${wrap(stripGroupingParens(left))}${wrap(stripGroupingParens(right))}</mfrac>`;
          continue;
        }
        const right = this.parseExpr(prec + 1);
        left = `${left}<mo>${esc(OPERATORS[t.text] ?? t.text)}</mo>${right}`;
        continue;
      }

      // Juxtaposition is multiplication: PV(1 + r), 2n.
      if ((t.kind === "ident" || t.kind === "num" || t.kind === "lparen") && minPrec <= 3) {
        const right = this.parseExpr(4);
        left = `${left}<mo>⁢</mo>${right}`;
        continue;
      }
      break;
    }
    return left;
  }

  private parseUnary(): string {
    const t = this.peek();
    if (t && t.kind === "op" && (t.text === "-" || t.text === "−" || t.text === "+")) {
      this.next();
      const operand = this.parseUnary();
      return `<mo>${esc(OPERATORS[t.text])}</mo>${operand}`;
    }
    return this.parsePostfix();
  }

  /**
   * Exponents and subscripts attach to the atom immediately before them,
   * which is what makes `PV(1 + r)^n` raise only `(1 + r)`.
   */
  private parsePostfix(): string {
    let base = this.parseAtom();
    let sub: string | null = null;
    let sup: string | null = null;

    for (;;) {
      const t = this.peek();
      if (t?.kind === "under") {
        this.next();
        // Chained subscripts: sleep_need_min → ((sleep)_need)_min
        // (plain overwrite would drop earlier levels and look broken).
        if (sub !== null) {
          base = `<msub>${wrap(base)}${wrap(sub)}</msub>`;
          sub = null;
        }
        sub = stripGroupingParens(this.parseAtom());
        continue;
      }
      if (t?.kind === "caret") {
        this.next();
        sup = stripGroupingParens(this.parseUnary());
        continue;
      }
      break;
    }

    const isBigOperator = base.includes("∑");
    if (sub !== null && sup !== null) {
      // Sums read correctly with limits above and below, as written by hand.
      return isBigOperator
        ? `<munderover>${wrap(base)}${wrap(sub)}${wrap(sup)}</munderover>`
        : `<msubsup>${wrap(base)}${wrap(sub)}${wrap(sup)}</msubsup>`;
    }
    if (sub !== null) return `<msub>${wrap(base)}${wrap(sub)}</msub>`;
    if (sup !== null) return `<msup>${wrap(base)}${wrap(sup)}</msup>`;
    return base;
  }

  private parseAtom(): string {
    const t = this.next();
    if (!t) return "";

    if (t.kind === "num") return `<mn>${esc(t.text)}</mn>`;

    if (t.kind === "ident") {
      if (t.text === "Σ") return `<mo>∑</mo>`;
      if (t.text === "√") {
        const operand = this.parseAtom();
        return `<msqrt>${wrap(operand)}</msqrt>`;
      }
      if (FUNCTIONS.has(t.text.toLowerCase()) && this.peek()?.kind === "lparen") {
        const arg = this.parseAtom(); // consumes the parenthesised group
        return `<mi>${esc(t.text)}</mi><mo>⁡</mo>${arg}`;
      }
      // Multi-letter names are upright; single letters are italic variables.
      const style = t.text.replace("%", "").length > 1 ? ' mathvariant="normal"' : "";
      return `<mi${style}>${esc(t.text)}</mi>`;
    }

    if (t.kind === "lparen") {
      const inner = this.parseExpr(0);
      if (this.peek()?.kind === "rparen") this.next();
      return `<mrow><mo>(</mo>${inner}<mo>)</mo></mrow>`;
    }

    if (t.kind === "comma") return `<mo>,</mo>`;
    if (t.kind === "rparen") return "";

    return `<mo>${esc(OPERATORS[t.text] ?? t.text)}</mo>`;
  }
}

/**
 * MathML containers take exactly one child, so anything that is a sequence of
 * sibling elements has to be grouped. Counting depth is what makes this
 * correct — a regex cannot tell `<mrow>a</mrow><mo>+</mo>` (two siblings)
 * from `<mrow>a<mo>+</mo>b</mrow>` (one).
 */
function isSingleElement(fragment: string): boolean {
  const tag = /<(\/?)([a-z]+)\b[^>]*>/g;
  let depth = 0;
  let topLevel = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(fragment)) !== null) {
    if (match[1] === "/") {
      depth -= 1;
      continue;
    }
    if (depth === 0) topLevel += 1;
    depth += 1;
    // Elements here are never self-closing, so no special case is needed.
  }
  return topLevel === 1;
}

function wrap(fragment: string): string {
  if (!fragment) return "<mrow></mrow>";
  return isSingleElement(fragment) ? fragment : `<mrow>${fragment}</mrow>`;
}

const PAREN_OPEN = "<mrow><mo>(</mo>";
const PAREN_CLOSE = "<mo>)</mo></mrow>";

/**
 * Drop parentheses that only existed to group an operand.
 *
 * `(P × r)/(1 − x)` is written with parens because the notation is linear,
 * but once it is stacked over a fraction bar the bar does the grouping, and
 * a person writing it by hand would not draw them. Same for an exponent:
 * `(1 + r)^(−n)` has the exponent as `−n`, not `(−n)`.
 */
function stripGroupingParens(fragment: string): string {
  if (!fragment.startsWith(PAREN_OPEN) || !fragment.endsWith(PAREN_CLOSE)) return fragment;
  const inner = fragment.slice(PAREN_OPEN.length, fragment.length - PAREN_CLOSE.length);
  // Only safe when those two parens actually matched each other.
  let depth = 1;
  const tag = /<(\/?)mrow\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(inner)) !== null) {
    depth += match[1] === "/" ? -1 : 1;
    if (depth === 0) return fragment;
  }
  return inner;
}

/**
 * Render a formula to a MathML string.
 *
 * Notation:
 *   ^        exponent            (1 + r)^n
 *   _        subscript           CF_t
 *   /        stacked fraction    P/(1 − x)
 *   ÷ ×      division / times shown as operators
 *   Σ        summation, with _ and ^ becoming limits
 *   √        square root
 *   ln log   rendered upright as functions
 */
export function renderFormula(source: string): string {
  const parsed = new Parser(tokenize(source)).parse();
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${parsed}</math>`;
}

/** Plain-text fallback, for contexts that cannot render markup. */
export function formulaToText(source: string): string {
  return source.replace(/\s+/g, " ").trim();
}
