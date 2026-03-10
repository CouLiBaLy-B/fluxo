// ═══════════════════════════════════════════════════════════════════════════════
// Agent Architect — Conception d'architectures logicielles robustes
// ═══════════════════════════════════════════════════════════════════════════════

import { BaseAgent } from './base-agent';
import type { AITaskQueue, AgentResult, AgentType } from '../types/agents.types';

export class ArchitectAgent extends BaseAgent {
  readonly type: AgentType = 'architect';

  readonly systemPrompt = `Tu es un architecte logiciel senior avec 15+ ans d'expérience en systèmes distribués.

Règles absolues :
- Architectures scalables, maintenables et testables
- Respecte les principes SOLID et Clean Architecture
- Diagrammes ASCII clairs et précis
- Considère toujours : sécurité, performance, observabilité
- Adapte la complexité aux contraintes du projet (startup ≠ enterprise)
- Justifie chaque décision architecturale

Format :
1. Vue d'ensemble (1 paragraphe)
2. Diagramme ASCII de l'architecture
3. Composants et leurs responsabilités
4. Flux de données
5. Décisions clés et alternatives écartées
6. Prochaines étapes`;

  async execute(task: AITaskQueue): Promise<AgentResult> {
    const startedAt = Date.now();
    let totalTokens = 0;

    await this.log(task, 'Analyse', 'Analyse des exigences architecturales...', 'info', 5);
    await this.updateIssueStatus(task.issueId, 'in-progress');
    await this.updateIssueAI(task.issueId, 5);

    const issueContext = await this.getIssueContext(task.issueId);

    // Étape 1 : Analyse des contraintes
    await this.log(task, 'Contraintes', 'Analyse des contraintes et exigences...', 'info', 20);

    const constraintsPrompt = `Analyse les contraintes architecturales pour :

TITRE: ${issueContext.title}
DESCRIPTION: ${issueContext.description}
INSTRUCTIONS: ${task.instructions || issueContext.aiInstructions}

Identifie :
- Exigences fonctionnelles clés
- Exigences non-fonctionnelles (performance, sécurité, scalabilité)
- Contraintes techniques (stack existante : React 19, Node.js, PostgreSQL)
- Patterns architecturaux applicables`;

    const constraintsResponse = await this.callLLM(task, constraintsPrompt, 'Contraintes', 0.3);
    totalTokens += constraintsResponse.tokensUsed;

    // Étape 2 : Conception de l'architecture
    await this.log(task, 'Conception', 'Conception de l\'architecture cible...', 'info', 45);
    await this.updateIssueAI(task.issueId, 45);

    const designPrompt = `Conçois l'architecture pour ce système basé sur :

CONTRAINTES:
${constraintsResponse.content}

CONTEXTE: Stack actuelle = React 19 + TypeScript + Node.js Express + PostgreSQL

Fournis :
1. Architecture en couches avec diagramme ASCII
2. Définition de chaque composant (responsabilité unique)
3. Interfaces entre composants
4. Stratégie de gestion des erreurs
5. Pattern de déploiement recommandé`;

    const designResponse = await this.callLLM(task, designPrompt, 'Conception', 0.3);
    totalTokens += designResponse.tokensUsed;

    // Étape 3 : Documentation des ADRs (Architecture Decision Records)
    await this.log(task, 'ADR', 'Rédaction des Architecture Decision Records...', 'info', 70);
    await this.updateIssueAI(task.issueId, 70);

    const adrPrompt = `Rédige 2-3 ADRs (Architecture Decision Records) pour les décisions clés de :

${designResponse.content.substring(0, 1500)}

Format ADR standard :
- Titre
- Contexte
- Décision
- Conséquences
- Alternatives écartées`;

    const adrResponse = await this.callLLM(task, adrPrompt, 'ADR', 0.4);
    totalTokens += adrResponse.tokensUsed;

    // Sauvegarder les artefacts
    await this.saveArtifact(
      task, 'diagram',
      designResponse.content,
      'architecture-design.md', 'markdown'
    );

    await this.saveArtifact(
      task, 'doc',
      adrResponse.content,
      'architecture-decisions.md', 'markdown'
    );

    // Résumé
    const summary = `Architecture conçue pour "${issueContext.title}". ` +
      `Design document créé avec diagrammes et décisions architecturales (ADRs). ` +
      `Stack recommandée compatible avec l'existant (React 19 + Node.js + PostgreSQL).`;

    await this.addIssueComment(
      task.issueId,
      task.agentId,
      `## 🏗️ Agent Architect — Architecture définie\n\n${summary}`
    );

    await this.updateIssueAI(task.issueId, 100, summary);
    await this.updateIssueStatus(task.issueId, 'done');
    await this.log(task, 'Terminé', 'Architecture conçue avec succès !', 'success', 100);

    return {
      success: true,
      summary,
      artifacts: [],
      tokensUsed: totalTokens,
      durationMs: Date.now() - startedAt,
    };
  }
}
