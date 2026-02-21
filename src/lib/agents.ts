import fs from 'fs/promises';
import path from 'path';

// Define the Agent Profile structure
export interface AgentProfile {
  id: string;
  title: string;
  department: 'Product' | 'Engineering' | 'Research Lab';
  description: string;
  cost_model: 'low' | 'medium' | 'high';
  driver: {
    type: 'cli' | 'llm' | 'code';
    command?: string;
    model?: string;
    args?: string[];
    system_prompt?: string;
  };
}

const AGENTS_DIR = path.join(process.cwd(), 'agents');

// Get all agents from the file system
export async function getAgents(): Promise<AgentProfile[]> {
  try {
    // Ensure agents directory exists
    try {
      await fs.access(AGENTS_DIR);
    } catch {
      return [];
    }

    const folders = await fs.readdir(AGENTS_DIR);
    
    const profiles = await Promise.all(
      folders.map(async (folder) => {
        // Skip hidden files/folders
        if (folder.startsWith('.')) return null;
        
        try {
          const profilePath = path.join(AGENTS_DIR, folder, 'profile.json');
          const content = await fs.readFile(profilePath, 'utf-8');
          const profile = JSON.parse(content) as AgentProfile;
          
          // Ensure ID matches folder name (consistency check)
          return { ...profile, id: folder };
        } catch (e) {
          // Ignore invalid folders or missing profile.json
          return null;
        }
      })
    );

    return profiles.filter((p): p is AgentProfile => p !== null);
  } catch (error) {
    console.error('Failed to load agents:', error);
    return [];
  }
}

// Get a single agent by ID
export async function getAgent(id: string): Promise<AgentProfile | null> {
  try {
    const profilePath = path.join(AGENTS_DIR, id, 'profile.json');
    const content = await fs.readFile(profilePath, 'utf-8');
    return JSON.parse(content) as AgentProfile;
  } catch {
    return null;
  }
}
