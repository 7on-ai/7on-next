// apps/app/lib/northflank-ingress.ts
const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

/**
 * Add ingress permission to shared services (Chroma, Ollama)
 * Appends new project without removing existing ones
 */
export async function addIngressToSharedServices(userProjectId: string) {
  const CHROMA_PROJECT_ID = process.env.CHROMA_PROJECT_ID || 'chroma';
  const OLLAMA_PROJECT_ID = process.env.OLLAMA_PROJECT_ID || 'ollama';
  
  console.log('🔗 Adding ingress for user project:', userProjectId);
  
  // Add to Chroma
  await addIngressToProject(CHROMA_PROJECT_ID, userProjectId, 'Chroma');
  
  // Add to Ollama
  await addIngressToProject(OLLAMA_PROJECT_ID, userProjectId, 'Ollama');
}

/**
 * Helper: Add ingress and merge with existing projects
 */
async function addIngressToProject(
  sharedProjectId: string,
  newProjectId: string,
  serviceName: string
) {
  try {
    // 1. Get current ingress settings
    const getResponse = await fetch(
      `https://api.northflank.com/v1/projects/${sharedProjectId}/settings`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!getResponse.ok) {
      console.error(`❌ Cannot get ${serviceName} project settings`);
      return;
    }

    const projectData = await getResponse.json();
    const existingProjects = projectData.data?.networking?.ingress?.projects || [];

    // 2. Check if already added
    if (existingProjects.includes(newProjectId)) {
      console.log(`ℹ️ ${serviceName}: Already has ingress for ${newProjectId}`);
      return;
    }

    // 3. Append new project to existing list
    const updatedProjects = [...existingProjects, newProjectId];

    const updateResponse = await fetch(
      `https://api.northflank.com/v1/projects/${sharedProjectId}/settings`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networking: {
            ingress: {
              projects: updatedProjects,
            },
          },
        }),
      }
    );

    if (updateResponse.ok) {
      console.log(`✅ ${serviceName}: Ingress added (${updatedProjects.length} total)`);
    } else {
      const error = await updateResponse.text();
      console.error(`❌ ${serviceName}: Ingress update failed:`, error);
    }
  } catch (error) {
    console.error(`❌ ${serviceName}: Ingress error:`, error);
  }
}