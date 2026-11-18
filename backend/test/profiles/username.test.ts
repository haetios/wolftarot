import { describe, expect, it } from "vitest";

import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  checkUsername,
  isValidUsername,
  normalizeUsername,
} from "../../src/profiles/username.js";

describe("pseudo : règles de forme", () => {
  it("accepte lettres, chiffres, _ et -, de 3 à 20 caractères", () => {
    for (const name of [
      "Alice",
      "bob",
      "x_y",
      "Jean-Pierre",
      "joueur_42",
      "R2D2",
      "007",
      "a-b_c",
    ]) {
      expect(isValidUsername(name), name).toBe(true);
    }
    expect(isValidUsername("x".repeat(USERNAME_MIN_LENGTH))).toBe(true);
    expect(isValidUsername("x".repeat(USERNAME_MAX_LENGTH))).toBe(true);
  });

  it("accepte les accents du français (lettres précomposées)", () => {
    for (const name of ["Hélène", "François", "Noël", "Cœur", "ŒUVRE", "Ÿves", "Zoé", "Ångström"]) {
      expect(isValidUsername(name), name).toBe(true);
    }
  });

  it("refuse une longueur hors limites (comptée en caractères)", () => {
    expect(checkUsername("ab")).toEqual({ ok: false, error: "tooShort" });
    expect(checkUsername("")).toEqual({ ok: false, error: "tooShort" });
    expect(checkUsername("x".repeat(USERNAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: "tooLong",
    });
    // 20 lettres accentuées : 20 caractères, valide.
    expect(isValidUsername("é".repeat(20))).toBe(true);
  });

  it("refuse les espaces et la ponctuation", () => {
    for (const name of ["Jean Pierre", "a.b.c", "alice!", "a@b.fr", "x/y", "<script>", "a'b"]) {
      expect(checkUsername(name), name).toEqual({ ok: false, error: "invalidCharacter" });
    }
  });

  it("refuse les caractères invisibles ou trompeurs", () => {
    const tricky = [
      "Ali‮ce", // U+202E : inversion du sens d'écriture
      "Ali‭ce", // U+202D : forçage gauche-droite
      "Ali​ce", // espace de largeur nulle
      "Ali‌ce", // antiliant sans chasse
      "Ali‍ce", // liant sans chasse
      "Ali⁠ce", // gluon de mots
      "Ali﻿ce", // espace insécable de largeur nulle (BOM)
      "Ali­ce", // trait d'union conditionnel (invisible)
      "Ali ce", // espace insécable
      "Ali　ce", // espace idéographique
      "Аlice", // « А » cyrillique, identique au « A » latin
      "Alicе", // « е » cyrillique
      "Αlice", // « Α » grec
      "Ａlice", // « Ａ » pleine chasse
      "Alice🃏", // emoji
      "Ali\u0000ce", // caractère de contrôle
      "Ali\tce",
    ];
    for (const name of tricky) {
      expect(isValidUsername(name), JSON.stringify(name)).toBe(false);
      expect(checkUsername(name).ok, JSON.stringify(name)).toBe(false);
    }
  });

  it("refuse un accent combinant non normalisé, mais la saisie est normalisée en NFC", () => {
    const decomposed = "Hélène"; // « Hélène » tapé avec des accents combinants
    expect(isValidUsername(decomposed)).toBe(false);
    expect(normalizeUsername(decomposed)).toBe("Hélène");
    expect(checkUsername(decomposed)).toEqual({ ok: true, username: "Hélène" });
    // Un accent combinant seul, sans lettre à composer, reste refusé.
    expect(checkUsername("Alicé́").ok).toBe(false);
  });

  it("le pseudo commence et finit par une lettre ou un chiffre", () => {
    for (const name of ["_alice", "alice_", "-bob", "bob-", "___"]) {
      expect(checkUsername(name), name).toEqual({ ok: false, error: "invalidEdge" });
    }
  });

  it("normalise la saisie : blancs de bord retirés", () => {
    expect(checkUsername("  Alice \n")).toEqual({ ok: true, username: "Alice" });
    expect(normalizeUsername(" Bob ")).toBe("Bob");
  });

  it("refuse une valeur qui n'est pas une chaîne", () => {
    expect(checkUsername(42)).toEqual({ ok: false, error: "notAString" });
    expect(checkUsername(null)).toEqual({ ok: false, error: "notAString" });
    expect(isValidUsername(undefined)).toBe(false);
  });
});
