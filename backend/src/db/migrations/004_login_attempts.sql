-- Migration 004 — Verrouillage de compte après tentatives de connexion échouées
-- Ajoute les colonnes de suivi des tentatives échouées sur la table users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMPTZ;
