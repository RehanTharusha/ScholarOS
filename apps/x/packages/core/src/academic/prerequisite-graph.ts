import type { ConceptPrerequisite } from "@scholaros/shared/dist/academic.js";

export interface ConceptNode {
  id: string;
  title: string;
  relatedConcepts?: string[];
  prerequisites?: string[];
}

export interface LearningPathResult {
  orderedConcepts: string[];
  missingPrerequisites: string[];
  edges: ConceptPrerequisite[];
}

export class PrerequisiteGraph {
  buildEdges(concepts: ConceptNode[]): ConceptPrerequisite[] {
    const knownIds = new Set(concepts.map((concept) => concept.id));
    const edges: ConceptPrerequisite[] = [];

    for (const concept of concepts) {
      for (const prereq of concept.prerequisites ?? []) {
        if (!knownIds.has(prereq)) continue;
        edges.push({
          conceptId: concept.id,
          prerequisiteId: prereq,
          description: `${prereq} should be understood before ${concept.id}`,
        });
      }
    }

    return edges;
  }

  buildLearningPath(
    targetConceptId: string,
    concepts: ConceptNode[],
  ): LearningPathResult {
    const byId = new Map(concepts.map((concept) => [concept.id, concept]));
    const ordered: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const missing = new Set<string>();

    const visit = (conceptId: string) => {
      if (visited.has(conceptId)) return;
      if (visiting.has(conceptId)) return;
      visiting.add(conceptId);

      const concept = byId.get(conceptId);
      if (!concept) {
        missing.add(conceptId);
        visiting.delete(conceptId);
        return;
      }

      for (const prereq of concept.prerequisites ?? []) {
        visit(prereq);
      }

      visiting.delete(conceptId);
      visited.add(conceptId);
      ordered.push(conceptId);
    };

    visit(targetConceptId);

    return {
      orderedConcepts: ordered,
      missingPrerequisites: [...missing],
      edges: this.buildEdges(concepts),
    };
  }
}
