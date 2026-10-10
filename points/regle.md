# La règle des points

Chaque étape d'un lab rapporte des points, sans classement : chaque apprenant ne voit que les siens, et le formateur les lit dans le détail d'un apprenant et dans les exports de session.

- **Valeur d'une étape** : le module d'étape peut exporter `points`, un entier de 1 à 1000. Sans export, l'étape vaut 100.
- **Étape acquise** : à la première explication soumise (`answer.submitted`) alors que l'étape est verte, c'est-à-dire que son dernier check (`check.completed`) n'a aucun échec. Une soumission faite en échec n'acquiert rien ; un check où le serveur de l'apprenant était injoignable compte comme un échec.
- **Points d'une étape acquise** : `floor(valeur × (100 − malus) / 100)`, où le malus dépend du plus haut niveau d'indice révélé avant l'acquisition : 0 % sans indice, 10 % au niveau 1, 25 % au niveau 2, 50 % au niveau 3. Une étape non acquise vaut 0.
- **Points figés** : un indice révélé après l'acquisition ne change rien.
- **Totaux** : un lab additionne ses étapes, une formation ou une session ses labs, toujours affichés sur leur maximum (`240 / 300`).

La règle se déduit des évènements du contrat (`check.completed`, `hint.revealed`, `answer.submitted`) sans le modifier. Les exemples de [`exemples.json`](exemples.json) sont joués par les tests de ce paquet et par ceux du serveur othila-lab : un écart entre les deux calculs fait échouer une suite.
