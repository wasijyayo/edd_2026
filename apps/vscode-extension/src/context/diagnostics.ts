/** VS Code の Position と互換な、比較に必要な最小の座標。 */
interface PositionLike {
  line: number;
  character: number;
}

/** VS Code の Range と互換な、比較に必要な最小の範囲。 */
interface RangeLike {
  start: PositionLike;
  end: PositionLike;
}

function comparePositions(left: PositionLike, right: PositionLike): number {
  if (left.line !== right.line) {
    return left.line - right.line;
  }
  return left.character - right.character;
}

/**
 * 2つの範囲に空でない共通部分があるか判定する。
 *
 * 終端だけが接する場合は、ユーザーがそのDiagnosticを選択していないため false にする。
 */
export function rangesOverlap(left: RangeLike, right: RangeLike): boolean {
  return comparePositions(left.start, right.end) < 0 && comparePositions(right.start, left.end) < 0;
}
