/**
 * Action refusée par les règles du jeu (mauvais joueur, coup interdit, phase terminée…).
 * Le serveur la renverra au client ; `code` permet à l'interface d'afficher un message traduit.
 */
export class IllegalActionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IllegalActionError";
  }
}
