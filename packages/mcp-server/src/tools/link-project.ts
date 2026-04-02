import { z } from "zod";
import { listProjects, fuzzyMatchProject } from "../zoho/projects.js";
import { writeRepoConfig } from "../config.js";
import { syncToCloud } from "../sync/cloud-sync.js";
import { log } from "../logger.js";

export const linkProjectSchema = z.object({
  project_name: z.string().min(1).describe("Name (or part of the name) of the Zoho project to link"),
});

export async function linkProject(
  input: z.infer<typeof linkProjectSchema>
): Promise<string> {
  log(`Linking project: "${input.project_name}"`);
  const projects = await listProjects();

  if (projects.length === 0) {
    return "No Zoho projects found for your account. Make sure ZOHO_CLIENT_ID/SECRET are correct and you've run `pmsecai-mcp --auth`.";
  }

  const matches = fuzzyMatchProject(projects, input.project_name);

  if (matches.length === 0) {
    const names = projects.map((p) => `• ${p.name}`).join("\n");
    return `No projects matched "${input.project_name}". Available projects:\n${names}`;
  }

  const project = matches[0];

  writeRepoConfig({
    zohoProjectId: project.id,
    zohoProjectName: project.name,
    linkedAt: new Date().toISOString(),
  });

  // Sync to cloud DB
  await syncToCloud("project", {
    zohoProjectId: project.id,
    name: project.name,
    repoName: process.cwd().split(/[/\\]/).pop() ?? "unknown",
    repoPath: process.cwd(),
  }).catch((err) => log(`Project sync failed: ${err}`, "warn"));

  return (
    `✓ Linked to Zoho project: **${project.name}** (ID: ${project.id})\n` +
    `Saved to .pmSecAI.json in the current directory.\n` +
    (matches.length > 1
      ? `\nOther possible matches: ${matches.slice(1, 4).map((p) => p.name).join(", ")}`
      : "")
  );
}
