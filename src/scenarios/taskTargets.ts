// W1.d (§18) — task.targets filter expression parser (mvp).
//
// 시나리오의 `task.targets` (예: `"truss==3 && (diameterMm<12 || occlusion>0.4)"`)를
// 간이 evaluator로 변환. 객체에 대해 boolean 반환.
//
// mvp 지원 연산자: ==, !=, <, <=, >, >=, &&, ||, !
// 식별자: truss, fruit, diameterMm, occlusion, rank, nodeIdx, leafYellowing,
//        windFlow, leafDensity, isSideShoot, budState, parentAxisIdx,
//        bed, node, visible_fraction
//
// 안전성: eval 없이 자체 토크나이저 + 재귀 하강 파서. 알 수 없는 식별자는 0/false.
//
// Edge case: 시나리오 metadata가 자유 텍스트라 정확한 측정 불가. mvp는 단순 문자열
// 파싱 + 평가만. 실 메트릭 측정은 W1.e (metrics.ts)에서 별도.

export type TargetContext = Record<string, number | string | boolean>;

interface Token {
  type: 'num' | 'id' | 'str' | 'op' | 'paren-open' | 'paren-close';
  value: string;
  pos: number;
}

const OP_CHARS = '!<>=&|';

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ type: 'paren-open', value: '(', pos: i });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: 'paren-close', value: ')', pos: i });
      i++;
      continue;
    }
    // 숫자
    if ((c >= '0' && c <= '9') || (c === '-' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      tokens.push({ type: 'num', value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }
    // 문자열 리터럴 'foo'
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < input.length && input[j] !== c) j++;
      tokens.push({ type: 'str', value: input.slice(i + 1, j), pos: i });
      i = j + 1;
      continue;
    }
    // 식별자
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
      tokens.push({ type: 'id', value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }
    // 연산자
    if (OP_CHARS.includes(c)) {
      let j = i + 1;
      while (j < input.length && OP_CHARS.includes(input[j])) j++;
      tokens.push({ type: 'op', value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }
    // 알 수 없는 문자 — skip
    i++;
  }
  return tokens;
}

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'id'; value: string }
  | { kind: 'binop'; op: string; left: Node; right: Node }
  | { kind: 'unop'; op: string; operand: Node };

interface Parser {
  tokens: Token[];
  pos: number;
}

function peek(p: Parser): Token | null {
  return p.tokens[p.pos] ?? null;
}
function consume(p: Parser): Token | null {
  return p.tokens[p.pos++] ?? null;
}

// 우선순위: || < && < !=,== < <,<=,>,>= < unary !
function parseOr(p: Parser): Node {
  let left = parseAnd(p);
  while (peek(p)?.value === '||') {
    consume(p);
    const right = parseAnd(p);
    left = { kind: 'binop', op: '||', left, right };
  }
  return left;
}
function parseAnd(p: Parser): Node {
  let left = parseEq(p);
  while (peek(p)?.value === '&&') {
    consume(p);
    const right = parseEq(p);
    left = { kind: 'binop', op: '&&', left, right };
  }
  return left;
}
function parseEq(p: Parser): Node {
  let left = parseRel(p);
  const t = peek(p);
  if (t && (t.value === '==' || t.value === '!=')) {
    consume(p);
    const right = parseRel(p);
    left = { kind: 'binop', op: t.value, left, right };
  }
  return left;
}
function parseRel(p: Parser): Node {
  let left = parseUnary(p);
  const t = peek(p);
  if (t && (t.value === '<' || t.value === '<=' || t.value === '>' || t.value === '>=')) {
    consume(p);
    const right = parseUnary(p);
    left = { kind: 'binop', op: t.value, left, right };
  }
  return left;
}
function parseUnary(p: Parser): Node {
  const t = peek(p);
  if (t?.value === '!') {
    consume(p);
    return { kind: 'unop', op: '!', operand: parseUnary(p) };
  }
  return parsePrimary(p);
}
function parsePrimary(p: Parser): Node {
  const t = consume(p);
  if (!t) return { kind: 'num', value: 0 };
  if (t.type === 'paren-open') {
    const node = parseOr(p);
    consume(p); // consume ')'
    return node;
  }
  if (t.type === 'num') return { kind: 'num', value: Number(t.value) };
  if (t.type === 'str') return { kind: 'str', value: t.value };
  if (t.type === 'id') {
    // true/false literals
    if (t.value === 'true') return { kind: 'num', value: 1 };
    if (t.value === 'false') return { kind: 'num', value: 0 };
    return { kind: 'id', value: t.value };
  }
  return { kind: 'num', value: 0 };
}

function evalNode(node: Node, ctx: TargetContext): number | string | boolean {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'str':
      return node.value;
    case 'id': {
      const v = ctx[node.value];
      return v ?? 0;
    }
    case 'unop': {
      const o = evalNode(node.operand, ctx);
      if (node.op === '!') return !o;
      return 0;
    }
    case 'binop': {
      const l = evalNode(node.left, ctx);
      const r = evalNode(node.right, ctx);
      switch (node.op) {
        case '&&':
          return Boolean(l) && Boolean(r);
        case '||':
          return Boolean(l) || Boolean(r);
        case '==':
          // eslint-disable-next-line eqeqeq
          return l == r;
        case '!=':
          // eslint-disable-next-line eqeqeq
          return l != r;
        case '<':
          return Number(l) < Number(r);
        case '<=':
          return Number(l) <= Number(r);
        case '>':
          return Number(l) > Number(r);
        case '>=':
          return Number(l) >= Number(r);
      }
      return 0;
    }
  }
}

/**
 * Compile a target expression once. Returns evaluator function.
 *
 * @example
 *   const f = compileTargetExpr("truss==3 && diameterMm<12");
 *   f({ truss: 3, diameterMm: 10 }); // true
 *   f({ truss: 2, diameterMm: 10 }); // false
 */
export function compileTargetExpr(
  expression: string,
): (ctx: TargetContext) => boolean {
  const tokens = tokenize(expression);
  const parser: Parser = { tokens, pos: 0 };
  const ast = parseOr(parser);
  return (ctx: TargetContext) => {
    const v = evalNode(ast, ctx);
    return Boolean(v);
  };
}

/** One-shot evaluation. */
export function evaluateTarget(expression: string, ctx: TargetContext): boolean {
  return compileTargetExpr(expression)(ctx);
}
