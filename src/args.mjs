// Analyse minimale : `lab <commande> [positionnels] [--option valeur] [--drapeau]`.
// Volontairement minimale et sans util.parseArgs : le format des options est le nôtre, sur toutes les versions de Node.
const BOOLEAN_FLAGS = new Set(['json', 'no-report', 'help', 'keep', 'force', 'publish', 'terminal', 'yes']);

export function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (BOOLEAN_FLAGS.has(name) || next === undefined || next.startsWith('--')) {
        flags[name] = true;
      } else {
        flags[name] = next;
        i += 1;
      }
      continue;
    }
    positionals.push(arg);
  }
  const [command, ...rest] = positionals;
  return { command, positionals: rest, flags };
}
