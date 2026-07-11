// Safe arithmetic evaluator for auto-calc field expressions (e.g. "f17+f18+f19", "f161/f160*100").
// Deliberately avoids eval()/Function() — the original app used a raw eval() over
// string-substituted values, which is fine for its 6 fixed formulas but not something
// to carry into a rewrite. This is a small recursive-descent parser over +, -, *, /, (, ).

type TokenType = "num" | "ident" | "op" | "lparen" | "rparen";
interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      tokens.push({ type: "num", value: expr.slice(i, j) });
      i = j;
    } else if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++;
      tokens.push({ type: "ident", value: expr.slice(i, j) });
      i = j;
    } else if (c === "(") {
      tokens.push({ type: "lparen", value: c });
      i++;
    } else if (c === ")") {
      tokens.push({ type: "rparen", value: c });
      i++;
    } else if ("+-*/".includes(c)) {
      tokens.push({ type: "op", value: c });
      i++;
    } else {
      throw new Error(`Unexpected character in auto-calc expression: ${c}`);
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private values: Record<string, number | null>) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  parseExpression(): number | null {
    let value = this.parseTerm();
    while (this.peek()?.type === "op" && (this.peek()!.value === "+" || this.peek()!.value === "-")) {
      const op = this.next().value;
      const rhs = this.parseTerm();
      if (value === null || rhs === null) return null;
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseTerm(): number | null {
    let value = this.parseFactor();
    while (this.peek()?.type === "op" && (this.peek()!.value === "*" || this.peek()!.value === "/")) {
      const op = this.next().value;
      const rhs = this.parseFactor();
      if (value === null || rhs === null) return null;
      if (op === "/") {
        if (rhs === 0) return null; // division by zero -> blank, matches original behavior
        value = value / rhs;
      } else {
        value = value * rhs;
      }
    }
    return value;
  }

  private parseFactor(): number | null {
    const t = this.next();
    if (!t) throw new Error("Unexpected end of auto-calc expression");
    if (t.type === "num") return parseFloat(t.value);
    if (t.type === "ident") {
      const v = this.values[t.value];
      return v === undefined || v === null || Number.isNaN(v) ? null : v;
    }
    if (t.type === "lparen") {
      const value = this.parseExpression();
      if (this.peek()?.type !== "rparen") throw new Error("Expected closing parenthesis");
      this.next();
      return value;
    }
    throw new Error(`Unexpected token in auto-calc expression: ${t.value}`);
  }
}

/** Evaluates an auto-calc expression against a map of field values. Returns null if any
 * referenced field is missing/blank or the expression divides by zero, matching the
 * original app's "blank on error" behavior rather than throwing to the user. */
export function evaluateAutoCalc(expr: string, values: Record<string, string | number | null | undefined>): number | null {
  const numericValues: Record<string, number | null> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (raw === undefined || raw === null || raw === "") {
      numericValues[key] = null;
    } else {
      const n = typeof raw === "number" ? raw : parseFloat(raw);
      numericValues[key] = Number.isNaN(n) ? null : n;
    }
  }
  try {
    const tokens = tokenize(expr);
    return new Parser(tokens, numericValues).parseExpression();
  } catch {
    return null;
  }
}
