export function checkWinFromCell(board, row, col, playerId) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  return directions.some(([dr, dc]) => {
    let count = 1;
    count += countDirection(board, row, col, dr, dc, playerId);
    count += countDirection(board, row, col, -dr, -dc, playerId);
    return count >= 4;
  });
}

export function isBoardFull(board) {
  return board[0].every((cell) => cell !== 0);
}

function countDirection(board, row, col, dr, dc, playerId) {
  let r = row + dr;
  let c = col + dc;
  let count = 0;

  while (
    r >= 0 &&
    r < board.length &&
    c >= 0 &&
    c < board[0].length &&
    board[r][c] === playerId
  ) {
    count += 1;
    r += dr;
    c += dc;
  }

  return count;
}
