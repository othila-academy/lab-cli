// Entrées/sorties capturées : les commandes écrivent dans `lines`, les questions reçoivent `answers` dans l'ordre.
export function captureIo(answers = []) {
  const lines = [];
  const errors = [];
  return {
    out: (line) => lines.push(String(line)),
    err: (line) => errors.push(String(line)),
    question: async () => answers.shift() ?? '',
    lines,
    errors
  };
}
