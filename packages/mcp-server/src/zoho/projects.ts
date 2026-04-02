import { zohoApi } from "./client.js";
import { getPortalId } from "./portal.js";

export interface ZohoProject {
  id: string;
  name: string;
  status: string;
  description?: string;
}

export async function listProjects(): Promise<ZohoProject[]> {
  const portalId = await getPortalId();
  const resp = await zohoApi.get<{ projects: ZohoProject[] }>(
    `/portal/${portalId}/projects/`
  );
  return resp.data.projects ?? [];
}

/**
 * Simple fuzzy match: returns projects whose name contains the query
 * (case-insensitive), sorted by how close the match is.
 */
export function fuzzyMatchProject(projects: ZohoProject[], query: string): ZohoProject[] {
  const q = query.toLowerCase().trim();
  return projects
    .filter((p) => p.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    });
}
