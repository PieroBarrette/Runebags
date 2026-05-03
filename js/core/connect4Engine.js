export function createEmptyBoard(rows = 6, columns = 7) {
  return Array.from({ length: rows }, () => Array(columns).fill(0));
}

export function getAvailableColumns(board, blockedColumns = []) {
  const blocked = new Set(blockedColumns);
  const columns = [];

  for (let col = 0; col < board[0].length; col += 1) {
    if (!blocked.has(col) && board[0][col] === 0) {
      columns.push(col);
    }
  }

  return columns;
}

export function dropToken(board, column, playerId) {
  if (column < 0 || column >= board[0].length) {
    return null;
  }

  for (let row = board.length - 1; row >= 0; row -= 1) {
    if (board[row][column] === 0) {
      board[row][column] = playerId;
      return { row, col: column };
    }
  }

  return null;
}
