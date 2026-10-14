// Le carnet du tutoriel, dans le bac à sable de l'apprenant (.othila-lab/local/prise-en-main/, jamais commité).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sandboxDir } from '../../src/config.mjs';

export const carnetPath = () => path.join(sandboxDir('prise-en-main'), 'carnet.json');

// Le texte du carnet, sans BOM (un éditeur Windows en ajoute un) ; un carnet absent oriente vers lab start.
export function carnetText() {
  let text;
  try {
    text = readFileSync(carnetPath(), 'utf8');
  } catch {
    throw new Error("pas de carnet : lance d'abord npx lab start prise-en-main");
  }
  return text.replace(/^﻿/, '');
}

// L'endroit d'une erreur JSON : Node donne « (line L column C) » ; sinon la position, convertie.
export function errorPlace(text, error) {
  const lc = /line (\d+) column (\d+)/.exec(error.message);
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) };
  const pos = /position (\d+)/.exec(error.message);
  if (!pos) return null;
  const before = text.slice(0, Number(pos[1])).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

const UNREADABLE = "le carnet ne se lit pas encore : répare d'abord le carnet (npx lab check prise-en-main reparer)";

// Le carnet lu ; illisible, le message renvoie à l'étape reparer, ou celui donné par l'étape elle-même.
export function readCarnet(unreadable = UNREADABLE) {
  const text = carnetText();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(unreadable);
  }
}
