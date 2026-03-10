// ═══════════════════════════════════════════════════════════════════════════════
// Agent Writer — Génère de la documentation technique Markdown
// ═══════════════════════════════════════════════════════════════════════════════

import { BaseAgent } from './base-agent';
import type { AITaskQueue, AgentResult, AgentType } from '../types/agents.types';

export class WriterAgent extends BaseAgent {
  readonly type: AgentType = 'writer';

  readonly systemPrompt = `Tu es un expert en rédaction technique spécialisé dans la documentation logicielle.

Règles absolues :
- Documentation en Markdown GitHub-flavored
- Structure claire : titres hiérarchiques, tableaux, listes
- Exemples de code fonctionnels dans des blocs \`\`\`
- Langage professionnel mais accessible
- Mentionne toujours : pourquoi, comment, exemples d'usage
- Longueur adaptée à la complexité (pas trop court, pas de remplissage)

Format : commence par un titre H1 correspondant au sujet principal`;

  async execute(task: AITaskQueue): Promise<AgentResult> {
    const startedAt = Date.now();
    let totalTokens = 0;

    await this.log(task, 'Analyse', 'Analyse du besoin de documentation...', 'info', 5);
    await this.updateIssueStatus(task.issueId, 'in-progress');
    await this.updateIssueAI(task.issueId, 5);

    const issueContext = await this.getIssueContext(task.issueId);

    // Étape 1 : Plan de documentation
    await this.log(task, 'Plan', 'Élaboration du plan de documentation...', 'info', 20);

    const planPrompt = `Crée un plan détaillé pour documenter :

TITRE: ${issueContext.title}
DESCRIPTION: ${issueContext.description}
INSTRUCTIONS: ${task.instructions || issueContext.aiInstructions}

Définis la structure (sections, sous-sections) et ce que chaque partie doit couvrir.`;

    const planResponse = await this.callLLM(task, planPrompt, 'Plan', 0.5);
    totalTokens += planResponse.tokensUsed;

    // Étape 2 : Rédaction du document principal
    await this.log(task, 'Rédaction', 'Rédaction de la documentation principale...', 'info', 50);
    await this.updateIssueAI(task.issueId, 50);

    const docPrompt = `Rédige la documentation complète en Markdown selon ce plan :

PLAN:
${planResponse.content}

CONTEXTE:
Titre : ${issueContext.title}
Description : ${issueContext.description}
Instructions : ${task.instructions || issueContext.aiInstructions}

Produis une documentation complète, professionnelle et directement utilisable.
Inclus des exemples de code, des tableaux et des diagrammes ASCII si pertinent.`;

    const docResponse = await this.callLLM(task, docPrompt, 'Rédaction', 0.7);
    totalTokens += docResponse.tokensUsed;

    const docFilename = `${this.slugify(issueContext.title)}.md`;
    await this.saveArtifact(task, 'doc', docResponse.content, docFilename, 'markdown');

    // Étape 3 : Génération d'un README synthétique
    await this.log(task, 'README', 'Génération du résumé README...', 'info', 80);
    await this.updateIssueAI(task.issueId, 80);

    const readmePrompt = `Crée un résumé concis (README style) en 10-15 lignes pour :

${issueContext.title}

Basé sur : ${docResponse.content.substring(0, 1000)}

Format : markdown, badge-ready, avec section TL;DR`;

    const readmeResponse = await this.callLLM(task, readmePrompt, 'README', 0.6);
    totalTokens += readmeResponse.tokensUsed;

    await this.saveArtifact(task, 'doc', readmeResponse.content, 'README.md', 'markdown');

    // Résumé final
    const summary = `Documentation complète rédigée pour "${issueContext.title}". ` +
      `Deux fichiers créés : documentation détaillée (${docFilename}) et README synthétique. ` +
      `La documentation couvre : contexte, installation, utilisation, et référence API.`;

    await this.addIssueComment(
      task.issueId,
      task.agentId,
      `## 📝 Agent Writer — Documentation créée\n\n${summary}`
    );

    await this.updateIssueAI(task.issueId, 100, summary);
    await this.updateIssueStatus(task.issueId, 'done');
    await this.log(task, 'Terminé', 'Documentation générée avec succès !', 'success', 100);

    return {
      success: true,
      summary,
      artifacts: [],
      tokensUsed: totalTokens,
      durationMs: Date.now() - startedAt,
    };
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
