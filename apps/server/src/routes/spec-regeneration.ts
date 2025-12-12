/**
 * Spec Regeneration routes - HTTP API for AI-powered spec generation
 */

import { Router, type Request, type Response } from "express";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import fs from "fs/promises";
import type { EventEmitter } from "../lib/events.js";

let isRunning = false;
let currentAbortController: AbortController | null = null;

// Helper to log authentication status
function logAuthStatus(context: string): void {
  const hasOAuthToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  
  console.log(`[SpecRegeneration] ${context} - Auth Status:`);
  console.log(`[SpecRegeneration]   CLAUDE_CODE_OAUTH_TOKEN: ${hasOAuthToken ? 'SET (' + process.env.CLAUDE_CODE_OAUTH_TOKEN?.substring(0, 20) + '...)' : 'NOT SET'}`);
  console.log(`[SpecRegeneration]   ANTHROPIC_API_KEY: ${hasApiKey ? 'SET (' + process.env.ANTHROPIC_API_KEY?.substring(0, 20) + '...)' : 'NOT SET'}`);
  
  if (!hasOAuthToken && !hasApiKey) {
    console.error(`[SpecRegeneration] ⚠️  WARNING: No authentication configured! SDK will fail.`);
  }
}

export function createSpecRegenerationRoutes(events: EventEmitter): Router {
  const router = Router();

  // Create project spec from overview
  router.post("/create", async (req: Request, res: Response) => {
    console.log("[SpecRegeneration] ========== /create endpoint called ==========");
    console.log("[SpecRegeneration] Request body:", JSON.stringify(req.body, null, 2));
    
    try {
      const { projectPath, projectOverview, generateFeatures } = req.body as {
        projectPath: string;
        projectOverview: string;
        generateFeatures?: boolean;
      };

      console.log(`[SpecRegeneration] Parsed params:`);
      console.log(`[SpecRegeneration]   projectPath: ${projectPath}`);
      console.log(`[SpecRegeneration]   projectOverview length: ${projectOverview?.length || 0} chars`);
      console.log(`[SpecRegeneration]   generateFeatures: ${generateFeatures}`);

      if (!projectPath || !projectOverview) {
        console.error("[SpecRegeneration] Missing required parameters");
        res.status(400).json({
          success: false,
          error: "projectPath and projectOverview required",
        });
        return;
      }

      if (isRunning) {
        console.warn("[SpecRegeneration] Generation already running, rejecting request");
        res.json({ success: false, error: "Spec generation already running" });
        return;
      }

      logAuthStatus("Before starting generation");

      isRunning = true;
      currentAbortController = new AbortController();
      console.log("[SpecRegeneration] Starting background generation task...");

      // Start generation in background
      generateSpec(
        projectPath,
        projectOverview,
        events,
        currentAbortController,
        generateFeatures
      )
        .catch((error) => {
          console.error("[SpecRegeneration] ❌ Generation failed with error:");
          console.error("[SpecRegeneration] Error name:", error?.name);
          console.error("[SpecRegeneration] Error message:", error?.message);
          console.error("[SpecRegeneration] Error stack:", error?.stack);
          console.error("[SpecRegeneration] Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
          events.emit("spec-regeneration:event", {
            type: "spec_error",
            error: error.message || String(error),
          });
        })
        .finally(() => {
          console.log("[SpecRegeneration] Generation task finished (success or error)");
          isRunning = false;
          currentAbortController = null;
        });

      console.log("[SpecRegeneration] Returning success response (generation running in background)");
      res.json({ success: true });
    } catch (error) {
      console.error("[SpecRegeneration] ❌ Route handler exception:");
      console.error("[SpecRegeneration] Error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Generate from project definition
  router.post("/generate", async (req: Request, res: Response) => {
    console.log("[SpecRegeneration] ========== /generate endpoint called ==========");
    console.log("[SpecRegeneration] Request body:", JSON.stringify(req.body, null, 2));
    
    try {
      const { projectPath, projectDefinition } = req.body as {
        projectPath: string;
        projectDefinition: string;
      };

      console.log(`[SpecRegeneration] Parsed params:`);
      console.log(`[SpecRegeneration]   projectPath: ${projectPath}`);
      console.log(`[SpecRegeneration]   projectDefinition length: ${projectDefinition?.length || 0} chars`);

      if (!projectPath || !projectDefinition) {
        console.error("[SpecRegeneration] Missing required parameters");
        res.status(400).json({
          success: false,
          error: "projectPath and projectDefinition required",
        });
        return;
      }

      if (isRunning) {
        console.warn("[SpecRegeneration] Generation already running, rejecting request");
        res.json({ success: false, error: "Spec generation already running" });
        return;
      }

      logAuthStatus("Before starting generation");

      isRunning = true;
      currentAbortController = new AbortController();
      console.log("[SpecRegeneration] Starting background generation task...");

      generateSpec(
        projectPath,
        projectDefinition,
        events,
        currentAbortController,
        false
      )
        .catch((error) => {
          console.error("[SpecRegeneration] ❌ Generation failed with error:");
          console.error("[SpecRegeneration] Error name:", error?.name);
          console.error("[SpecRegeneration] Error message:", error?.message);
          console.error("[SpecRegeneration] Error stack:", error?.stack);
          console.error("[SpecRegeneration] Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
          events.emit("spec-regeneration:event", {
            type: "spec_error",
            error: error.message || String(error),
          });
        })
        .finally(() => {
          console.log("[SpecRegeneration] Generation task finished (success or error)");
          isRunning = false;
          currentAbortController = null;
        });

      console.log("[SpecRegeneration] Returning success response (generation running in background)");
      res.json({ success: true });
    } catch (error) {
      console.error("[SpecRegeneration] ❌ Route handler exception:");
      console.error("[SpecRegeneration] Error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Generate features from existing spec
  router.post("/generate-features", async (req: Request, res: Response) => {
    console.log("[SpecRegeneration] ========== /generate-features endpoint called ==========");
    console.log("[SpecRegeneration] Request body:", JSON.stringify(req.body, null, 2));
    
    try {
      const { projectPath } = req.body as { projectPath: string };

      console.log(`[SpecRegeneration] projectPath: ${projectPath}`);

      if (!projectPath) {
        console.error("[SpecRegeneration] Missing projectPath parameter");
        res.status(400).json({ success: false, error: "projectPath required" });
        return;
      }

      if (isRunning) {
        console.warn("[SpecRegeneration] Generation already running, rejecting request");
        res.json({ success: false, error: "Generation already running" });
        return;
      }

      logAuthStatus("Before starting feature generation");

      isRunning = true;
      currentAbortController = new AbortController();
      console.log("[SpecRegeneration] Starting background feature generation task...");

      generateFeaturesFromSpec(projectPath, events, currentAbortController)
        .catch((error) => {
          console.error("[SpecRegeneration] ❌ Feature generation failed with error:");
          console.error("[SpecRegeneration] Error name:", error?.name);
          console.error("[SpecRegeneration] Error message:", error?.message);
          console.error("[SpecRegeneration] Error stack:", error?.stack);
          console.error("[SpecRegeneration] Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
          events.emit("spec-regeneration:event", {
            type: "features_error",
            error: error.message || String(error),
          });
        })
        .finally(() => {
          console.log("[SpecRegeneration] Feature generation task finished (success or error)");
          isRunning = false;
          currentAbortController = null;
        });

      console.log("[SpecRegeneration] Returning success response (generation running in background)");
      res.json({ success: true });
    } catch (error) {
      console.error("[SpecRegeneration] ❌ Route handler exception:");
      console.error("[SpecRegeneration] Error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Stop generation
  router.post("/stop", async (_req: Request, res: Response) => {
    try {
      if (currentAbortController) {
        currentAbortController.abort();
      }
      isRunning = false;
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Get status
  router.get("/status", async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, isRunning });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

async function generateSpec(
  projectPath: string,
  projectOverview: string,
  events: EventEmitter,
  abortController: AbortController,
  generateFeatures?: boolean
) {
  console.log("[SpecRegeneration] ========== generateSpec() started ==========");
  console.log(`[SpecRegeneration] projectPath: ${projectPath}`);
  console.log(`[SpecRegeneration] projectOverview length: ${projectOverview.length} chars`);
  console.log(`[SpecRegeneration] generateFeatures: ${generateFeatures}`);
  
  const prompt = `You are helping to define a software project specification.

Project Overview:
${projectOverview}

Based on this overview, analyze the project and create a comprehensive specification that includes:

1. **Project Summary** - Brief description of what the project does
2. **Core Features** - Main functionality the project needs
3. **Technical Stack** - Recommended technologies and frameworks
4. **Architecture** - High-level system design
5. **Data Models** - Key entities and their relationships
6. **API Design** - Main endpoints/interfaces needed
7. **User Experience** - Key user flows and interactions

${generateFeatures ? `
Also generate a list of features to implement. For each feature provide:
- ID (lowercase-hyphenated)
- Title
- Description
- Priority (1=high, 2=medium, 3=low)
- Estimated complexity (simple, moderate, complex)
` : ""}

Format your response as markdown. Be specific and actionable.`;

  console.log(`[SpecRegeneration] Prompt length: ${prompt.length} chars`);
  
  events.emit("spec-regeneration:event", {
    type: "spec_progress",
    content: "Starting spec generation...\n",
  });

  const options: Options = {
    model: "claude-opus-4-5-20251101",
    maxTurns: 10,
    cwd: projectPath,
    allowedTools: ["Read", "Glob", "Grep"],
    permissionMode: "acceptEdits",
    abortController,
  };

  console.log("[SpecRegeneration] SDK Options:", JSON.stringify(options, null, 2));
  console.log("[SpecRegeneration] Calling Claude Agent SDK query()...");
  
  // Log auth status right before the SDK call
  logAuthStatus("Right before SDK query()");

  let stream;
  try {
    stream = query({ prompt, options });
    console.log("[SpecRegeneration] query() returned stream successfully");
  } catch (queryError) {
    console.error("[SpecRegeneration] ❌ query() threw an exception:");
    console.error("[SpecRegeneration] Error:", queryError);
    throw queryError;
  }

  let responseText = "";
  let messageCount = 0;

  console.log("[SpecRegeneration] Starting to iterate over stream...");

  try {
    for await (const msg of stream) {
      messageCount++;
      console.log(`[SpecRegeneration] Stream message #${messageCount}:`, JSON.stringify({ type: msg.type, subtype: (msg as any).subtype }, null, 2));
      
      if (msg.type === "assistant" && msg.message.content) {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            responseText = block.text;
            console.log(`[SpecRegeneration] Text block received (${block.text.length} chars)`);
            events.emit("spec-regeneration:event", {
              type: "spec_progress",
              content: block.text,
            });
          } else if (block.type === "tool_use") {
            console.log(`[SpecRegeneration] Tool use: ${block.name}`);
            events.emit("spec-regeneration:event", {
              type: "spec_tool",
              tool: block.name,
              input: block.input,
            });
          }
        }
      } else if (msg.type === "result" && (msg as any).subtype === "success") {
        console.log("[SpecRegeneration] Received success result");
        responseText = (msg as any).result || responseText;
      } else if (msg.type === "error") {
        console.error("[SpecRegeneration] ❌ Received error message from stream:");
        console.error("[SpecRegeneration] Error message:", JSON.stringify(msg, null, 2));
      }
    }
  } catch (streamError) {
    console.error("[SpecRegeneration] ❌ Error while iterating stream:");
    console.error("[SpecRegeneration] Stream error:", streamError);
    throw streamError;
  }

  console.log(`[SpecRegeneration] Stream iteration complete. Total messages: ${messageCount}`);
  console.log(`[SpecRegeneration] Response text length: ${responseText.length} chars`);

  // Save spec
  const specDir = path.join(projectPath, ".automaker");
  const specPath = path.join(specDir, "app_spec.txt");

  console.log(`[SpecRegeneration] Saving spec to: ${specPath}`);
  
  await fs.mkdir(specDir, { recursive: true });
  await fs.writeFile(specPath, responseText);

  console.log("[SpecRegeneration] Spec saved successfully");

  events.emit("spec-regeneration:event", {
    type: "spec_complete",
    specPath,
    content: responseText,
  });

  // If generate features was requested, parse and create them
  if (generateFeatures) {
    console.log("[SpecRegeneration] Starting feature generation...");
    await parseAndCreateFeatures(projectPath, responseText, events);
  }
  
  console.log("[SpecRegeneration] ========== generateSpec() completed ==========");
}

async function generateFeaturesFromSpec(
  projectPath: string,
  events: EventEmitter,
  abortController: AbortController
) {
  console.log("[SpecRegeneration] ========== generateFeaturesFromSpec() started ==========");
  console.log(`[SpecRegeneration] projectPath: ${projectPath}`);
  
  // Read existing spec
  const specPath = path.join(projectPath, ".automaker", "app_spec.txt");
  let spec: string;

  console.log(`[SpecRegeneration] Reading spec from: ${specPath}`);

  try {
    spec = await fs.readFile(specPath, "utf-8");
    console.log(`[SpecRegeneration] Spec loaded successfully (${spec.length} chars)`);
  } catch (readError) {
    console.error("[SpecRegeneration] ❌ Failed to read spec file:", readError);
    events.emit("spec-regeneration:event", {
      type: "features_error",
      error: "No project spec found. Generate spec first.",
    });
    return;
  }

  const prompt = `Based on this project specification:

${spec}

Generate a prioritized list of implementable features. For each feature provide:

1. **id**: A unique lowercase-hyphenated identifier
2. **title**: Short descriptive title
3. **description**: What this feature does (2-3 sentences)
4. **priority**: 1 (high), 2 (medium), or 3 (low)
5. **complexity**: "simple", "moderate", or "complex"
6. **dependencies**: Array of feature IDs this depends on (can be empty)

Format as JSON:
{
  "features": [
    {
      "id": "feature-id",
      "title": "Feature Title",
      "description": "What it does",
      "priority": 1,
      "complexity": "moderate",
      "dependencies": []
    }
  ]
}

Generate 5-15 features that build on each other logically.`;

  console.log(`[SpecRegeneration] Prompt length: ${prompt.length} chars`);

  events.emit("spec-regeneration:event", {
    type: "features_progress",
    content: "Analyzing spec and generating features...\n",
  });

  const options: Options = {
    model: "claude-sonnet-4-20250514",
    maxTurns: 5,
    cwd: projectPath,
    allowedTools: ["Read", "Glob"],
    permissionMode: "acceptEdits",
    abortController,
  };

  console.log("[SpecRegeneration] SDK Options:", JSON.stringify(options, null, 2));
  console.log("[SpecRegeneration] Calling Claude Agent SDK query() for features...");
  
  logAuthStatus("Right before SDK query() for features");

  let stream;
  try {
    stream = query({ prompt, options });
    console.log("[SpecRegeneration] query() returned stream successfully");
  } catch (queryError) {
    console.error("[SpecRegeneration] ❌ query() threw an exception:");
    console.error("[SpecRegeneration] Error:", queryError);
    throw queryError;
  }

  let responseText = "";
  let messageCount = 0;

  console.log("[SpecRegeneration] Starting to iterate over feature stream...");

  try {
    for await (const msg of stream) {
      messageCount++;
      console.log(`[SpecRegeneration] Feature stream message #${messageCount}:`, JSON.stringify({ type: msg.type, subtype: (msg as any).subtype }, null, 2));
      
      if (msg.type === "assistant" && msg.message.content) {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            responseText = block.text;
            console.log(`[SpecRegeneration] Feature text block received (${block.text.length} chars)`);
            events.emit("spec-regeneration:event", {
              type: "features_progress",
              content: block.text,
            });
          }
        }
      } else if (msg.type === "result" && (msg as any).subtype === "success") {
        console.log("[SpecRegeneration] Received success result for features");
        responseText = (msg as any).result || responseText;
      } else if (msg.type === "error") {
        console.error("[SpecRegeneration] ❌ Received error message from feature stream:");
        console.error("[SpecRegeneration] Error message:", JSON.stringify(msg, null, 2));
      }
    }
  } catch (streamError) {
    console.error("[SpecRegeneration] ❌ Error while iterating feature stream:");
    console.error("[SpecRegeneration] Stream error:", streamError);
    throw streamError;
  }

  console.log(`[SpecRegeneration] Feature stream complete. Total messages: ${messageCount}`);
  console.log(`[SpecRegeneration] Feature response length: ${responseText.length} chars`);

  await parseAndCreateFeatures(projectPath, responseText, events);
  
  console.log("[SpecRegeneration] ========== generateFeaturesFromSpec() completed ==========");
}

async function parseAndCreateFeatures(
  projectPath: string,
  content: string,
  events: EventEmitter
) {
  console.log("[SpecRegeneration] ========== parseAndCreateFeatures() started ==========");
  console.log(`[SpecRegeneration] Content length: ${content.length} chars`);
  
  try {
    // Extract JSON from response
    console.log("[SpecRegeneration] Extracting JSON from response...");
    const jsonMatch = content.match(/\{[\s\S]*"features"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[SpecRegeneration] ❌ No valid JSON found in response");
      console.error("[SpecRegeneration] Content preview:", content.substring(0, 500));
      throw new Error("No valid JSON found in response");
    }

    console.log(`[SpecRegeneration] JSON match found (${jsonMatch[0].length} chars)`);
    
    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[SpecRegeneration] Parsed ${parsed.features?.length || 0} features`);
    
    const featuresDir = path.join(projectPath, ".automaker", "features");
    await fs.mkdir(featuresDir, { recursive: true });

    const createdFeatures: Array<{ id: string; title: string }> = [];

    for (const feature of parsed.features) {
      console.log(`[SpecRegeneration] Creating feature: ${feature.id}`);
      const featureDir = path.join(featuresDir, feature.id);
      await fs.mkdir(featureDir, { recursive: true });

      const featureData = {
        id: feature.id,
        title: feature.title,
        description: feature.description,
        status: "pending",
        priority: feature.priority || 2,
        complexity: feature.complexity || "moderate",
        dependencies: feature.dependencies || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await fs.writeFile(
        path.join(featureDir, "feature.json"),
        JSON.stringify(featureData, null, 2)
      );

      createdFeatures.push({ id: feature.id, title: feature.title });
    }

    console.log(`[SpecRegeneration] ✓ Created ${createdFeatures.length} features successfully`);

    events.emit("spec-regeneration:event", {
      type: "features_complete",
      features: createdFeatures,
      count: createdFeatures.length,
    });
  } catch (error) {
    console.error("[SpecRegeneration] ❌ parseAndCreateFeatures() failed:");
    console.error("[SpecRegeneration] Error:", error);
    events.emit("spec-regeneration:event", {
      type: "features_error",
      error: (error as Error).message,
    });
  }
  
  console.log("[SpecRegeneration] ========== parseAndCreateFeatures() completed ==========");
}
