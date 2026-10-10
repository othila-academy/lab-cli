#!/usr/bin/env node
// Point d'entrée du binaire lab. Dans un dépôt de cours : npx lab <commande>, ou npm run lab -- <commande>.
import { main } from '../src/cli.mjs';

process.exitCode = await main(process.argv.slice(2));
