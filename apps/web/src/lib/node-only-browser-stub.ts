function nodeOnly(): never {
  throw new Error('This Node.js-only API is unavailable in the browser.');
}

export const readFile = nodeOnly;
export const fileURLToPath = nodeOnly;
