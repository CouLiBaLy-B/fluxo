import React from 'react';

// ─── Skeleton de base ─────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-[#EBECF0] ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

// ─── Skeleton Page Confluence ─────────────────────────────────────────────────

export function SkeletonPage() {
  return (
    <div className="max-w-[760px] mx-auto px-10 py-8" aria-label="Chargement de la page...">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-2" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-2" />
        <Skeleton className="h-3 w-32" />
      </div>

      {/* Titre de page */}
      <Skeleton className="h-9 w-3/4 mb-3" />

      {/* Métadonnées */}
      <div className="flex items-center gap-3 mb-8">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>

      {/* Contenu paragraphes */}
      <div className="space-y-3 mb-8">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* Titre H2 */}
      <Skeleton className="h-6 w-1/2 mb-4" />

      <div className="space-y-3 mb-8">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>

      {/* Code block simulé */}
      <Skeleton className="h-32 w-full rounded-lg mb-8" style={{ background: '#2D2D3F' }} />

      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

// ─── Skeleton Sidebar ─────────────────────────────────────────────────────────

export function SkeletonSidebar() {
  return (
    <div className="p-3 space-y-1" aria-label="Chargement de la navigation...">
      {/* En-tête espace */}
      <div className="flex items-center gap-2 p-2 mb-3">
        <Skeleton className="h-6 w-6 rounded" />
        <Skeleton className="h-4 w-28" />
      </div>

      {/* Items de navigation */}
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 p-2 rounded">
          <Skeleton className="h-3 w-3 rounded-sm" />
          <Skeleton className="h-3" style={{ width: `${50 + (i * 17) % 80}px` }} />
        </div>
      ))}
    </div>
  );
}
