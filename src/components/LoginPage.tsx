import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'login' | 'register';

export function LoginPage() {
  const { login, register, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    // Validation basique côté client
    if (!email.trim() || !password.trim()) {
      setLocalError('Email et mot de passe obligatoires');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      setLocalError('Le nom est obligatoire');
      return;
    }
    if (password.length < 8) {
      setLocalError('Le mot de passe doit faire au moins 8 caractères');
      return;
    }

    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ name, email, password });
      }
      navigate('/', { replace: true });
    } catch {
      // L'erreur est déjà gérée dans le contexte
    }
  };

  const displayError = localError ?? error;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / En-tête */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <span className="text-3xl">🚀</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {mode === 'login' ? 'Connexion' : 'Créer un compte'}
          </h1>
          <p className="text-gray-500 mt-1">
            {mode === 'login'
              ? 'Accédez à votre espace de travail'
              : 'Rejoignez votre équipe sur Atlassian Clone'
            }
          </p>
        </div>

        {/* Formulaire */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Champ Nom (inscription seulement) */}
            {mode === 'register' && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Nom complet
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alice Martin"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isLoading}
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Adresse email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alice@example.com"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
            </div>

            {/* Mot de passe */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Minimum 8 caractères' : '••••••••'}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
            </div>

            {/* Message d'erreur */}
            {displayError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {displayError}
              </div>
            )}

            {/* Bouton de soumission */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading
                ? (mode === 'login' ? 'Connexion…' : 'Création…')
                : (mode === 'login' ? 'Se connecter' : 'Créer le compte')
              }
            </button>
          </form>

          {/* Lien de bascule login/register */}
          <div className="mt-6 text-center text-sm text-gray-500">
            {mode === 'login' ? (
              <>
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); clearError(); setLocalError(null); }}
                  className="text-blue-600 font-medium hover:underline"
                >
                  Créer un compte
                </button>
              </>
            ) : (
              <>
                Déjà un compte ?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); clearError(); setLocalError(null); }}
                  className="text-blue-600 font-medium hover:underline"
                >
                  Se connecter
                </button>
              </>
            )}
          </div>

          {/* Compte de démo */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-center text-xs text-gray-400 mb-3">Compte de démonstration</p>
            <button
              type="button"
              onClick={() => {
                setEmail('alice@example.com');
                setPassword('password123');
                setMode('login');
                clearError();
                setLocalError(null);
              }}
              className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-lg transition-colors"
            >
              Utiliser alice@example.com / password123
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
