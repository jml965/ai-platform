import { db } from "@workspace/db";
import { deploymentsTable, projectsTable, projectFilesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

function generateRepoName(projectName: string, projectId: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);

  const shortId = projectId.slice(0, 8);
  return slug ? `${slug}-${shortId}` : `site-${shortId}`;
}

async function githubApi(path: string, options: { method?: string; body?: any } = {}) {
  const res = await connectors.proxy("github", path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok && res.status !== 404 && res.status !== 422) {
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

async function getGitHubUsername(): Promise<string> {
  const { data } = await githubApi("/user");
  return data.login;
}

async function ensureRepo(repoName: string): Promise<{ owner: string; repo: string; created: boolean }> {
  const owner = await getGitHubUsername();

  const check = await githubApi(`/repos/${owner}/${repoName}`);
  if (check.status === 200) {
    return { owner, repo: repoName, created: false };
  }

  await githubApi("/user/repos", {
    method: "POST",
    body: {
      name: repoName,
      description: "Deployed via AI Website Builder",
      homepage: `https://${owner}.github.io/${repoName}`,
      auto_init: true,
      private: false,
    },
  });

  return { owner, repo: repoName, created: true };
}

function base64Encode(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64");
}

async function pushFilesToRepo(
  owner: string,
  repo: string,
  files: { filePath: string; content: string }[]
) {
  const refRes = await githubApi(`/repos/${owner}/${repo}/git/ref/heads/main`);
  let baseSha: string;

  if (refRes.status === 200) {
    baseSha = refRes.data.object.sha;
  } else {
    const masterRef = await githubApi(`/repos/${owner}/${repo}/git/ref/heads/master`);
    if (masterRef.status === 200) {
      baseSha = masterRef.data.object.sha;
    } else {
      throw new Error("Could not find default branch");
    }
  }

  const baseCommit = await githubApi(`/repos/${owner}/${repo}/git/commits/${baseSha}`);
  const baseTreeSha = baseCommit.data.tree.sha;

  const treeItems = files.map(f => ({
    path: f.filePath.replace(/^\//, ""),
    mode: "100644" as const,
    type: "blob" as const,
    content: f.content,
  }));

  const treeRes = await githubApi(`/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: { base_tree: baseTreeSha, tree: treeItems },
  });

  const commitRes = await githubApi(`/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: {
      message: `Deploy from AI Website Builder - ${new Date().toISOString()}`,
      tree: treeRes.data.sha,
      parents: [baseSha],
    },
  });

  const updateRefPath = refRes.status === 200
    ? `/repos/${owner}/${repo}/git/refs/heads/main`
    : `/repos/${owner}/${repo}/git/refs/heads/master`;

  await githubApi(updateRefPath, {
    method: "PATCH",
    body: { sha: commitRes.data.sha, force: true },
  });
}

async function enableGitHubPages(owner: string, repo: string) {
  const pagesCheck = await githubApi(`/repos/${owner}/${repo}/pages`);
  if (pagesCheck.status === 200) {
    return;
  }

  await githubApi(`/repos/${owner}/${repo}/pages`, {
    method: "POST",
    body: {
      source: { branch: "main", path: "/" },
    },
  });
}

export async function deployProject(projectId: string, userId: string) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  if (!project) throw new Error("Project not found");
  if (project.userId !== userId) throw new Error("Access denied");
  if (project.status !== "ready") throw new Error("Project must be in 'ready' status to deploy");

  const files = await db
    .select()
    .from(projectFilesTable)
    .where(eq(projectFilesTable.projectId, projectId));

  if (files.length === 0) throw new Error("No files found in project to deploy");

  const [existing] = await db
    .select()
    .from(deploymentsTable)
    .where(eq(deploymentsTable.projectId, projectId))
    .limit(1);

  const repoName = existing?.subdomain || generateRepoName(project.name, projectId);

  if (existing) {
    const newVersion = (existing.version ?? 1) + 1;
    await db
      .update(deploymentsTable)
      .set({ status: "deploying", version: newVersion, lastDeployedAt: new Date(), updatedAt: new Date() })
      .where(eq(deploymentsTable.id, existing.id));

    try {
      const { owner, repo } = await ensureRepo(repoName);
      const deployableFiles = files.map(f => ({
        filePath: f.filePath,
        content: f.content ?? "",
      }));
      await pushFilesToRepo(owner, repo, deployableFiles);
      await enableGitHubPages(owner, repo);

      const url = `https://${owner}.github.io/${repo}`;
      const [updated] = await db
        .update(deploymentsTable)
        .set({ status: "active", url, updatedAt: new Date() })
        .where(eq(deploymentsTable.id, existing.id))
        .returning();

      return { ...updated, projectName: project.name };
    } catch (err) {
      console.error("Deploy failed:", err);
      await db
        .update(deploymentsTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(deploymentsTable.id, existing.id));
      throw new Error(`Deployment failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  const [deployment] = await db
    .insert(deploymentsTable)
    .values({
      projectId,
      userId,
      subdomain: repoName,
      url: "",
      status: "deploying",
      version: 1,
      lastDeployedAt: new Date(),
    })
    .returning();

  try {
    const { owner, repo } = await ensureRepo(repoName);
    const deployableFiles = files.map(f => ({
      filePath: f.filePath,
      content: f.content ?? "",
    }));
    await pushFilesToRepo(owner, repo, deployableFiles);
    await enableGitHubPages(owner, repo);

    const url = `https://${owner}.github.io/${repo}`;
    const [updated] = await db
      .update(deploymentsTable)
      .set({ status: "active", url, updatedAt: new Date() })
      .where(eq(deploymentsTable.id, deployment.id))
      .returning();

    return { ...updated, projectName: project.name };
  } catch (err) {
    console.error("Deploy failed:", err);
    await db
      .update(deploymentsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(deploymentsTable.id, deployment.id));
    throw new Error(`Deployment failed: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
}

export async function undeployProject(projectId: string, userId: string) {
  const [deployment] = await db
    .select()
    .from(deploymentsTable)
    .where(eq(deploymentsTable.projectId, projectId))
    .limit(1);

  if (!deployment) throw new Error("No deployment found for this project");
  if (deployment.userId !== userId) throw new Error("Access denied");

  await db
    .update(deploymentsTable)
    .set({ status: "stopped", updatedAt: new Date() })
    .where(eq(deploymentsTable.id, deployment.id));

  return { success: true, message: "Project undeployed successfully" };
}

export async function redeployProject(projectId: string, userId: string) {
  const [deployment] = await db
    .select()
    .from(deploymentsTable)
    .where(eq(deploymentsTable.projectId, projectId))
    .limit(1);

  if (!deployment) throw new Error("No deployment found. Deploy the project first.");
  if (deployment.userId !== userId) throw new Error("Access denied");

  return deployProject(projectId, userId);
}

export async function getDeploymentStatus(projectId: string, userId: string) {
  const [deployment] = await db
    .select({
      id: deploymentsTable.id,
      projectId: deploymentsTable.projectId,
      subdomain: deploymentsTable.subdomain,
      url: deploymentsTable.url,
      status: deploymentsTable.status,
      version: deploymentsTable.version,
      lastDeployedAt: deploymentsTable.lastDeployedAt,
      createdAt: deploymentsTable.createdAt,
      projectName: projectsTable.name,
    })
    .from(deploymentsTable)
    .innerJoin(projectsTable, eq(deploymentsTable.projectId, projectsTable.id))
    .where(and(eq(deploymentsTable.projectId, projectId), eq(deploymentsTable.userId, userId)))
    .limit(1);

  return deployment || null;
}

export async function listUserDeployments(userId: string) {
  const deployments = await db
    .select({
      id: deploymentsTable.id,
      projectId: deploymentsTable.projectId,
      subdomain: deploymentsTable.subdomain,
      url: deploymentsTable.url,
      status: deploymentsTable.status,
      version: deploymentsTable.version,
      lastDeployedAt: deploymentsTable.lastDeployedAt,
      createdAt: deploymentsTable.createdAt,
      projectName: projectsTable.name,
    })
    .from(deploymentsTable)
    .innerJoin(projectsTable, eq(deploymentsTable.projectId, projectsTable.id))
    .where(eq(deploymentsTable.userId, userId));

  return deployments;
}
