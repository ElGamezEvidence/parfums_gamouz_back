import { z } from 'zod';

/** Format `utilisateur@domaine` — accepte les identifiants admin GAAMOUZE (ex. abdelaligamouz@1448). */
export const loginIdentifierSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Identifiant trop court.')
  .refine((value) => /^[^\s@]+@[^\s@]+$/.test(value), {
    message: 'Adresse email ou identifiant invalide.',
  });

/** Emails clients (inscription, contact) — validation stricte. */
export const strictEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Adresse email invalide.');
