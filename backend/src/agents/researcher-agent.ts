// ═══════════════════════════════════════════════════════════════════════════════
// Agent Researcher — Analyse des problèmes, veille technologique, recommandations
// ═══════════════════════════════════════════════════════════════════════════════

import { BaseAgent } from './base-agent';
import type { AITaskQueue, AgentResult, AgentType } from '../types/agents.types';

export class ResearcherAgent extends BaseAgent {
  readonly type: AgentType = 'researcher';

  readonly systemPrompt = `Tu es un expert en recherche et analyse technique pour le développement logiciel.

Règles absolues :
- Analyse objective et factuelle, sans parti pris
- Compare toujours au moins 2 approches différentes
- Prends en compte : performance, maintenabilité, coût, complexité
- Fournis des recommandations concrètes et actionnables
- Cite les sources ou standards de l'industrie quand pertinent
- Adapte le niveau de détail à l'audience technique

Format :
1. Résumé exécutif (3 lignes max)
2. Analyse détaillée
3. Comparaison des options
4. Recommandation finale`;

  async execute(task: AITaskQueue): Promise<AgentResult> {
    const startedAt = Date.now();
    let totalTokens = 0;

    await this.log(task, 'Analyse initiale', 'Analyse du problème à étudier...', 'info', 5);
    await this.updateIssueStatus(task.issueId, 'in-progress');
    await this.updateIssueAI(task.issueId, 5);

    const issueContext = await this.getIssueContext(task.issueId);

    // Étape 1 : Cadrage du problème
    await this.log(task, 'Cadrage', 'Cadrage et identification des axes d\'analyse...', 'info', 20);

    const framingPrompt = `Cadre ce problème de recherche :

TITRE: ${issueContext.title}
DESCRIPTION: ${issueContext.description}
INSTRUCTIONS: ${task.instructions || issueContext.aiInstructions}

Identifie :
1. Le problème central
2. Les questions clés à répondre
3. Les contraintes (technique, temps, budget)
4. Les parties prenantes concernées`;

    const framingResponse = await this.callLLM(task, framingPrompt, 'Cadrage', 0.4);
    totalTokens += framingResponse.tokensUsed;

    // Étape 2 : Analyse approfondie
    await this.log(task, 'Analyse approfondie', 'Analyse comparative des solutions...', 'info', 45);
    await this.updateIssueAI(task.issueId, 45);

    const analysisPrompt = `Réalise une analyse approfondie basée sur ce cadrage :

${framingResponse.content}

Pour chaque solution identifiée :
- Avantages et inconvénients
- Complexité d'implémentation (1-5)
- Impact sur les performances
- Coût de maintenance
- Compatibilité avec l'écosystème TypeScript/Node.js/React`;

    const analysisResponse = await this.callLLM(task, analysisPrompt, 'Analyse approfondie', 0.4);
    totalTokens += analysisResponse.tokensUsed;

    // Étape 3 : Rapport final avec recommandations
    await this.log(task, 'Rapport', 'Rédaction du rapport et des recommandations...', 'info', 75);
    await this.updateIssueAI(task.issueId, 75);

    const reportPrompt = `Synthétise l'analyse en un rapport Markdown actionnable :

CADRAGE:
${framingResponse.content}

ANALYSE:
${analysisResponse.content}

Structure le rapport avec :
- Résumé exécutif
- Solutions analysées (tableau comparatif)
- Recommandation principale avec justification
- Plan d'implémentation suggéré (étapes)
- Risques et mitigations`;

    const reportResponse = await this.callLLM(task, reportPrompt, 'Rapport', 0.5);
    totalTokens += reportResponse.tokensUsed;

    await this.saveArtifact(
      task, 'report', reportResponse.content,
      `research-${Date.now()}.md`, 'markdown',
      { issueTitle: issueContext.title, analysisDate: new Date().toISOString() }
    );

    const summary = `Analyse complète réalisée pour "${issueContext.title}". ` +
      `${framingResponse.content.split('\n').length} questions analysées. ` +
      `Rapport avec recommandations disponible dans les artefacts.`;

    await this.addIssueComment(
      task.issueId,
      task.agentId,
      `## 🔍 Agent Researcher — Analyse terminée\n\n${summary}`
    );

    await this.updateIssueAI(task.issueId, 100, summary);
    await this.updateIssueStatus(task.issueId, 'done');
    await this.log(task, 'Terminé', 'Analyse complétée avec succès !', 'success', 100);

    return {
      success: true,
      summary,
      artifacts: [],
      tokensUsed: totalTokens,
      durationMs: Date.now() - startedAt,
    };
  }
}
